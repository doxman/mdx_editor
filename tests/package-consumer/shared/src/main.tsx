import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  AdmonitionDirectiveDescriptor,
  Cell,
  MDXEditor,
  type MDXEditorMethods,
  type CodeBlockEditorDescriptor,
  type JsxComponentDescriptor,
  addComposerChild$,
  codeBlockPlugin,
  directivesPlugin,
  frontmatterPlugin,
  headingsPlugin,
  jsxPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  realmPlugin,
  tablePlugin,
  thematicBreakPlugin,
  useCellValue
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import compatibilityMarkdown from './compatibility.md?raw'

const codeBlockEditorDescriptor: CodeBlockEditorDescriptor = {
  priority: 0,
  match: () => true,
  Editor: ({ code }) => <pre data-testid="consumer-code-block">{code}</pre>
}

const jsxComponentDescriptors: JsxComponentDescriptor[] = [
  {
    name: 'Grid',
    kind: 'flow',
    props: [],
    hasChildren: true,
    Editor: () => <div data-testid="consumer-grid">Grid content</div>
  }
]

const packageRealmMarker$ = Cell('not initialized')

const PackageRealmMarker = () => <output aria-label="Package realm plugin">{useCellValue(packageRealmMarker$)}</output>

const packageRealmPlugin = realmPlugin({
  init(realm) {
    realm.pub(packageRealmMarker$, 'ready')
    realm.pub(addComposerChild$, PackageRealmMarker)
  }
})

const plugins = [
  packageRealmPlugin(),
  headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
  quotePlugin(),
  listsPlugin(),
  linkPlugin(),
  tablePlugin(),
  thematicBreakPlugin(),
  frontmatterPlugin(),
  codeBlockPlugin({ codeBlockEditorDescriptors: [codeBlockEditorDescriptor] }),
  directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
  jsxPlugin({ jsxComponentDescriptors }),
  markdownShortcutPlugin()
]

function App() {
  const editorRef = React.useRef<MDXEditorMethods>(null)
  const [output, setOutput] = React.useState('')
  const [error, setError] = React.useState('')
  const [layoutRefReady, setLayoutRefReady] = React.useState(false)
  const [effectRefReady, setEffectRefReady] = React.useState(false)

  React.useLayoutEffect(() => {
    const methods = editorRef.current
    setLayoutRefReady(methods !== null)
    if (methods) {
      methods.setMarkdown(methods.getMarkdown())
    }
  }, [])
  React.useEffect(() => {
    setEffectRefReady(editorRef.current !== null)
  }, [])

  return (
    <main>
      <h1>Package consumer ready</h1>
      <button type="button" onClick={() => setOutput(editorRef.current?.getMarkdown() ?? '')}>
        Read package Markdown
      </button>
      <MDXEditor ref={editorRef} markdown={compatibilityMarkdown} plugins={plugins} onError={({ error }) => setError(error)} />
      <output aria-label="Package layout ref ready">{String(layoutRefReady)}</output>
      <output aria-label="Package effect ref ready">{String(effectRefReady)}</output>
      <pre aria-label="Package Markdown">{output}</pre>
      <pre aria-label="Package Error">{error}</pre>
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing root element')
ReactDOM.createRoot(root).render(<App />)
