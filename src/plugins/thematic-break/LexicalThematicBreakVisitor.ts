/* eslint-disable @typescript-eslint/no-deprecated -- R2 intentionally retains the legacy React horizontal-rule path until R5. */
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode.js'
import * as Mdast from 'mdast'
import { LexicalExportVisitor } from '../../exportMarkdownFromLexical'

export const LexicalThematicBreakVisitor: LexicalExportVisitor<HorizontalRuleNode, Mdast.ThematicBreak> = {
  testLexicalNode: (node): node is HorizontalRuleNode => node instanceof HorizontalRuleNode,
  visitLexicalNode({ actions }) {
    actions.addAndStepInto('thematicBreak')
  }
}
