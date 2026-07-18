// eslint-disable-next-line @typescript-eslint/no-deprecated
import { $createHorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode.js'
import * as Mdast from 'mdast'
import { MdastImportVisitor } from '../../importMarkdownToLexical'

export const MdastThematicBreakVisitor: MdastImportVisitor<Mdast.ThematicBreak> = {
  testNode: 'thematicBreak',
  visitNode({ actions }) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    actions.addAndStepInto($createHorizontalRuleNode())
  }
}
