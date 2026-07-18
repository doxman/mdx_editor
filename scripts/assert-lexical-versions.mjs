import { readFile } from 'node:fs/promises'
import path from 'node:path'

const expectedVersion = '0.48.0'
const expectedRange = '^0.48.0'
const expectedDirectPackages = [
  '@lexical/clipboard',
  '@lexical/extension',
  '@lexical/history',
  '@lexical/link',
  '@lexical/list',
  '@lexical/markdown',
  '@lexical/plain-text',
  '@lexical/react',
  '@lexical/rich-text',
  '@lexical/selection',
  '@lexical/utils',
  'lexical'
]

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const directLexicalPackages = Object.entries(packageJson.dependencies ?? {})
  .filter(([name]) => name === 'lexical' || name.startsWith('@lexical/'))
  .sort(([left], [right]) => left.localeCompare(right))

const failures = []

if (JSON.stringify(directLexicalPackages.map(([name]) => name)) !== JSON.stringify(expectedDirectPackages)) {
  failures.push(`direct Lexical declarations differ: ${directLexicalPackages.map(([name]) => name).join(', ')}`)
}

for (const [name, range] of directLexicalPackages) {
  if (range !== expectedRange) {
    failures.push(`${name} declares ${range}; expected ${expectedRange}`)
  }
}

const lexicalPackagePath = /(?:^|\/)node_modules\/(lexical|@lexical\/[^/]+)$/
const installedPackages = []

for (const [packagePath, lockEntry] of Object.entries(packageLock.packages ?? {})) {
  const match = packagePath.match(lexicalPackagePath)
  if (!match) continue

  const name = match[1]
  installedPackages.push(`${name}@${lockEntry.version}`)
  if (lockEntry.version !== expectedVersion) {
    failures.push(`${packagePath} locks ${lockEntry.version}; expected ${expectedVersion}`)
  }

  try {
    const installedManifest = JSON.parse(await readFile(path.join(packagePath, 'package.json'), 'utf8'))
    if (installedManifest.version !== expectedVersion) {
      failures.push(`${packagePath} installs ${installedManifest.version}; expected ${expectedVersion}`)
    }
  } catch (error) {
    failures.push(`${packagePath} is missing from node_modules (${error.message})`)
  }
}

if (installedPackages.length === 0) {
  failures.push('no installed Lexical packages were found in package-lock.json')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Verified ${installedPackages.length} installed Lexical packages at ${expectedVersion}.`)
}
