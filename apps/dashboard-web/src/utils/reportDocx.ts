// Real .docx exporter for daily reports (Office Open XML, not HTML-disguised
// .doc). Reuses the shared markdown parser so the downloaded Word file matches
// what the page renders: headings, paragraphs, blockquotes, horizontal rules,
// lists, tables, bold/code.
//
// The `docx` library (~0.5 MB) is loaded lazily via dynamic import so it never
// enters the initial page bundle — it is only fetched when a user actually
// clicks Word, keeping the export client-side and on-demand.
import { parseInline, parseMarkdown, type MdBlock } from './markdown'

type Docx = typeof import('docx')

const CODE_FONT = 'Consolas'
const CODE_FILL = 'F4F5F7'
const HEAD_FILL = 'F4F5F7'
const QUOTE_FILL = 'DCE7FB'
const QUOTE_BORDER = '2563EB'
const META_COLOR = '56606E'
const BORDER_COLOR = 'D9DCE2'
const ORDERED_REF = 'report-ordered'

function inlineRuns(d: Docx, text: string): InstanceType<Docx['TextRun']>[] {
  const spans = parseInline(text)
  if (spans.length === 0) return [new d.TextRun({ text: '' })]
  return spans.map((s) => new d.TextRun({
    text: s.text,
    bold: s.bold,
    font: s.code ? CODE_FONT : undefined,
    shading: s.code ? { type: d.ShadingType.CLEAR, color: 'auto', fill: CODE_FILL } : undefined,
  }))
}

function headingLevel(d: Docx, level: number) {
  if (level === 1) return d.HeadingLevel.HEADING_1
  if (level === 2) return d.HeadingLevel.HEADING_2
  return d.HeadingLevel.HEADING_3
}

function tableCell(d: Docx, text: string, header: boolean): InstanceType<Docx['TableCell']> {
  return new d.TableCell({
    shading: header
      ? { type: d.ShadingType.CLEAR, color: 'auto', fill: HEAD_FILL }
      : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new d.Paragraph({ children: inlineRuns(d, text) })],
  })
}

function tableFromBlock(d: Docx, b: MdBlock): InstanceType<Docx['Table']> {
  const head = b.head ?? []
  const cols = head.length || (b.rows?.[0]?.length ?? 1)
  const pad = (row: string[]): string[] => {
    const r = row.slice(0, cols)
    while (r.length < cols) r.push('')
    return r
  }
  const headerRow = new d.TableRow({
    tableHeader: true,
    children: pad(head).map((c) => tableCell(d, c, true)),
  })
  const bodyRows = (b.rows ?? []).map((r) => new d.TableRow({
    children: pad(r).map((c) => tableCell(d, c, false)),
  }))
  const border = { style: d.BorderStyle.SINGLE, size: 4, color: BORDER_COLOR }
  return new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: {
      top: border, bottom: border, left: border, right: border,
      insideHorizontal: border, insideVertical: border,
    },
    rows: head.length ? [headerRow, ...bodyRows] : bodyRows,
  })
}

function blockToElements(
  d: Docx, b: MdBlock, orderedInstance: { n: number },
): (InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>)[] {
  if (b.kind === 'h') {
    return [new d.Paragraph({ heading: headingLevel(d, b.level ?? 3), children: inlineRuns(d, b.text ?? '') })]
  }
  if (b.kind === 'p') {
    return [new d.Paragraph({ spacing: { after: 120 }, children: inlineRuns(d, b.text ?? '') })]
  }
  if (b.kind === 'quote') {
    return [new d.Paragraph({
      spacing: { after: 120 },
      shading: { type: d.ShadingType.CLEAR, color: 'auto', fill: QUOTE_FILL },
      border: { left: { style: d.BorderStyle.SINGLE, size: 16, color: QUOTE_BORDER, space: 8 } },
      children: inlineRuns(d, b.text ?? ''),
    })]
  }
  if (b.kind === 'hr') {
    return [new d.Paragraph({
      spacing: { before: 120, after: 120 },
      border: { bottom: { style: d.BorderStyle.SINGLE, size: 8, color: '8A93A1', space: 1 } },
      children: [],
    })]
  }
  if (b.kind === 'list') {
    const ordered = !!b.ordered
    if (ordered) orderedInstance.n += 1
    return (b.items ?? []).map((it) => new d.Paragraph({
      children: inlineRuns(d, it),
      ...(ordered
        ? { numbering: { reference: ORDERED_REF, level: 0, instance: orderedInstance.n } }
        : { bullet: { level: 0 } }),
    }))
  }
  if (b.kind === 'table') {
    // Spacer paragraph after each table keeps consecutive tables readable and
    // avoids a table being the final document element.
    return [tableFromBlock(d, b), new d.Paragraph({ spacing: { after: 120 }, children: [] })]
  }
  return []
}

export async function buildReportDocument(
  factoryId: string, date: string, markdown: string,
): Promise<InstanceType<Docx['Document']>> {
  const d = await import('docx')
  const blocks = parseMarkdown(markdown)
  const orderedInstance = { n: 0 }
  const meta = new d.Paragraph({
    spacing: { after: 240 },
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 8 } },
    children: [new d.TextRun({
      text: `Aegis-π Risk Twin · ${factoryId} · ${date} 일간 보고서`,
      color: META_COLOR, size: 18, allCaps: true,
    })],
  })
  const body = blocks.flatMap((b) => blockToElements(d, b, orderedInstance))
  return new d.Document({
    numbering: {
      config: [{
        reference: ORDERED_REF,
        levels: [{
          level: 0,
          format: d.LevelFormat.DECIMAL,
          text: '%1.',
          alignment: d.AlignmentType.START,
          style: { paragraph: { indent: { left: 480, hanging: 260 } } },
        }],
      }],
    },
    sections: [{ children: [meta, ...body] }],
  })
}

export async function reportDocxBlob(factoryId: string, date: string, markdown: string): Promise<Blob> {
  const { Packer } = await import('docx')
  return Packer.toBlob(await buildReportDocument(factoryId, date, markdown))
}

export async function downloadReportDocx(factoryId: string, date: string, markdown: string): Promise<void> {
  const blob = await reportDocxBlob(factoryId, date, markdown)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${factoryId}_${date}.docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
