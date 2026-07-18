import type { MdxJsxFlowElement } from 'mdast-util-mdx'
import React from 'react'
import {
  AdmonitionDirectiveDescriptor,
  type CodeBlockEditorDescriptor,
  type CodeBlockEditorProps,
  CreateLink,
  JsxComponentDescriptor,
  ListsToggle,
  MDXEditor,
  MDXEditorMethods,
  NestedLexicalEditor,
  UndoRedo,
  codeBlockPlugin,
  directivesPlugin,
  frontmatterPlugin,
  headingsPlugin,
  jsxPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  maxLengthPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  useCodeBlockEditorContext
} from '../..'
import {
  alternateCompatibilityMarkdown,
  compatibilityMarkdown,
  compatibilityMarkdown035,
  maxLengthInitialMarkdown
} from './lexicalCompatibility'

const GridEditor = () => (
  <div data-testid="compatibility-nested-editor" style={{ border: '1px solid #999', padding: 8 }}>
    <NestedLexicalEditor<MdxJsxFlowElement>
      block
      getContent={(node) => node.children}
      getUpdatedMdastNode={(node, children) => ({ ...node, children: children as MdxJsxFlowElement['children'] })}
    />
  </div>
)

const jsxComponentDescriptors: JsxComponentDescriptor[] = [
  {
    name: 'Grid',
    kind: 'flow',
    props: [],
    hasChildren: true,
    Editor: GridEditor
  }
]

const CompatibilityCodeBlockEditor: React.FC<CodeBlockEditorProps> = ({ code }) => {
  const codeBlockEditor = useCodeBlockEditorContext()

  return (
    <textarea
      aria-label="Compatibility code block"
      data-testid="compatibility-code-block"
      defaultValue={code}
      onChange={(event) => {
        codeBlockEditor.setCode(event.target.value)
      }}
      onKeyDown={(event) => {
        event.nativeEvent.stopImmediatePropagation()
      }}
    />
  )
}

const codeBlockEditorDescriptor: CodeBlockEditorDescriptor = {
  priority: 0,
  match: () => true,
  Editor: CompatibilityCodeBlockEditor
}

const normalizeLineEndings = (markdown: string) => markdown.replaceAll('\r\n', '\n')

export const LexicalCompatibilityHarness = () => {
  const editorRef = React.useRef<MDXEditorMethods>(null)
  const cappedEditorRef = React.useRef<MDXEditorMethods>(null)
  const [currentMarkdown, setCurrentMarkdown] = React.useState(compatibilityMarkdown035)
  const [selectionMarkdown, setSelectionMarkdown] = React.useState('')
  const [cappedMarkdown, setCappedMarkdown] = React.useState(maxLengthInitialMarkdown)
  const [errorMessage, setErrorMessage] = React.useState('')
  const [lastClickedUrl, setLastClickedUrl] = React.useState('')

  const plugins = React.useMemo(
    () => [
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
      quotePlugin(),
      listsPlugin(),
      linkPlugin(),
      linkDialogPlugin({
        linkAutocompleteSuggestions: ['https://example.com/safe'],
        onClickLinkCallback: (url) => {
          setLastClickedUrl(url)
        }
      }),
      tablePlugin(),
      thematicBreakPlugin(),
      frontmatterPlugin(),
      codeBlockPlugin({ codeBlockEditorDescriptors: [codeBlockEditorDescriptor] }),
      directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
      jsxPlugin({ jsxComponentDescriptors }),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <ListsToggle />
            <CreateLink />
          </>
        )
      })
    ],
    []
  )

  return (
    <main>
      <h1>Lexical compatibility fixture ready</h1>

      <div role="group" aria-label="Compatibility controls">
        <button
          type="button"
          onClick={() => {
            setCurrentMarkdown(normalizeLineEndings(editorRef.current?.getMarkdown() ?? ''))
          }}
        >
          Get Markdown
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectionMarkdown(editorRef.current?.getSelectionMarkdown() ?? '')
          }}
        >
          Get Selection Markdown
        </button>
        <button
          type="button"
          onClick={() => {
            editorRef.current?.setMarkdown(alternateCompatibilityMarkdown)
          }}
        >
          Set Alternate
        </button>
        <button
          type="button"
          onClick={() => {
            editorRef.current?.setMarkdown(compatibilityMarkdown)
          }}
        >
          Reset Compatibility Markdown
        </button>
      </div>

      <section aria-label="Compatibility editor" data-testid="compatibility-root-editor">
        <MDXEditor
          ref={editorRef}
          markdown={compatibilityMarkdown}
          plugins={plugins}
          onChange={(markdown) => {
            setCurrentMarkdown(normalizeLineEndings(markdown))
          }}
          onError={({ error }) => {
            setErrorMessage(error)
          }}
        />
      </section>

      <pre aria-label="Current Markdown">{currentMarkdown}</pre>
      <pre aria-label="Selection Markdown">{selectionMarkdown}</pre>
      <pre aria-label="Compatibility Error">{errorMessage}</pre>
      <pre aria-label="Last Clicked URL">{lastClickedUrl}</pre>

      <section aria-label="Maximum length editor" data-testid="compatibility-max-length-editor">
        <MDXEditor
          ref={cappedEditorRef}
          markdown={maxLengthInitialMarkdown}
          plugins={[maxLengthPlugin(10)]}
          onChange={(markdown) => {
            setCappedMarkdown(normalizeLineEndings(markdown))
          }}
        />
      </section>
      <button
        type="button"
        onClick={() => {
          setCappedMarkdown(normalizeLineEndings(cappedEditorRef.current?.getMarkdown() ?? ''))
        }}
      >
        Get Maximum Length Markdown
      </button>
      <pre aria-label="Maximum Length Markdown">{cappedMarkdown}</pre>
    </main>
  )
}
