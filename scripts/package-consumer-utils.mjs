import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

export const repoRoot = process.cwd()
export const compatibilityInputPath = path.join(repoRoot, 'src/test/fixtures/lexicalCompatibility.input.md')
export const compatibilityExpected035Path = path.join(repoRoot, 'src/test/fixtures/lexicalCompatibility.035.md')
const activeProcesses = new Set()

export function phase(message) {
  console.log(`[package-gate] ${message}`)
}

export async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    detached: process.platform !== 'win32',
    stdio: 'inherit'
  })
  activeProcesses.add(child)
  try {
    const [code, signal] = await once(child, 'exit')
    if (code !== 0) {
      throw new Error(`${command} ${args.join(' ')} failed with ${signal ?? `exit ${code}`}`)
    }
  } finally {
    activeProcesses.delete(child)
  }
}

export async function createScratchRoot(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

export async function packCurrentPackage(scratchRoot, cacheRoot) {
  phase('packing the built repository artifact')
  await run('npm', ['pack', '--ignore-scripts', '--cache', cacheRoot, '--pack-destination', scratchRoot])
  const tarballs = (await readdir(scratchRoot)).filter((entry) => entry.endsWith('.tgz'))
  if (tarballs.length !== 1) throw new Error(`Expected one package tarball, found ${tarballs.length}`)
  return path.join(scratchRoot, tarballs[0])
}

export async function createConsumerApp({ scratchRoot, name, manifest, editorDependency, markdown, overrides }) {
  const appRoot = path.join(scratchRoot, name)
  await cp(path.join(repoRoot, 'tests/package-consumer/shared'), appRoot, { recursive: true })
  const packageJson = JSON.parse(await readFile(manifest, 'utf8'))
  packageJson.dependencies['@mdxeditor/editor'] = editorDependency
  if (overrides) packageJson.overrides = overrides
  await writeFile(path.join(appRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  await mkdir(path.join(appRoot, 'src'), { recursive: true })
  await writeFile(path.join(appRoot, 'src/compatibility.md'), markdown)
  return appRoot
}

export async function installAndBuildConsumer(appRoot, cacheRoot, label) {
  phase(`${label}: installing with isolated npm cache`)
  await run('npm', ['install', '--cache', cacheRoot, '--no-audit', '--no-fund'], { cwd: appRoot })
  phase(`${label}: typechecking`)
  await run('npm', ['run', 'typecheck'], { cwd: appRoot })
  phase(`${label}: bundling with Vite`)
  await run('npm', ['run', 'build'], { cwd: appRoot })
}

async function allocatePort() {
  const server = net.createServer()
  server.unref()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (typeof address !== 'object' || address === null) throw new Error('Failed to allocate a preview port')
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return address.port
}

async function waitForPreview(url, child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Preview exited before becoming ready (${child.exitCode})`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function stopProcessGroup(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))])
  if (child.exitCode === null && child.signalCode === null) {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
}

export function installInterruptCleanup(cleanup) {
  let handlingSignal = false
  const handlers = new Map()
  for (const [signal, exitCode] of [
    ['SIGINT', 130],
    ['SIGTERM', 143]
  ]) {
    const handler = () => {
      if (handlingSignal) return
      handlingSignal = true
      void Promise.all([...activeProcesses].map(stopProcessGroup))
        .then(cleanup)
        .finally(() => process.exit(exitCode))
    }
    handlers.set(signal, handler)
    process.once(signal, handler)
  }
  return () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler)
  }
}

export async function captureConsumerMarkdown(appRoot, browser, label) {
  const port = await allocatePort()
  const url = `http://127.0.0.1:${port}`
  phase(`${label}: serving packed consumer on ${url}`)
  const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: appRoot,
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  activeProcesses.add(preview)
  preview.stdout.pipe(process.stdout)
  preview.stderr.pipe(process.stderr)

  let page
  try {
    await waitForPreview(url, preview)
    page = await browser.newPage()
    const runtimeErrors = []
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console.error: ${message.text()}`)
    })
    await page.goto(url)
    await page.getByRole('heading', { name: 'Package consumer ready' }).waitFor()
    await page.getByLabel('Package realm plugin').waitFor()
    const realmPluginMarker = (await page.getByLabel('Package realm plugin').textContent()) ?? ''
    if (realmPluginMarker !== 'ready') throw new Error(`${label} custom realm plugin did not initialize`)
    const layoutRefReady = (await page.getByLabel('Package layout ref ready').textContent()) ?? ''
    if (layoutRefReady !== 'true') throw new Error(`${label} public ref was unavailable in the parent layout effect`)
    const effectRefReady = (await page.getByLabel('Package effect ref ready').textContent()) ?? ''
    if (effectRefReady !== 'true') throw new Error(`${label} public ref was unavailable in the parent mount effect`)
    await page.getByRole('button', { name: 'Read package Markdown' }).click()
    await page.waitForFunction(() => document.querySelector('[aria-label="Package Markdown"]')?.textContent !== '')
    const error = (await page.getByLabel('Package Error').textContent()) ?? ''
    if (error !== '') throw new Error(`${label} reported editor error: ${error}`)
    if (runtimeErrors.length > 0) throw new Error(`${label} runtime errors:\n${runtimeErrors.join('\n')}`)
    return ((await page.getByLabel('Package Markdown').textContent()) ?? '').replaceAll('\r\n', '\n')
  } finally {
    await page?.close()
    await stopProcessGroup(preview)
    activeProcesses.delete(preview)
  }
}

export async function assertLexicalGraph(appRoot, expectedVersion, expectedNames) {
  const lock = JSON.parse(await readFile(path.join(appRoot, 'package-lock.json'), 'utf8'))
  const lexicalPath = /(?:^|\/)node_modules\/(lexical|@lexical\/[^/]+)$/
  const installedNames = []
  const failures = []
  for (const [packagePath, entry] of Object.entries(lock.packages ?? {})) {
    const match = packagePath.match(lexicalPath)
    if (!match) continue
    installedNames.push(match[1])
    if (entry.version !== expectedVersion) failures.push(`${match[1]}@${entry.version}`)
    const manifest = JSON.parse(await readFile(path.join(appRoot, packagePath, 'package.json'), 'utf8'))
    if (manifest.version !== expectedVersion) failures.push(`${match[1]} installed as ${manifest.version}`)
  }
  const uniqueNames = [...new Set(installedNames)].sort()
  if (expectedNames && JSON.stringify(uniqueNames) !== JSON.stringify([...expectedNames].sort())) {
    failures.push(`package set differs: ${uniqueNames.join(', ')}`)
  }
  if (uniqueNames.length === 0 || failures.length > 0) {
    throw new Error(`Lexical ${expectedVersion} graph assertion failed: ${failures.join('; ') || 'empty graph'}`)
  }
  phase(`verified ${uniqueNames.length} Lexical packages at ${expectedVersion}`)
}

export function assertConstructAnchors(markdown, label) {
  for (const anchor of [
    '# Compatibility heading',
    '[safe link](https://example.com/safe)',
    '* Bullet alpha',
    '| Table   | Stable |',
    '***',
    '```ts compatibility-meta',
    ':::note',
    '<Grid>',
    'Nested compatibility content.'
  ]) {
    if (!markdown.includes(anchor)) throw new Error(`${label} lost construct anchor: ${anchor}`)
  }
}

export async function cleanupScratchRoot(scratchRoot) {
  await rm(scratchRoot, { recursive: true, force: true })
}
