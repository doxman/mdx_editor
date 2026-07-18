import { realmPlugin } from '../../RealmWithPlugins'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/extension'
// eslint-disable-next-line @typescript-eslint/no-deprecated
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'
// eslint-disable-next-line @typescript-eslint/no-deprecated
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { Action, withLatestFrom } from '@mdxeditor/gurx'
import { activeEditor$, addActivePlugin$, addComposerChild$, addExportVisitor$, addImportVisitor$, addLexicalNode$ } from '../core'
import { LexicalThematicBreakVisitor } from './LexicalThematicBreakVisitor'
import { MdastThematicBreakVisitor } from './MdastThematicBreakVisitor'

/**
 * Inserts a thematic break at the current selection.
 * @group Thematic Break
 */
export const insertThematicBreak$ = Action((r) => {
  r.sub(r.pipe(insertThematicBreak$, withLatestFrom(activeEditor$)), ([, theEditor]) => {
    theEditor?.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
  })
})

/**
 * A plugin that adds support for thematic breaks.
 * @group Thematic Break
 */
export const thematicBreakPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addActivePlugin$]: 'thematicBreak',
      [addImportVisitor$]: MdastThematicBreakVisitor,
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      [addLexicalNode$]: HorizontalRuleNode,
      [addExportVisitor$]: LexicalThematicBreakVisitor,
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      [addComposerChild$]: HorizontalRulePlugin
    })
  }
})
