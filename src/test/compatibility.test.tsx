import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { LexicalCompatibilityHarness } from './fixtures/LexicalCompatibilityHarness'
import { alternateCompatibilityMarkdown, compatibilityMarkdown035, maxLengthInitialMarkdown } from './fixtures/lexicalCompatibility'

describe('Lexical 0.35 compatibility contract', () => {
  it('round-trips the representative Markdown fixture through public methods', async () => {
    render(<LexicalCompatibilityHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Get Markdown' }))
    expect(screen.getByLabelText('Current Markdown').textContent).toBe(compatibilityMarkdown035)

    fireEvent.click(screen.getByRole('button', { name: 'Set Alternate' }))
    expect(
      await screen.findByRole('heading', {
        name: 'Alternate compatibility document'
      })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Get Markdown' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Current Markdown').textContent).toBe(alternateCompatibilityMarkdown.trimEnd())
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset Compatibility Markdown' }))
    expect(await screen.findByRole('heading', { name: 'Compatibility heading' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Get Markdown' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Current Markdown').textContent).toBe(compatibilityMarkdown035)
    })
  })

  it('renders the supported custom constructs without private editor access', async () => {
    render(<LexicalCompatibilityHarness />)

    expect(screen.getByLabelText('Compatibility Error')).toBeEmptyDOMElement()
    expect(await screen.findByRole('heading', { name: 'Compatibility heading' })).toBeInTheDocument()
    expect(await screen.findByText('Admonition compatibility content.')).toBeInTheDocument()
    expect(screen.getByTestId('compatibility-nested-editor')).toHaveTextContent('Nested compatibility content.')
    expect(screen.getByTestId('compatibility-code-block')).toHaveValue('const compatible = true')
    expect(screen.getByRole('table')).toHaveTextContent('TableStable')
  })

  it('keeps collapsed selection empty and exposes the capped editor baseline', () => {
    render(<LexicalCompatibilityHarness />)

    const rootEditor = screen.getByTestId('compatibility-root-editor')
    const contentEditable = rootEditor.querySelector<HTMLElement>('[contenteditable="true"]')
    expect(contentEditable).not.toBeNull()
    contentEditable?.focus()

    fireEvent.click(screen.getByRole('button', { name: 'Get Selection Markdown' }))
    expect(screen.getByLabelText('Selection Markdown')).toBeEmptyDOMElement()

    const cappedEditor = within(screen.getByTestId('compatibility-max-length-editor'))
    expect(cappedEditor.getByText(maxLengthInitialMarkdown)).toBeInTheDocument()
  })
})
