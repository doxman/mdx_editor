import { expect, test, type Locator, type Page } from '@playwright/test'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { readFileSync } from 'node:fs'

const compatibilityMarkdown035 = readFileSync('src/test/fixtures/lexicalCompatibility.035.md', 'utf8').trimEnd()
const alternateCompatibilityMarkdown = '# Alternate compatibility document\n\nAlternate public-method content.\n'

const storyUrl = '/?story=lexical-compatibility--compatibility&mode=preview'
const runtimeErrors = new WeakMap<Page, string[]>()

const occurrences = (value: string, search: string) => value.split(search).length - 1

type MarkdownTreeNode = { type: string; url?: string; children?: MarkdownTreeNode[] }

function collectMarkdownLinkUrls(markdown: string): string[] {
  const urls: string[] = []
  const visit = (node: MarkdownTreeNode) => {
    if (node.type === 'link' && typeof node.url === 'string') urls.push(node.url)
    node.children?.forEach(visit)
  }
  visit(fromMarkdown(markdown) as MarkdownTreeNode)
  return urls
}

async function placeCaret(page: Page, locator: Locator, position: 'start' | 'end' = 'end') {
  await locator.evaluate((element, caretPosition) => {
    const editable = element.closest<HTMLElement>('[contenteditable="true"]')
    if (!editable) throw new Error('The selected public DOM node is not inside a contenteditable')
    editable.focus()
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(caretPosition === 'start')
    const selection = window.getSelection()
    if (!selection) throw new Error('The browser did not expose a DOM selection')
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
  }, position)
}

async function readMarkdown(page: Page) {
  await page.getByRole('button', { name: 'Get Markdown' }).click()
  return (await page.getByLabel('Current Markdown').textContent()) ?? ''
}

async function expectMarkdown(page: Page, assertion: (markdown: string) => void) {
  await expect
    .poll(async () => {
      const markdown = await readMarkdown(page)
      assertion(markdown)
      return true
    })
    .toBe(true)
}

async function expectFocusedWithin(page: Page, testId: string) {
  await expect.poll(() => page.getByTestId(testId).evaluate((element) => element.contains(document.activeElement))).toBe(true)
}

async function undoUntilText(control: Locator, target: Locator, expectedText: string) {
  let clicks = 0
  while ((await target.textContent()) !== expectedText && clicks < 32) {
    await control.click()
    clicks += 1
  }
  expect(await target.textContent()).toBe(expectedText)
  expect(clicks).toBeGreaterThan(0)
  return clicks
}

async function repeatHistoryAction(control: Locator, count: number) {
  for (let index = 0; index < count; index += 1) {
    await control.click()
  }
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  await page.goto(storyUrl)
  await expect(page.getByRole('heading', { name: 'Lexical compatibility fixture ready' })).toBeVisible()
  await expect(page.getByLabel('Compatibility Error')).toBeEmpty()
})

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? [], 'unexpected browser runtime errors').toEqual([])
})

test('CX-2 preserves representative Markdown through get, set, and reset', async ({ page }) => {
  const root = page.getByTestId('compatibility-root-editor')
  const autolinkCandidate = root.locator('p').filter({ hasText: 'Link candidate text.' })
  await expect(page.getByRole('heading', { name: 'Compatibility heading' })).toBeVisible()
  await expect(root.getByText('Admonition compatibility content.')).toBeVisible()
  await expect(page.getByTestId('compatibility-nested-editor')).toContainText('Nested compatibility content.')
  const codeBlock = page.getByTestId('compatibility-code-block')
  await expect(codeBlock).toHaveValue('const compatible = true')
  await expect(page.getByRole('table')).toContainText('TableStable')

  expect(await readMarkdown(page)).toBe(compatibilityMarkdown035)

  await codeBlock.fill('const compatible = false')
  await expectMarkdown(page, (markdown) => expect(markdown).toContain('const compatible = false'))

  await placeCaret(page, autolinkCandidate)
  await page.keyboard.type(' https://example.com/typed ')
  await expect(root.getByRole('link', { name: 'https://example.com/typed' })).toBeVisible()
  await expectMarkdown(page, (markdown) => expect(markdown).toContain('[https://example.com/typed](https://example.com/typed)'))

  await page.getByRole('button', { name: 'Set Alternate' }).click()
  await expect(page.getByRole('heading', { name: 'Alternate compatibility document' })).toBeVisible()
  expect(await readMarkdown(page)).toBe(alternateCompatibilityMarkdown.trimEnd())

  await page.getByRole('button', { name: 'Reset Compatibility Markdown' }).click()
  await expect(page.getByRole('heading', { name: 'Compatibility heading' })).toBeVisible()
  expect(await readMarkdown(page)).toBe(compatibilityMarkdown035)
  await expect(page.getByLabel('Compatibility Error')).toBeEmpty()
})

test('CX-3 synchronizes root, nested, table, decorator, and shared history edits', async ({ page }) => {
  const root = page.getByTestId('compatibility-root-editor')
  const initialMarkdown = await readMarkdown(page)
  const undo = page.getByRole('radio', { name: /Undo/ })
  const redo = page.getByRole('radio', { name: /Redo/ })

  const rootParagraph = root.locator('p').filter({ hasText: 'Root compatibility paragraph' }).first()
  const initialRootText = (await rootParagraph.textContent()) ?? ''
  await placeCaret(page, rootParagraph)
  await page.keyboard.type(' ROOTEDIT')
  await expectFocusedWithin(page, 'compatibility-root-editor')
  await expectMarkdown(page, (markdown) => expect(occurrences(markdown, 'ROOTEDIT')).toBe(1))
  const afterRoot = await readMarkdown(page)

  await placeCaret(page, rootParagraph)
  const rootUndoCount = await undoUntilText(undo, rootParagraph, initialRootText)
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(initialMarkdown))
  await placeCaret(page, rootParagraph)
  await repeatHistoryAction(redo, rootUndoCount)
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(afterRoot))

  const nestedText = page.getByTestId('compatibility-nested-editor').locator('p').filter({ hasText: 'Nested compatibility content.' })
  const initialNestedText = (await nestedText.textContent()) ?? ''
  await placeCaret(page, nestedText)
  await page.keyboard.type(' NESTEDEDIT')
  await expectFocusedWithin(page, 'compatibility-nested-editor')
  const nestedUndoCount = await undoUntilText(undo, nestedText, initialNestedText)
  await repeatHistoryAction(redo, nestedUndoCount)
  await expect(nestedText).toHaveText('Nested compatibility content. NESTEDEDIT')
  await expectMarkdown(page, (markdown) => expect(occurrences(markdown, 'NESTEDEDIT')).toBe(1))
  const afterNested = await readMarkdown(page)
  expect(afterNested).not.toBe(afterRoot)
  expect(occurrences(afterNested, 'NESTEDEDIT')).toBe(1)

  const tableText = root.getByRole('cell', { name: 'Stable' }).locator('p')
  const initialTableText = (await tableText.textContent()) ?? ''
  await placeCaret(page, tableText)
  await page.keyboard.type(' TABLEEDIT')
  await expectFocusedWithin(page, 'compatibility-root-editor')
  await expectMarkdown(page, (markdown) => expect(occurrences(markdown, 'TABLEEDIT')).toBe(1))
  const beforeBoundary = await readMarkdown(page)
  expect(beforeBoundary).not.toBe(afterNested)
  expect(occurrences(beforeBoundary, 'TABLEEDIT')).toBe(1)

  await placeCaret(page, tableText)
  const tableUndoCount = await undoUntilText(undo, tableText, initialTableText)
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(afterNested))
  await placeCaret(page, tableText)
  await repeatHistoryAction(redo, tableUndoCount)
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(beforeBoundary))

  const boundaryParagraph = root.getByText('Decorator boundary paragraph.', { exact: true })
  await placeCaret(page, boundaryParagraph, 'start')
  await page.keyboard.press('Backspace')
  const afterBoundary = await readMarkdown(page)
  expect(afterBoundary).not.toBe(beforeBoundary)
  expect(afterBoundary).toContain('# Compatibility heading')
  expect(occurrences(afterBoundary, 'Decorator boundary paragraph.')).toBe(1)

  await undo.click()
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(beforeBoundary))
  await placeCaret(page, boundaryParagraph, 'start')
  await redo.click()
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(afterBoundary))
})

test('CX-4a preserves list structure through keyboard edits, task toggle, and undo', async ({ page }) => {
  const root = page.getByTestId('compatibility-root-editor')
  const bulletBeta = root.getByText('Bullet beta', { exact: true })

  await placeCaret(page, bulletBeta, 'start')
  await page.keyboard.press('Tab')
  await expectMarkdown(page, (markdown) => {
    expect(markdown).toContain('* Bullet alpha\n  * Bullet beta\n  * Nested bullet')
  })
  await placeCaret(page, bulletBeta, 'start')
  await page.keyboard.press('Shift+Tab')
  await expectMarkdown(page, (markdown) => {
    expect(markdown).toContain('* Bullet alpha\n* Bullet beta\n  * Nested bullet')
  })

  const listItemsBeforeEnter = await root.getByRole('listitem').count()
  await placeCaret(page, bulletBeta)
  await page.keyboard.press('Enter')
  await expect(root.getByRole('listitem')).toHaveCount(listItemsBeforeEnter + 1)
  await page.keyboard.press('Backspace')
  await expect(root.getByRole('listitem')).toHaveCount(listItemsBeforeEnter)
  await page.keyboard.type(' after Backspace')
  await expect(root.getByText('after Backspace', { exact: true })).toBeVisible()
  await expectMarkdown(page, (markdown) => {
    // Lexical 0.35 merged the empty item back into "Bullet beta". Lexical 0.48
    // intentionally converts it to a paragraph and leaves both list fragments intact.
    expect(markdown).not.toContain('* Bullet beta after Backspace\n  * Nested bullet')
    expect(markdown).toContain('* Bullet beta\n\n&#x20;after Backspace\n\n* Nested bullet')
    expect(occurrences(markdown, 'after Backspace')).toBe(1)
    expect(occurrences(markdown, 'Nested bullet')).toBe(1)
    expect(markdown).toContain('1. Ordered alpha')
    expect(markdown).toContain('* [x] Task complete')
  })

  const beforeTaskToggle = await readMarkdown(page)
  await root
    .getByRole('checkbox')
    .first()
    .click({ position: { x: 5, y: 10 } })
  await expectMarkdown(page, (markdown) => {
    expect(markdown).toContain('* [x] Task pending')
    expect(occurrences(markdown, 'Task pending')).toBe(1)
  })

  await page.getByRole('radio', { name: /Undo/ }).click()
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(beforeTaskToggle))
})

test('CX-4b creates and removes links, applies and undoes a heading shortcut, and exports a collapsed selection', async ({ page }) => {
  const root = page.getByTestId('compatibility-root-editor')
  const rootParagraph = root.locator('p').filter({ hasText: 'Root compatibility paragraph' }).first()
  const linkCandidate = root.locator('p').filter({ hasText: 'Link candidate text.' })

  await linkCandidate.selectText()
  await page.getByRole('button', { name: 'Create link' }).click()
  await page.getByPlaceholder('Select or paste an URL').fill('https://example.com/created')
  await page.getByRole('button', { name: 'Set URL' }).click()
  await expectMarkdown(page, (markdown) => expect(markdown).toContain('[Link candidate text.](https://example.com/created)'))

  const createdLink = root.getByRole('link', { name: 'Link candidate text.' })
  await createdLink.click()
  await page.getByRole('button', { name: 'Remove link' }).click()
  await expectMarkdown(page, (markdown) => {
    expect(markdown).toContain('Link candidate text.')
    expect(markdown).not.toContain('https://example.com/created')
  })

  const boundaryParagraph = root.locator('p').filter({ hasText: 'Decorator boundary paragraph.' }).first()
  await placeCaret(page, boundaryParagraph)
  await page.keyboard.press('Enter')
  await page.keyboard.type('# ')
  const shortcutBlock = boundaryParagraph.locator('xpath=following-sibling::*[1]')
  await expect(shortcutBlock).toHaveJSProperty('tagName', 'H1')

  await page.getByRole('radio', { name: /Undo/ }).click()
  await expect(shortcutBlock).toHaveJSProperty('tagName', 'P')

  await placeCaret(page, shortcutBlock)
  await page.keyboard.type('Shortcut paragraph')
  await expect(root.locator('p').filter({ hasText: 'Shortcut paragraph' })).toBeVisible()
  await expectMarkdown(page, (markdown) => {
    expect(markdown).toContain('\n\n\\# Shortcut paragraph\n\n')
    expect(markdown).not.toContain('\n\n# Shortcut paragraph')
  })

  await placeCaret(page, rootParagraph)
  await page.getByRole('button', { name: 'Get Selection Markdown' }).click()
  await expect(page.getByLabel('Selection Markdown')).toBeEmpty()
})

test('CX-4d keeps raw link data while dangerous preview navigation fails closed', async ({ page }) => {
  const vectors = [
    { url: 'https://example.com/safe', href: 'https://example.com/safe' },
    { url: 'mailto:user@example.com', href: 'mailto:user@example.com' },
    { url: '/relative', href: '/relative' },
    { url: '#anchor', href: '#anchor' },
    { url: 'javascript:alert(1)', href: 'about:blank' },
    { url: 'javascript://:99999999999/%0aalert(1)', href: 'about:blank' },
    { url: 'java\tscript:alert(1)', href: 'about:blank' },
    { url: 'data:text/html,<script>alert(1)</script>', href: 'about:blank' }
  ]

  await page.evaluate(() => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(value: string) {
          ;(window as typeof window & { __compatibilityCopiedUrl?: string }).__compatibilityCopiedUrl = value
          return Promise.resolve()
        }
      }
    })
  })

  for (const vector of vectors) {
    await page.getByRole('button', { name: 'Reset Compatibility Markdown' }).click()
    const root = page.getByTestId('compatibility-root-editor')
    const linkCandidate = root.locator('p').filter({ hasText: 'Link candidate text.' })
    await linkCandidate.selectText()
    await page.getByRole('button', { name: 'Create link' }).click()
    await page.getByPlaceholder('Select or paste an URL').fill(vector.url)
    await page.getByRole('button', { name: 'Set URL' }).click()

    const editorLink = root.getByRole('link', { name: 'Link candidate text.' })
    await expect(editorLink).toHaveAttribute('href', vector.href)
    await editorLink.click()
    const previewLink = page.getByTestId('link-dialog-preview')
    await expect(previewLink).toHaveAttribute('href', vector.href)
    expect(await previewLink.textContent()).toContain(vector.url)

    const markdown = await readMarkdown(page)
    expect(collectMarkdownLinkUrls(markdown)).toContain(vector.url)

    await page.getByRole('button', { name: 'Copy to clipboard' }).click()
    await expect
      .poll(() => page.evaluate(() => (window as typeof window & { __compatibilityCopiedUrl?: string }).__compatibilityCopiedUrl ?? ''))
      .toBe(vector.url)

    await previewLink.click()
    await expect(page.getByLabel('Last Clicked URL')).toHaveText(vector.url)
  }
})

test('CX-4c handles the DOM paste proxy, cut undo, and maximum length cap', async ({ page }) => {
  const root = page.getByTestId('compatibility-root-editor')
  const rootParagraph = root.locator('p').filter({ hasText: 'Root compatibility paragraph' }).first()
  const cutCandidate = root.locator('p').filter({ hasText: 'Link candidate text.' })

  await cutCandidate.selectText()
  await page.keyboard.press('ControlOrMeta+x')
  await expectMarkdown(page, (markdown) => expect(markdown).not.toContain('Link candidate text.'))
  await placeCaret(page, root.getByText('Compatibility quote', { exact: true }))
  await page.keyboard.press('ControlOrMeta+z')
  await expectMarkdown(page, (markdown) => expect(markdown).toContain('Link candidate text.'))

  await placeCaret(page, rootParagraph)
  await rootParagraph.evaluate((element) => {
    const editable = element.closest<HTMLElement>('[contenteditable="true"]')
    if (!editable) throw new Error('Paste target is not inside a contenteditable')
    const data = new DataTransfer()
    data.setData('text/plain', ' PASTEDONCE')
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
    // Firefox drops clipboardData from the ClipboardEvent initializer. Keep the
    // real DOM event and DataTransfer, but restore the standards-shaped property.
    if (event.clipboardData?.getData('text/plain') !== ' PASTEDONCE') {
      Object.defineProperty(event, 'clipboardData', { value: data })
    }
    if (event.clipboardData?.getData('text/plain') !== ' PASTEDONCE') {
      throw new Error('The browser did not preserve text/plain data on the ClipboardEvent')
    }
    editable.dispatchEvent(event)
  })
  await expectMarkdown(page, (markdown) => expect(occurrences(markdown, 'PASTEDONCE')).toBe(1))

  const cappedEditor = page.getByTestId('compatibility-max-length-editor')
  const cappedText = cappedEditor.getByText('12345', { exact: true })
  await placeCaret(page, cappedText)
  await page.keyboard.type('67890EXTRA')
  await page.getByRole('button', { name: 'Get Maximum Length Markdown' }).click()
  await expect(page.getByLabel('Maximum Length Markdown')).toHaveText('1234567890')
})
