import { type ElementTransformer } from '@lexical/markdown'
import { type LexicalNode } from 'lexical'
import { $isTableNode, TableNode } from './TableNode'
import { toMarkdown } from 'mdast-util-to-markdown'
import { ToMarkdownExtension } from '../../exportMarkdownFromLexical'

let cachedExtensions: ToMarkdownExtension[] = []

/**
 * Update the cached markdown extensions used by the table transformer.
 * Called by the table plugin when extensions change.
 */
export function setTableTransformerExtensions(extensions: ToMarkdownExtension[]) {
  cachedExtensions = extensions
}

/**
 * Transformer for table nodes.
 * Exports TableNode to GFM (GitHub Flavored Markdown) table syntax.
 */
export const TABLE_TRANSFORMER: ElementTransformer = {
  dependencies: [TableNode],
  export: (node: LexicalNode) => {
    if ($isTableNode(node)) {
      const mdastTable = node.getMdastNode()

      try {
        return toMarkdown(mdastTable, {
          // Use cached extensions that are set by the plugin
          extensions: cachedExtensions
        })
      } catch (e) {
        console.error('Failed to export table node:', e)
        return null
      }
    }
    return null
  },
  regExp: /^\|.+\|.*/,
  replace: () => false,
  type: 'element'
}
