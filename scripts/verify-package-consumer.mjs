import path from 'node:path'
import { chromium } from '@playwright/test'
import {
  assertConstructAnchors,
  assertLexicalGraph,
  captureConsumerMarkdown,
  cleanupScratchRoot,
  compatibilityExpected035Path,
  compatibilityInputPath,
  createConsumerApp,
  createScratchRoot,
  installAndBuildConsumer,
  installInterruptCleanup,
  packCurrentPackage,
  phase,
  repoRoot
} from './package-consumer-utils.mjs'
import { mkdir, readFile } from 'node:fs/promises'

const requestedReact = process.argv.find((argument) => argument.startsWith('--react='))?.split('=')[1]
const majors = requestedReact ? [requestedReact] : ['18', '19']
if (majors.some((major) => major !== '18' && major !== '19')) {
  throw new Error('--react must be 18 or 19')
}

const scratchRoot = await createScratchRoot('mdxeditor-package-consumer-')
let browser
const removeInterruptCleanup = installInterruptCleanup(async () => {
  await browser?.close()
  await cleanupScratchRoot(scratchRoot)
})
try {
  const cacheRoot = path.join(scratchRoot, 'npm-cache')
  await mkdir(cacheRoot, { recursive: true })
  const tarball = await packCurrentPackage(scratchRoot, cacheRoot)
  const input = await readFile(compatibilityInputPath, 'utf8')
  const expected = (await readFile(compatibilityExpected035Path, 'utf8')).trimEnd()
  browser = await chromium.launch()

  for (const major of majors) {
    const label = `React ${major}`
    const appRoot = await createConsumerApp({
      scratchRoot,
      name: `react-${major}`,
      manifest: path.join(repoRoot, `tests/package-consumer/react-${major}/package.json`),
      editorDependency: `file:${tarball}`,
      markdown: input
    })
    await installAndBuildConsumer(appRoot, cacheRoot, label)
    await assertLexicalGraph(appRoot, '0.48.0')
    const output = (await captureConsumerMarkdown(appRoot, browser, label)).trimEnd()
    if (output !== expected) throw new Error(`${label} public ref output differs from the checked-in 0.35 expectation`)
    assertConstructAnchors(output, label)
    phase(`${label}: packed declarations, bundle, styles, runtime, and ref output passed`)
  }
} finally {
  removeInterruptCleanup()
  await browser?.close()
  await cleanupScratchRoot(scratchRoot)
}
