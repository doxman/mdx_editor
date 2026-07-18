---
title: Search and Replace
slug: search-replace
position: 0.85
---

# Search and Replace

This search is for the rich-text mode of the editor. The CodeMirror source editor already has its own search functionality and API.

The search plugin provides a comprehensive find-and-replace functionality for the editor. It's built for performance, using the native `CSS.highlights` API to mark search results without interfering with the editor's rendering logic.

The plugin derives matches from the current Lexical editor state. To add a user interface, use the `useEditorSearch` hook to build your own search bar.

To get started, add `searchPlugin()` to the editor's plugins array, then render a component that calls `useEditorSearch` within the editor's plugin realm—for example, from `toolbarPlugin`. MDXEditor does not export a prebuilt search toolbar.

A working example of a search UI is available in [the search-plugin-example repository](https://github.com/mdx-editor/search-plugin-example).

**A couple of things to note**:

- Search terms are case-insensitive regular expressions. Patterns such as `.*` can match across formatting and block boundaries because the active editor's text nodes are indexed in document order.
- Invalid expressions and expressions that produce only zero-length matches return no results. Correcting the term resumes search without remounting the editor.
- Search is scoped to the currently active Lexical editor. The root editor, nested JSX/directive editors, and table-cell editors are independent scopes; a match never crosses between them.
- Text owned by atomic/custom editors, including CodeMirror code blocks, is not searched. Source and diff modes use their own search facilities.
- Visual highlighting uses the [`CSS.highlights`](https://caniuse.com/mdn-api_highlight_has) API. Search controls can still derive matches where that API is unavailable, but visual highlights are unavailable.

```tsx
import { MDXEditor, searchPlugin, toolbarPlugin } from '@mdxeditor/editor'
// This is an application-owned component that calls useEditorSearch.
import { MdxSearchToolbar } from './path-to-your-components/MdxSearchToolbar'

function App() {
  return (
    <MDXEditor
      markdown={'# Hello World\n\nThis is a sample document. You can search for "sample" or any other word.'}
      plugins={[
        // 1. Enable the search plugin
        searchPlugin(),
        toolbarPlugin({
          // 2. In a real app, you would have a button here
          // that toggles the visibility of the search bar.
          toolbarContents: () => (
            <>
              <MdxSearchToolbar />
              <MyToolbarContents />
            </>
          )
        })
      ]}
    ></MDXEditor>
  )
}
```

## `useEditorSearch` Hook

The `searchPlugin` exposes its functionality through the `useEditorSearch` hook. You can use this hook in your own components to create a custom search interface or to programmatically control search.

The hook returns an object with the following properties and methods:

- `setSearch(term: string | null)`: Sets the search term. The plugin will start searching for matches. Pass `null` or an empty string to clear the search.
- `next()`: Navigates to the next search result.
- `prev()`: Navigates to the previous search result.
- `replace(newText: string, onUpdate?: () => void)`: Replaces the currently highlighted search result with `newText`.
- `replaceAll(newText: string, onUpdate?: () => void)`: Replaces all occurrences of the search term with `newText`.
- `openSearch()`, `closeSearch()`, and `toggleSearch()`: Control whether search is active.
- `isSearchOpen` and `setIsSearchOpen`: Read or directly set the open state.
- `scrollToRangeOrIndex(range: Range | number, options?)`: Scrolls to a supplied DOM range or a 1-based result index. Options accept `ignoreIfInView` and `behavior`.
- `search: string`: The current search term.
- `total: number`: The total number of matches found.
- `cursor: number`: The 1-based index of the currently active match.
- `currentRange: Range | null`: The DOM `Range` object for the current match.
- `ranges: Range[]`: Fresh DOM projections for the current state-backed matches.

`replace` and `replaceAll` treat `newText` literally, so strings such as `$&` are inserted unchanged. Replace All resolves every match from Lexical state, applies the matches from last to first in one editor update, and creates one undo/redo history step. Each optional callback runs once after that update.

The returned DOM ranges are current rendering projections for highlighting, scrolling, and compatibility. Do not retain them as durable document positions across later editor mutations; read the latest hook value instead.

Closing search through any open-state method or setter clears its registered highlights. Highlights are also cleared when the active editor changes, the term becomes empty or invalid, or the editor unmounts.

### Example: Building a simple search UI

Here's a basic example of how you could build a simple search component using the hook. This demonstrates how to read the search state and trigger actions.

```tsx
import React from 'react'
import { useEditorSearch } from '@mdxeditor/editor'

export const SimpleSearchUI = () => {
  const { search, setSearch, next, prev, total, cursor } = useEditorSearch()

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <input type="text" value={search ?? ''} onChange={(e) => setSearch(e.target.value)} placeholder="Search document..." />
      <button onClick={prev} disabled={total === 0}>
        &lt; Prev
      </button>
      <span>{total > 0 ? `${cursor} / ${total}` : '0 / 0'}</span>
      <button onClick={next} disabled={total === 0}>
        Next &gt;
      </button>
    </div>
  )
}
```

## Styling highlights

The highlights need to be styled using the following CSS selectors. You can customize the styles to fit your application's design.

```css
::highlight(MdxSearch) {
  background: yellow;
}
::highlight(MdxFocusSearch) {
  background: fuchsia;
}
```
