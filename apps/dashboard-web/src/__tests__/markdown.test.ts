import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from '../utils/markdown'

describe('parseMarkdown', () => {
  it('parses headings with their level', () => {
    expect(parseMarkdown('# Title\n## Sub\n### Deep')).toEqual([
      { kind: 'h', level: 1, text: 'Title' },
      { kind: 'h', level: 2, text: 'Sub' },
      { kind: 'h', level: 3, text: 'Deep' },
    ])
  })

  it('joins wrapped paragraph lines', () => {
    expect(parseMarkdown('line one\nline two\n\nnext')).toEqual([
      { kind: 'p', text: 'line one line two' },
      { kind: 'p', text: 'next' },
    ])
  })

  it('parses unordered and ordered lists separately', () => {
    expect(parseMarkdown('- a\n- b')).toEqual([
      { kind: 'list', ordered: false, items: ['a', 'b'] },
    ])
    expect(parseMarkdown('1. first\n2. second')).toEqual([
      { kind: 'list', ordered: true, items: ['first', 'second'] },
    ])
  })

  it('parses a pipe table with header and rows', () => {
    const md = '| A | B |\n| :- | :- |\n| 1 | 2 |\n| 3 | 4 |'
    expect(parseMarkdown(md)).toEqual([
      { kind: 'table', head: ['A', 'B'], rows: [['1', '2'], ['3', '4']] },
    ])
  })

  it('handles empty / nullish input', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown(undefined as unknown as string)).toEqual([])
  })
})

describe('parseInline', () => {
  it('splits bold, code, and plain spans', () => {
    expect(parseInline('a **b** c `d` e')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c ' },
      { text: 'd', code: true },
      { text: ' e' },
    ])
  })

  it('keeps unterminated markers as plain text (no bold/code applied)', () => {
    const join = (s: string) => parseInline(s).map((sp) => sp.text).join('')
    for (const span of parseInline('**oops')) expect(span.bold).toBeUndefined()
    for (const span of parseInline('`oops')) expect(span.code).toBeUndefined()
    // Visible text is preserved verbatim even when markers are unbalanced.
    expect(join('**oops')).toBe('**oops')
    expect(join('`oops')).toBe('`oops')
  })

  it('returns no spans for empty text', () => {
    expect(parseInline('')).toEqual([])
  })
})
