import { type ElementTransformer } from '@lexical/markdown'
import { $isHorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'
// eslint-disable-next-line @typescript-eslint/no-deprecated
import { $createHorizontalRuleNode, HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'
import { type LexicalNode } from 'lexical'

/**
 * Transformer for thematic break (horizontal rule) nodes.
 * Exports HorizontalRuleNode as "***" (thematic break).
 */
export const THEMATIC_BREAK_TRANSFORMER: ElementTransformer = {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => {
    return $isHorizontalRuleNode(node) ? '***' : null
  },
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _1, _2, isImport) => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const line = $createHorizontalRuleNode()

    // TODO: Get rid of isImport flag
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line)
    } else {
      parentNode.insertBefore(line)
    }

    line.selectNext()
  },
  type: 'element'
}
