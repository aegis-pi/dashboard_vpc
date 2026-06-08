import { describe, expect, it } from 'vitest'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { buildReportDocument } from '../utils/reportDocx'

const SAMPLE = `# 일간 위험 요약
공장 운영 상태는 **정상**이며 임계치 초과 없음.

## 센서 지표
| 지표 | 값 |
| :- | :- |
| 온도 | 24.1 |
| 진동 | 0.03 |

## 권고 사항
1. 정기 점검 유지
2. \`vibration\` 알람 임계치 재검토

- 추가 모니터링 불필요
`

async function renderXml(md: string): Promise<{ doc: string; numbering: string | null }> {
  const buf = await Packer.toBuffer(await buildReportDocument('factory-a', '2026-06-08', md))
  // OOXML .docx is a ZIP container; verify the PK signature before unzipping.
  expect(buf[0]).toBe(0x50)
  expect(buf[1]).toBe(0x4b)
  const zip = await JSZip.loadAsync(buf)
  const doc = await zip.file('word/document.xml')!.async('string')
  const numberingFile = zip.file('word/numbering.xml')
  const numbering = numberingFile ? await numberingFile.async('string') : null
  return { doc, numbering }
}

describe('buildReportDocument', () => {
  it('produces a valid .docx containing the meta header and body text', async () => {
    const { doc } = await renderXml(SAMPLE)
    expect(doc).toContain('Aegis-π Risk Twin · factory-a · 2026-06-08 일간 보고서')
    expect(doc).toContain('일간 위험 요약')
    expect(doc).toContain('센서 지표')
    expect(doc).toContain('권고 사항')
  })

  it('renders headings using Word heading styles', async () => {
    const { doc } = await renderXml(SAMPLE)
    expect(doc).toContain('w:val="Heading1"')
    expect(doc).toContain('w:val="Heading2"')
  })

  it('renders bold and monospaced code runs', async () => {
    const { doc } = await renderXml(SAMPLE)
    expect(doc).toContain('<w:b/>')
    expect(doc).toContain('Consolas')
    expect(doc).toContain('vibration')
  })

  it('renders tables as real Word tables with cell text', async () => {
    const { doc } = await renderXml(SAMPLE)
    expect(doc).toContain('<w:tbl>')
    expect(doc).toContain('온도')
    expect(doc).toContain('24.1')
  })

  it('emits ordered-list numbering definitions', async () => {
    const { doc, numbering } = await renderXml(SAMPLE)
    expect(numbering).not.toBeNull()
    expect(numbering).toContain('decimal')
    expect(doc).toContain('<w:numPr>')
  })

  it('handles empty markdown without throwing', async () => {
    const { doc } = await renderXml('')
    expect(doc).toContain('Aegis-π Risk Twin · factory-a · 2026-06-08 일간 보고서')
  })

  it('numbers two ordered lists independently (restarts at 1)', async () => {
    const { doc } = await renderXml('1. one\n2. two\n\n간격\n\n1. alpha\n2. beta')
    const numIds = [...doc.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1])
    // Two ordered lists → two *distinct* numId instances so each restarts at 1.
    const distinct = new Set(numIds)
    expect(numIds.length).toBe(4)
    expect(distinct.size).toBe(2)
  })

  it('pads ragged table rows to a uniform cell count', async () => {
    const md = '| A | B | C |\n| :- | :- | :- |\n| 1 | 2 |\n| 3 | 4 | 5 | 6 |\n|  |  |  |'
    const { doc } = await renderXml(md)
    const cellCounts = [...doc.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)]
      .map((tr) => (tr[0].match(/<w:tc>/g) ?? []).length)
    // header + 3 body rows, every row exactly 3 cells despite ragged input.
    expect(cellCounts).toEqual([3, 3, 3, 3])
  })

  it('keeps a trailing paragraph after a table as the final block', async () => {
    const { doc } = await renderXml('# H\n\n| A |\n| :- |\n| 1 |')
    // A .docx must not end on a table; a spacer paragraph must follow the table.
    const lastTbl = doc.lastIndexOf('</w:tbl>')
    const lastPara = doc.lastIndexOf('<w:p ')
    const lastParaSelfClose = doc.lastIndexOf('<w:p>')
    expect(Math.max(lastPara, lastParaSelfClose)).toBeGreaterThan(lastTbl)
  })
})
