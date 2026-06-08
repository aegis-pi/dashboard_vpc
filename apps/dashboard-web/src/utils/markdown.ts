// Minimal Markdown parser (no external deps) shared by the report renderer,
// the print/PDF HTML exporter, and the .docx exporter. Supports the subset the
// daily-report pipeline emits: h1-h3, paragraphs, ordered/unordered lists,
// pipe tables, and inline **bold** / `code`.

export interface MdBlock {
  kind: 'h' | 'p' | 'list' | 'table'
  level?: number
  text?: string
  ordered?: boolean
  items?: string[]
  head?: string[]
  rows?: string[][]
}

export interface InlineSpan {
  text: string
  bold?: boolean
  code?: boolean
}

function splitRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim())
}

export function parseMarkdown(text: string): MdBlock[] {
  const lines = (text ?? '').split('\n')
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) { i++; continue }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) { blocks.push({ kind: 'h', level: h[1]!.length, text: h[2] }); i++; continue }
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|\s*[:-]+/)) {
      const head = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i]!.startsWith('|')) { rows.push(splitRow(lines[i]!)); i++ }
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && (
        (ordered && /^\s*\d+\.\s+/.test(lines[i]!)) ||
        (!ordered && /^\s*[-*]\s+/.test(lines[i]!))
      )) { items.push(lines[i]!.replace(/^\s*(?:\d+\.|[-*])\s+/, '')); i++ }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    const para = [line]; i++
    while (i < lines.length && lines[i]!.trim() && !/^(#|\||[-*]\s|\d+\.\s)/.test(lines[i]!)) {
      para.push(lines[i]!); i++
    }
    blocks.push({ kind: 'p', text: para.join(' ') })
  }
  return blocks
}

// Parse inline **bold** and `code` into typed spans. Pure data so the React
// renderer, HTML exporter, and docx exporter all share one source of truth.
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end > -1) {
        spans.push({ text: text.slice(i + 2, end), bold: true })
        i = end + 2; continue
      }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > -1) {
        spans.push({ text: text.slice(i + 1, end), code: true })
        i = end + 1; continue
      }
    }
    let j = i + 1
    while (j < text.length && text[j] !== '*' && text[j] !== '`') j++
    spans.push({ text: text.slice(i, j) })
    i = j
  }
  return spans
}
