import path from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
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

const lexical035Packages = [
  '@lexical/clipboard',
  '@lexical/code',
  '@lexical/devtools-core',
  '@lexical/dragon',
  '@lexical/hashtag',
  '@lexical/history',
  '@lexical/html',
  '@lexical/link',
  '@lexical/list',
  '@lexical/mark',
  '@lexical/markdown',
  '@lexical/offset',
  '@lexical/overflow',
  '@lexical/plain-text',
  '@lexical/react',
  '@lexical/rich-text',
  '@lexical/selection',
  '@lexical/table',
  '@lexical/text',
  '@lexical/utils',
  '@lexical/yjs',
  'lexical'
]
const lexical035Overrides = Object.fromEntries(lexical035Packages.map((name) => [name, '0.35.0']))

const scratchRoot = await createScratchRoot('mdxeditor-cross-version-')
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
  const expected035 = (await readFile(compatibilityExpected035Path, 'utf8')).trimEnd()
  const react18Manifest = path.join(repoRoot, 'tests/package-consumer/react-18/package.json')
  browser = await chromium.launch()

  const currentApp = await createConsumerApp({
    scratchRoot,
    name: 'current-048-writer',
    manifest: react18Manifest,
    editorDependency: `file:${tarball}`,
    markdown: input
  })
  await installAndBuildConsumer(currentApp, cacheRoot, '0.48 writer')
  await assertLexicalGraph(currentApp, '0.48.0')
  const currentOutput = (await captureConsumerMarkdown(currentApp, browser, '0.48 writer')).trimEnd()
  assertConstructAnchors(currentOutput, '0.48 writer')
  if (currentOutput !== expected035) {
    throw new Error(
      '0.48 canonical output differs from the checked-in 0.35 expectation; classify and check in an explicit 0.48 expectation'
    )
  }

  const legacyApp = await createConsumerApp({
    scratchRoot,
    name: 'legacy-035-reader',
    manifest: react18Manifest,
    editorDependency: '4.0.4',
    markdown: currentOutput,
    overrides: lexical035Overrides
  })
  await installAndBuildConsumer(legacyApp, cacheRoot, '4.0.4 / Lexical 0.35 reader')
  await assertLexicalGraph(legacyApp, '0.35.0', lexical035Packages)
  const legacyOutput = (await captureConsumerMarkdown(legacyApp, browser, '4.0.4 / Lexical 0.35 reader')).trimEnd()
  assertConstructAnchors(legacyOutput, 'legacy replay')
  if (legacyOutput !== expected035) throw new Error('Legacy replay differs from the checked-in 0.35 canonical expectation')
  phase('0.35 input -> packed 0.48 output -> published 4.0.4/0.35 replay passed')
} finally {
  removeInterruptCleanup()
  await browser?.close()
  await cleanupScratchRoot(scratchRoot)
}
