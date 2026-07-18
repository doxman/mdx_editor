import { expect, test, type Locator, type Page } from '@playwright/test'

const storyUrl = '/?story=search-replace--search-replace&mode=preview'
const runtimeErrors = new WeakMap<Page, string[]>()

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

async function selectText(page: Page, locator: Locator, text: string) {
  await locator.evaluate((element, selectedText) => {
    const editable = element.closest<HTMLElement>('[contenteditable="true"]')
    if (!editable) throw new Error('The selected public DOM node is not inside a contenteditable')
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node: Node | null = walker.nextNode()
    while (node) {
      const start = (node.textContent ?? '').indexOf(selectedText)
      if (start >= 0) {
        editable.focus()
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, start + selectedText.length)
        const selection = window.getSelection()
        if (!selection) throw new Error('The browser did not expose a DOM selection')
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
        return
      }
      node = walker.nextNode()
    }
    throw new Error(`Could not find text: ${selectedText}`)
  }, text)
}

async function setSearch(page: Page, term: string, total: number) {
  await page.getByLabel('Search term').fill(term)
  await expect(page.getByLabel('Search term')).toHaveValue(term)
  await expect(page.getByLabel('Search total')).toHaveText(String(total))
}

async function readMarkdown(page: Page) {
  await page.getByRole('button', { name: 'Read Markdown' }).click()
  return (await page.getByLabel('Search Markdown').textContent()) ?? ''
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

async function highlightTexts(page: Page, name: string) {
  return page.evaluate((highlightName) => {
    const highlight = CSS.highlights.get(highlightName)
    return highlight ? Array.from(highlight as unknown as Range[]).map((range) => range.toString()) : []
  }, name)
}

async function searchHighlightContexts(page: Page) {
  return page.evaluate(() => {
    const highlight = CSS.highlights.get('MdxSearch')
    return highlight
      ? Array.from(highlight as unknown as Range[]).map((range) => {
          const startParent = range.startContainer.parentElement
          const endParent = range.endContainer.parentElement
          return {
            italic: Boolean(startParent?.closest('em') || endParent?.closest('em')),
            link: Boolean(startParent?.closest('a') || endParent?.closest('a'))
          }
        })
      : []
  })
}

async function expectHighlightsCleared(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        ([searchName, focusName]) => !CSS.highlights.has(searchName) && !CSS.highlights.has(focusName),
        ['MdxSearch', 'MdxFocusSearch']
      )
    )
    .toBe(true)
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  await page.goto(storyUrl)
  await expect(page.getByRole('heading', { name: 'Search Replace fixture ready' })).toBeVisible()
  await expect(page.getByLabel('Search error')).toBeEmpty()
})

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? [], 'unexpected browser runtime errors').toEqual([])
})

test('CX-6a keeps navigation, highlights, and ranges current through mutations', async ({ page }) => {
  const root = page.getByTestId('search-root-editor')
  await page.getByRole('button', { name: 'Open search' }).click()
  await setSearch(page, 'alpha', 4)

  await expect(page.getByLabel('Search cursor')).toHaveText('1')
  await expect(page.getByLabel('Current match')).toHaveText('alpha')
  await expect(page.getByLabel('Search ranges')).toHaveText('alpha|alpha|alpha|alpha')
  expect(await highlightTexts(page, 'MdxSearch')).toEqual(['alpha', 'alpha', 'alpha', 'alpha'])
  expect(await highlightTexts(page, 'MdxFocusSearch')).toEqual(['alpha'])
  expect(await searchHighlightContexts(page)).toEqual([
    { italic: false, link: false },
    { italic: false, link: false },
    { italic: true, link: false },
    { italic: false, link: true }
  ])

  await page.getByRole('button', { name: 'Next match' }).click()
  await expect(page.getByLabel('Search cursor')).toHaveText('2')
  await page.getByRole('button', { name: 'Previous match' }).click()
  await expect(page.getByLabel('Search cursor')).toHaveText('1')
  await page.getByRole('button', { name: 'Scroll supplied range' }).click()
  await page.getByRole('button', { name: 'Scroll first index' }).click()
  await expect(page.getByLabel('Scroll call count')).toHaveText('2')

  const secondParagraph = root.locator('p').nth(1)
  await expect(secondParagraph).toHaveText('Root alpha second and KEEP.')
  await placeCaret(page, secondParagraph, 'start')
  await page.keyboard.type('Before ')
  await expect(secondParagraph).toHaveText('Before Root alpha second and KEEP.')
  await expect(page.getByLabel('Search total')).toHaveText('4')

  await selectText(page, secondParagraph, 'ph')
  await page.keyboard.type('ZZ')
  await expect(secondParagraph).toHaveText('Before Root alZZa second and KEEP.')
  await expect(page.getByLabel('Search total')).toHaveText('3')

  const formattedParagraph = root.locator('p').nth(2)
  await expect(formattedParagraph).toHaveText('Root alpha italic and alpha link.')
  await selectText(page, formattedParagraph, 'alpha')
  await page.getByRole('radio', { name: /Bold/ }).click()
  await expect(page.getByLabel('Search total')).toHaveText('3')
  await expect(formattedParagraph.locator('strong')).toContainText('alpha')

  await page.getByRole('button', { name: 'Set updated Markdown' }).click()
  await expect(page.getByRole('heading', { name: 'Updated Search Replace Fixture' })).toBeVisible()
  await expect(page.getByLabel('Search total')).toHaveText('3')
  await expect(page.getByLabel('Search ranges')).toHaveText('alpha|alpha|alpha')
  expect(await highlightTexts(page, 'MdxSearch')).toEqual(['alpha', 'alpha', 'alpha'])
  expect(await readMarkdown(page)).toBe('# Updated Search Replace Fixture\n\nUpdated alpha alpha alpha.')
})

test('CX-6b makes Replace and Replace All callback-stable and one-step undoable', async ({ page }) => {
  const root = page.getByTestId('search-root-editor')
  await page.getByRole('button', { name: 'Open search' }).click()
  await setSearch(page, 'alpha', 4)
  const initialMarkdown = await readMarkdown(page)

  await page.getByLabel('Replacement text').fill('ONE')
  await page.getByRole('button', { name: 'Replace match' }).click()
  await expect(page.getByLabel('Replace callback count')).toHaveText('1')
  await expect(page.getByLabel('Search total')).toHaveText('3')
  await expect(page.getByLabel('Search cursor')).toHaveText('1')
  await expect(page.getByLabel('Current match')).toHaveText('alpha')
  await expect(root.locator('p').filter({ hasText: 'Root ONE first.' })).toHaveText('Root ONE first.')
  await expect(root.locator('p').filter({ hasText: 'Root alpha second and KEEP.' })).toHaveText('Root alpha second and KEEP.')
  await expectMarkdown(page, (markdown) => {
    expect(markdown).toContain('Root ONE first.')
    expect(markdown).toContain('Root alpha second and KEEP.')
  })

  await page.getByRole('radio', { name: /Undo/ }).click()
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(initialMarkdown))
  await expect(page.getByLabel('Search total')).toHaveText('4')

  await page.getByLabel('Replacement text').fill('$&')
  const changesBefore = Number((await page.getByLabel('Search change count').textContent()) ?? '0')
  await page.getByRole('button', { name: 'Replace all' }).click()
  await expect(page.getByLabel('Replace callback count')).toHaveText('2')
  await expect(page.getByLabel('Search total')).toHaveText('0')
  await expect(page.getByLabel('Search cursor')).toHaveText('0')
  await expect(page.getByLabel('Current match')).toBeEmpty()
  await expect(page.getByLabel('Search ranges')).toBeEmpty()
  await expect(root.locator('p').filter({ hasText: 'Root $& first.' })).toHaveText('Root $& first.')
  await expect(root.locator('p').filter({ hasText: 'Root $& second and KEEP.' })).toHaveText('Root $& second and KEEP.')
  await expect(root.locator('p').filter({ hasText: 'Root $& italic and $& link.' })).toHaveText('Root $& italic and $& link.')
  const replacedMarkdown = await readMarkdown(page)
  expect(replacedMarkdown).toContain('Root $& first.')
  expect(replacedMarkdown).toContain('Root $& second and KEEP.')
  expect(replacedMarkdown).toContain('Root *$&* italic and [$&](https://example.com) link.')
  expect(replacedMarkdown).toContain('Cell alpha alpha')
  expect(replacedMarkdown).toContain('Directive alpha.')
  expect(replacedMarkdown).toContain('Nested alpha and alpha.')
  expect(replacedMarkdown).toContain('Atomic alpha alpha')
  await expect(page.getByLabel('Search change count')).toHaveText(String(changesBefore + 1))

  await page.getByRole('radio', { name: /Undo/ }).click()
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(initialMarkdown))
  await expect(page.getByLabel('Search total')).toHaveText('4')
  await page.getByRole('radio', { name: /Redo/ }).click()
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(replacedMarkdown))
  await expect(page.getByLabel('Search total')).toHaveText('0')
})

test('CX-6b keeps table replacement history local until one parent save', async ({ page }) => {
  const root = page.getByTestId('search-root-editor')
  const undo = page.getByRole('radio', { name: /Undo/ })
  const redo = page.getByRole('radio', { name: /Redo/ })
  const initialMarkdown = await readMarkdown(page)
  const rootParagraph = root.locator('p').filter({ hasText: 'Root alpha second and KEEP.' })
  const originalTableParagraph = root.getByRole('cell', { name: 'Cell alpha alpha' }).locator('p')

  await placeCaret(page, rootParagraph)
  await page.keyboard.type(' ROOT-BASE')
  const rootEditedMarkdown = await readMarkdown(page)
  expect(rootEditedMarkdown).not.toBe(initialMarkdown)
  expect(rootEditedMarkdown).toContain('Root alpha second and KEEP. ROOT-BASE')
  await placeCaret(page, rootParagraph)
  await page.getByRole('button', { name: 'Open search' }).click()
  await placeCaret(page, originalTableParagraph)
  await page.waitForTimeout(20)
  await placeCaret(page, originalTableParagraph)
  await setSearch(page, 'alpha', 2)
  await page.getByLabel('Replacement text').fill('TABLE')
  await page.getByRole('button', { name: 'Replace all' }).click()
  const replacedTableParagraph = root.getByRole('cell', { name: 'Cell TABLE TABLE' }).locator('p')
  await expect(replacedTableParagraph).toHaveText('Cell TABLE TABLE')
  await expect(undo).toBeEnabled()
  await expect(redo).toBeDisabled()

  await undo.click()
  await expect(originalTableParagraph).toHaveText('Cell alpha alpha')
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()
  await redo.click()
  await expect(replacedTableParagraph).toHaveText('Cell TABLE TABLE')
  await expect(undo).toBeEnabled()
  await expect(redo).toBeDisabled()

  const savedMarkdown = await readMarkdown(page)
  expect(savedMarkdown).toContain('Cell TABLE TABLE')
  await placeCaret(page, rootParagraph)
  await expect(undo).toBeEnabled()
  await undo.click()
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(rootEditedMarkdown))
  await expect(undo).toBeEnabled()
  await expect(redo).toBeEnabled()
  await redo.click()
  await expectMarkdown(page, (markdown) => expect(markdown).toBe(savedMarkdown))
})

test('CX-6c isolates active editors and cleans up close, recovery, switch, and unmount paths', async ({ page }) => {
  const root = page.getByTestId('search-root-editor')
  await page.getByRole('button', { name: 'Open search' }).click()
  await setSearch(page, 'alpha', 4)
  const initialMarkdown = await readMarkdown(page)

  const jsxParagraph = page.getByTestId('search-jsx-editor').locator('p').filter({ hasText: 'Nested alpha and alpha.' })
  await placeCaret(page, jsxParagraph)
  await expect(page.getByLabel('Search total')).toHaveText('2')
  await expect(page.getByLabel('Search ranges')).toHaveText('alpha|alpha')
  expect(await highlightTexts(page, 'MdxSearch')).toEqual(['alpha', 'alpha'])

  const directiveParagraph = page.getByTestId('search-directive-editor').locator('p').filter({ hasText: 'Directive alpha.' })
  await placeCaret(page, directiveParagraph)
  await expect(page.getByLabel('Search total')).toHaveText('1')
  await expect(page.getByLabel('Search ranges')).toHaveText('alpha')

  const tableParagraph = root.getByRole('cell', { name: 'Cell alpha alpha' }).locator('p')
  await placeCaret(page, tableParagraph)
  await expect(page.getByLabel('Search total')).toHaveText('2')
  await expect(page.getByLabel('Search ranges')).toHaveText('alpha|alpha')

  const rootParagraph = root.locator('p').filter({ hasText: 'Root alpha second and KEEP.' })
  await placeCaret(page, rootParagraph)
  await expect(page.getByLabel('Search total')).toHaveText('4')
  await page.getByLabel('Atomic code editor').click()
  await expect(page.getByLabel('Search total')).toHaveText('4')
  expect(await highlightTexts(page, 'MdxSearch')).toEqual(['alpha', 'alpha', 'alpha', 'alpha'])

  await setSearch(page, '[', 0)
  await setSearch(page, '^', 0)
  await setSearch(page, 'alpha', 4)
  expect(await readMarkdown(page)).toBe(initialMarkdown)

  await page.getByRole('button', { name: 'Close search' }).click()
  await expectHighlightsCleared(page)
  await page.getByRole('button', { name: 'Open search' }).click()
  await expect(page.getByLabel('Search total')).toHaveText('4')
  await page.getByRole('button', { name: 'Close with setter' }).click()
  await expectHighlightsCleared(page)
  await page.getByRole('button', { name: 'Open search' }).click()
  await expect(page.getByLabel('Search total')).toHaveText('4')
  await page.getByRole('button', { name: 'Close with cell' }).click()
  await expectHighlightsCleared(page)
  await page.getByRole('button', { name: 'Open search' }).click()
  await expect(page.getByLabel('Search total')).toHaveText('4')

  await page.getByRole('button', { name: 'Unmount editor' }).click()
  await expect(page.getByText('Editor unmounted')).toBeVisible()
  await expectHighlightsCleared(page)
})
