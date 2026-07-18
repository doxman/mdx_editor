import { useRealm } from '@mdxeditor/gurx'
import type { ContainerDirective } from 'mdast-util-directive'
import type { MdxJsxFlowElement } from 'mdast-util-mdx'
import React from 'react'
import {
  BoldItalicUnderlineToggles,
  type CodeBlockEditorDescriptor,
  type CodeBlockEditorProps,
  type DirectiveDescriptor,
  type JsxComponentDescriptor,
  MDXEditor,
  type MDXEditorMethods,
  NestedLexicalEditor,
  UndoRedo,
  codeBlockPlugin,
  directivesPlugin,
  headingsPlugin,
  jsxPlugin,
  linkPlugin,
  searchOpen$,
  searchPlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  useCodeBlockEditorContext,
  useEditorSearch
} from '../..'

export const searchReplaceFixture = `# Search Replace Fixture

Root al**pha** first.

Root alpha second and KEEP.

Root *alpha* italic and [alpha](https://example.com) link.

| Scope | Value |
| ----- | ----- |
| Table | Cell alpha alpha |

:::note
Directive alpha.
:::

<Grid>
Nested alpha and alpha.
</Grid>

\`\`\`txt
Atomic alpha alpha
\`\`\`

***
`

const updatedSearchFixture = `# Updated Search Replace Fixture

Updated alpha alpha alpha.
`

const preserveActiveEditor = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.preventDefault()
}

const SearchGridEditor = () => (
  <div data-testid="search-jsx-editor" style={{ border: '1px solid #999', padding: 8 }}>
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
    Editor: SearchGridEditor
  }
]

const SearchDirectiveEditor = () => (
  <div data-testid="search-directive-editor" style={{ border: '1px solid #999', padding: 8 }}>
    <NestedLexicalEditor<ContainerDirective>
      block
      getContent={(node) => node.children}
      getUpdatedMdastNode={(node, children) => ({ ...node, children: children as ContainerDirective['children'] })}
    />
  </div>
)

const searchDirectiveDescriptor: DirectiveDescriptor<ContainerDirective> = {
  name: 'search-note',
  attributes: [],
  hasChildren: true,
  type: 'containerDirective',
  testNode: (node): node is ContainerDirective => node.type === 'containerDirective' && node.name === 'note',
  Editor: SearchDirectiveEditor
}

const SearchCodeBlockEditor: React.FC<CodeBlockEditorProps> = ({ code }) => {
  const codeBlockEditor = useCodeBlockEditorContext()
  return (
    <textarea
      aria-label="Atomic code editor"
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
  Editor: SearchCodeBlockEditor
}

const SearchControls = () => {
  const realm = useRealm()
  const search = useEditorSearch()
  const [replacement, setReplacement] = React.useState('$&')
  const [replaceCallbacks, setReplaceCallbacks] = React.useState(0)
  const [scrollCalls, setScrollCalls] = React.useState(0)

  const recordReplacement = () => {
    setReplaceCallbacks((count) => count + 1)
  }

  return (
    <div aria-label="Search controls">
      <input
        aria-label="Search term"
        value={search.search}
        onChange={(event) => {
          search.setSearch(event.target.value)
        }}
      />
      <input
        aria-label="Replacement text"
        value={replacement}
        onChange={(event) => {
          setReplacement(event.target.value)
        }}
      />
      <output aria-label="Search total">{search.total}</output>
      <output aria-label="Search cursor">{search.cursor}</output>
      <output aria-label="Current match">{search.currentRange?.toString() ?? ''}</output>
      <output aria-label="Search ranges">{search.ranges.map((range) => range.toString()).join('|')}</output>
      <output aria-label="Search open">{String(search.isSearchOpen)}</output>
      <output aria-label="Replace callback count">{replaceCallbacks}</output>
      <output aria-label="Scroll call count">{scrollCalls}</output>
      <button type="button" onMouseDown={preserveActiveEditor} onClick={search.openSearch}>
        Open search
      </button>
      <button type="button" onMouseDown={preserveActiveEditor} onClick={search.closeSearch}>
        Close search
      </button>
      <button
        type="button"
        onMouseDown={preserveActiveEditor}
        onClick={() => {
          search.setIsSearchOpen(false)
        }}
      >
        Close with setter
      </button>
      <button
        type="button"
        onMouseDown={preserveActiveEditor}
        onClick={() => {
          realm.pub(searchOpen$, false)
        }}
      >
        Close with cell
      </button>
      <button type="button" onMouseDown={preserveActiveEditor} onClick={search.toggleSearch}>
        Toggle search
      </button>
      <button
        type="button"
        onMouseDown={preserveActiveEditor}
        onClick={() => {
          search.setSearch(null)
        }}
      >
        Clear search term
      </button>
      <button type="button" onMouseDown={preserveActiveEditor} onClick={search.next}>
        Next match
      </button>
      <button type="button" onMouseDown={preserveActiveEditor} onClick={search.prev}>
        Previous match
      </button>
      <button
        type="button"
        onMouseDown={preserveActiveEditor}
        onClick={() => {
          search.replace(replacement, recordReplacement)
        }}
      >
        Replace match
      </button>
      <button
        type="button"
        onMouseDown={preserveActiveEditor}
        onClick={() => {
          search.replaceAll(replacement, recordReplacement)
        }}
      >
        Replace all
      </button>
      <button
        type="button"
        onMouseDown={preserveActiveEditor}
        onClick={() => {
          if (!search.currentRange) return
          search.scrollToRangeOrIndex(search.currentRange, { ignoreIfInView: false, behavior: 'auto' })
          setScrollCalls((count) => count + 1)
        }}
      >
        Scroll supplied range
      </button>
      <button
        type="button"
        onMouseDown={preserveActiveEditor}
        onClick={() => {
          search.scrollToRangeOrIndex(1, { ignoreIfInView: true, behavior: 'smooth' })
          setScrollCalls((count) => count + 1)
        }}
      >
        Scroll first index
      </button>
    </div>
  )
}

export const SearchReplaceHarness = () => {
  const editorRef = React.useRef<MDXEditorMethods>(null)
  const [mounted, setMounted] = React.useState(true)
  const [markdown, setMarkdown] = React.useState('')
  const [changeCount, setChangeCount] = React.useState(0)
  const [error, setError] = React.useState('')

  const plugins = React.useMemo(
    () => [
      headingsPlugin(),
      linkPlugin(),
      tablePlugin(),
      thematicBreakPlugin(),
      directivesPlugin({ directiveDescriptors: [searchDirectiveDescriptor] }),
      jsxPlugin({ jsxComponentDescriptors }),
      codeBlockPlugin({ codeBlockEditorDescriptors: [codeBlockEditorDescriptor] }),
      searchPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <BoldItalicUnderlineToggles />
            <SearchControls />
          </>
        )
      })
    ],
    []
  )

  return (
    <main>
      <h1>Search Replace fixture ready</h1>
      <div role="group" aria-label="Fixture controls">
        <button
          type="button"
          onClick={() => {
            setMarkdown(editorRef.current?.getMarkdown() ?? '')
          }}
        >
          Read Markdown
        </button>
        <button
          type="button"
          onClick={() => {
            editorRef.current?.setMarkdown(searchReplaceFixture)
          }}
        >
          Set initial Markdown
        </button>
        <button
          type="button"
          onClick={() => {
            editorRef.current?.setMarkdown(updatedSearchFixture)
          }}
        >
          Set updated Markdown
        </button>
        <button
          type="button"
          onClick={() => {
            setMounted(false)
          }}
        >
          Unmount editor
        </button>
      </div>

      {mounted ? (
        <section aria-label="Search fixture editor" data-testid="search-root-editor">
          <MDXEditor
            ref={editorRef}
            markdown={searchReplaceFixture}
            plugins={plugins}
            onChange={() => {
              setChangeCount((count) => count + 1)
            }}
            onError={({ error: nextError }) => {
              setError(nextError)
            }}
          />
        </section>
      ) : (
        <p>Editor unmounted</p>
      )}

      <pre aria-label="Search Markdown">{markdown}</pre>
      <output aria-label="Search change count">{changeCount}</output>
      <pre aria-label="Search error">{error}</pre>
    </main>
  )
}
