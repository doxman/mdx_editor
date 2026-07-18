import compatibilityMarkdownSource from './lexicalCompatibility.input.md?raw'
import compatibilityMarkdown035Source from './lexicalCompatibility.035.md?raw'

export const compatibilityMarkdown = compatibilityMarkdownSource

export const compatibilityMarkdown035 = compatibilityMarkdown035Source.trimEnd()

export const alternateCompatibilityMarkdown = `# Alternate compatibility document

Alternate public-method content.
`

export const maxLengthInitialMarkdown = '12345'
