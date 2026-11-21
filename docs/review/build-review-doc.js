// Builds docs/review/CAFM-screen-review.docx: every render with its annotation.
// Usage: node docs/review/build-review-doc.js
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, PageBreak, LevelFormat, Footer, PageNumber, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle } = require('docx');
const notes = require('./annotations.js');

const root = path.resolve(__dirname, '../..');
const screens = JSON.parse(fs.readFileSync(path.join(root, 'design/mockups/screens.json'), 'utf8'));
const pngDir = path.join(root, 'design/mockups/png');
const PETROL = '136676', MUTED = '4D5562', FAINT = '656E7A', FONT = 'Arial';

const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const missing = screens.filter((s) => !notes[s.id]).map((s) => s.id);
if (missing.length) throw new Error('No annotation for: ' + missing.join(', '));

// A4 portrait, 0.75" margins → content width 6.77" = 650 px at 96 dpi
const MAX_W = 650, MAX_H = 680;
const vpLabel = { desktop: 'Desktop (1440 px)', wide: 'Desktop (1600 px)', sheet: 'Design sheet', board: 'Mobile (three phones)', tablet: 'Tablet', a4: 'Print (A4)' };

const groups = [];
for (const s of screens) { let g = groups.find((x) => x.name === s.group); if (!g) groups.push(g = { name: s.group, list: [] }); g.list.push(s); }

const children = [];
// Cover
children.push(
  new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: 'CAFM', font: FONT, size: 28, bold: true, color: PETROL })] }),
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Screen review pack')] }),
  new Paragraph({ spacing: { after: 400 }, children: [new TextRun({ text: `${screens.length} rendered screens, each with a note on what it shows and what it does.`, font: FONT, size: 24, color: MUTED })] }),
  new Paragraph({ children: [new TextRun({ text: 'Demo tenant: Demo Estates Ltd (12 sites). All names and figures are demo data.', font: FONT, size: 20, color: FAINT })] }),
  new Paragraph({ children: [new TextRun({ text: 'Source: design/mockups in the CAFM repository · 21 November 2026', font: FONT, size: 20, color: FAINT })] }),
  new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: 'When giving feedback, quote the screen reference (for example wo-02-detail).', font: FONT, size: 20, color: MUTED })] }),
  new Paragraph({ children: [new PageBreak()] }),
);
// Contents table
const cw = [4600, 1000, 4100];
const cell = (text, w, opts = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, shading: opts.head ? { type: ShadingType.CLEAR, fill: 'EEF7F8', color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 19, bold: !!opts.head })] })] });
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Contents')] }));
children.push(new Table({ width: { size: 9700, type: WidthType.DXA }, columnWidths: cw, rows: [
  new TableRow({ tableHeader: true, children: [cell('Section', cw[0], { head: true }), cell('Screens', cw[1], { head: true }), cell('First reference', cw[2], { head: true })] }),
  ...groups.map((g) => new TableRow({ children: [cell(g.name, cw[0]), cell(String(g.list.length), cw[1]), cell(g.list[0].id, cw[2])] })),
] }));

// Screens
let n = 0;
for (const g of groups) {
  children.push(new Paragraph({ children: [new PageBreak()] }), new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(g.name)] }), new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `${g.list.length} screen${g.list.length > 1 ? 's' : ''} in this section.`, font: FONT, size: 20, color: FAINT })] }));
  g.list.forEach((s, i) => {
    n++;
    const buf = fs.readFileSync(path.join(pngDir, `${s.id}.png`));
    const { w, h } = pngSize(buf);
    const scale = Math.min(MAX_W / w, MAX_H / h);
    const [shows, points] = notes[s.id];
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`${n}. ${s.title}`)] }),
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: `Reference: ${s.id}  ·  ${vpLabel[s.viewport] || s.viewport}${s.theme === 'dark' ? '  ·  Dark theme' : ''}`, font: FONT, size: 18, color: FAINT })] }),
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'Shows: ', bold: true, font: FONT, size: 21 }), new TextRun({ text: shows, font: FONT, size: 21 })] }),
      ...points.map((p) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: p, font: FONT, size: 20 })] })),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 140 }, children: [new ImageRun({ type: 'png', data: buf, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) }, altText: { title: s.title, description: shows, name: s.id } })] }),
    );
  });
}

const doc = new Document({
  creator: 'CAFM', title: 'CAFM screen review pack', description: 'Annotated renders of every CAFM screen',
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', run: { font: FONT, size: 56, bold: true, color: '151A22' }, paragraph: { spacing: { before: 0, after: 160 }, keepNext: true } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 36, bold: true, color: PETROL }, paragraph: { spacing: { before: 0, after: 120 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: '151A22' }, paragraph: { spacing: { before: 0, after: 60 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'CAFM screen review pack · page ', font: FONT, size: 16, color: FAINT }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: FAINT })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then((b) => { const out = path.join(__dirname, 'CAFM-screen-review.docx'); fs.writeFileSync(out, b); console.log(out, Math.round(b.length / 1e6) + ' MB', n + ' screens'); });
