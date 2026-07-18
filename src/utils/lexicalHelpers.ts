import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type ElementNode,
  type LexicalEditor,
  type RangeSelection,
  type TextNode
} from 'lexical'
import { $convertSelectionToMarkdownString, type Transformer, TRANSFORMERS } from '@lexical/markdown'
import { $isAtNodeEnd } from '@lexical/selection'
import { tap } from './fp'
import { type ExportMarkdownFromLexicalOptions, exportMarkdownFromLexical } from '../exportMarkdownFromLexical'
import { TABLE_TRANSFORMER } from '../plugins/table/transformer'
import { THEMATIC_BREAK_TRANSFORMER } from '../plugins/thematic-break/transformer'

/**
 * Fetches a value from the Lexical editor read cycle.
 * @group Utils
 */
export function fromWithinEditorRead<T>(editor: LexicalEditor, fn: () => T): T {
  let result: T | null = null
  editor.getEditorState().read(() => {
    result = fn()
  })
  return result as T
}

/**
 * Gets the selected node from the Lexical editor.
 * @group Utils
 */
export function getSelectedNode(selection: RangeSelection): TextNode | ElementNode | null {
  try {
    const anchor = selection.anchor
    const focus = selection.focus

    const anchorNode = selection.anchor.getNode()
    const focusNode = selection.focus.getNode()
    if (anchorNode === focusNode) {
      return anchorNode
    }
    const isBackward = selection.isBackward()
    if (isBackward) {
      return $isAtNodeEnd(focus) ? anchorNode : focusNode
    } else {
      return $isAtNodeEnd(anchor) ? anchorNode : focusNode
    }
  } catch {
    return null
  }
}

const WILL_CHANGE_CONTAINING_BLOCK_PROPS = ['transform', 'perspective', 'filter', 'backdrop-filter', 'contain', 'container-type']
const CONTAIN_VALUES_CREATING_CONTAINING_BLOCK = ['layout', 'paint', 'strict', 'content']

/**
 * Finds the nearest ancestor element that creates a containing block for fixed/absolute positioned elements.
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_display/Containing_block
 */
function getFixedContainingBlock(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement
  while (current) {
    const style = window.getComputedStyle(current)

    const willChangeProps = style.willChange.split(',').map((v) => v.trim())
    const hasRelevantWillChange = willChangeProps.some((prop) => WILL_CHANGE_CONTAINING_BLOCK_PROPS.includes(prop))

    const createsContainingBlock =
      style.transform !== 'none' ||
      style.perspective !== 'none' ||
      style.filter !== 'none' ||
      style.backdropFilter !== 'none' ||
      CONTAIN_VALUES_CREATING_CONTAINING_BLOCK.includes(style.contain) ||
      style.containerType !== 'normal' ||
      style.contentVisibility === 'auto' ||
      hasRelevantWillChange

    if (createsContainingBlock) {
      return current
    }
    current = current.parentElement
  }
  return null
}

/**
 * Gets the coordinates of the selection in the Lexical editor.
 * @group Utils
 */
export function getSelectionRectangle(editor: LexicalEditor) {
  const selection = $getSelection()
  const nativeSelection = window.getSelection()
  const activeElement = document.activeElement

  const rootElement = editor.getRootElement()

  if (
    selection !== null &&
    nativeSelection !== null &&
    rootElement !== null &&
    rootElement.contains(nativeSelection.anchorNode) &&
    editor.isEditable()
  ) {
    const domRange = nativeSelection.getRangeAt(0)
    let rect

    if (nativeSelection.isCollapsed) {
      let node = nativeSelection.anchorNode
      if (node?.nodeType == 3) {
        node = node.parentNode
      }
      rect = (node as HTMLElement).getBoundingClientRect()
      rect.width = 0
    } else {
      if (nativeSelection.anchorNode === rootElement) {
        let inner = rootElement
        while (inner.firstElementChild != null) {
          inner = inner.firstElementChild as HTMLElement
        }
        rect = inner.getBoundingClientRect()
      } else {
        rect = domRange.getBoundingClientRect()
      }
    }

    const fixedContainer = getFixedContainingBlock(rootElement)
    if (fixedContainer) {
      const containerRect = fixedContainer.getBoundingClientRect()
      return {
        top: Math.round(rect.top - containerRect.top),
        left: Math.round(rect.left - containerRect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    }

    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
  } else if (activeElement?.className !== 'link-input') {
    return null
  }
  return null
}

/** @internal */
export function getStateAsMarkdown(editor: LexicalEditor, exportParams: Omit<ExportMarkdownFromLexicalOptions, 'root'>) {
  return tap({ markdown: '' }, (result) => {
    editor.getEditorState().read(() => {
      result.markdown = exportMarkdownFromLexical({ root: $getRoot(), ...exportParams })
    })
  }).markdown
}

/**
 * Gets the markdown representation of the current selection in the Lexical editor.
 * Returns an empty string if there is no selection or if the selection is collapsed.
 * Supports standard markdown nodes and custom MDXEditor nodes (tables, thematic breaks).
 * @group Utils
 */
export function getSelectionAsMarkdown(editor: LexicalEditor, activePlugins: string[]): string {
  let markdown = ''

  editor.getEditorState().read(
    () => {
      const selection = $getSelection()
      if (!selection || !$isRangeSelection(selection) || selection.isCollapsed()) {
        return
      }

      // Determine transformers to use
      const transformers: Transformer[] = TRANSFORMERS
      if (activePlugins.includes('table')) {
        transformers.push(TABLE_TRANSFORMER)
      }
      if (activePlugins.includes('thematicBreak')) {
        transformers.push(THEMATIC_BREAK_TRANSFORMER)
      }

      markdown = $convertSelectionToMarkdownString(transformers, selection)
    },
    { editor }
  )

  return markdown.trim()
}
