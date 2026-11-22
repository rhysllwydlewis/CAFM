import PDFDocument from 'pdfkit';
import {
  CHECKLIST_ITEM_KIND_LABELS,
  COST_KIND_LABELS,
  formatMinor,
  PASS_FAIL_LABELS,
  PHOTO_PHASE_LABELS,
  SIGNATURE_ROLE_LABELS,
  type Checklist,
  type ChecklistItem,
  type CostKind,
  type PhotoPhase,
  type SignatureRole,
} from '@cafm/shared';

/** The tokens' ink, muted ink, brand and border colours, as the PDF cannot read CSS. */
const INK = '#151A22';
const MUTED = '#4D5562';
const BRAND = '#10525F';
const RULE = '#D9DEE5';
const WASH = '#F6F7F9';

export interface JobSheetData {
  organisation: string;
  number: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  raisedAt: Date;
  raisedBy: string | null;
  completedAt: Date | null;
  site: string | null;
  location: { name: string; code: string; address: string | null };
  asset: { name: string; number: string } | null;
  assignee: string | null;
  notes: { at: Date; body: string }[];
  checklists: Checklist[];
  /** Present only for a copy that is allowed to show money. */
  costs: null | {
    currency: string;
    items: { kind: CostKind; description: string; quantity: string; unitMinor: number; amountMinor: number }[];
    totalMinor: number;
  };
  photos: { phase: PhotoPhase; caption: string | null; filename: string; image: Buffer | null }[];
  signatures: { role: SignatureRole; signerName: string; signedAt: Date; image: Buffer | null }[];
  generatedAt: Date;
}

const when = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(date);

/**
 * The standard PDF fonts hold Western European text. Anything else is reduced to its base letter (the Welsh
 * ŵ and ŷ become w and y) or to a question mark, rather than drawing the wrong character.
 */
export function pdfText(text: string): string {
  return [...text.normalize('NFC').replace(/[\p{C}]/gu, ' ')]
    .map((char) => {
      const code = char.codePointAt(0)!;
      if (code < 0x100 || '€‘’“”–—•…'.includes(char)) return char;
      const base = char.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return base.length === 1 && base.codePointAt(0)! < 0x100 ? base : '?';
    })
    .join('');
}

const quantity = (item: ChecklistItem) => {
  if (item.answer === null) return 'Not answered';
  switch (item.kind) {
    case 'tick':
      return 'Done';
    case 'pass_fail':
      return PASS_FAIL_LABELS[item.answer as keyof typeof PASS_FAIL_LABELS] ?? item.answer;
    case 'number':
      return item.unit ? `${item.answer} ${item.unit}` : item.answer;
    default:
      return item.answer;
  }
};

/** Renders the job sheet as an A4 PDF. */
export function renderJobSheet(data: JobSheetData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: pdfText(`Job sheet ${data.number}`), Author: pdfText(data.organisation), Creator: 'CAFM' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
  const room = (needed: number) => {
    if (doc.y + needed > bottom()) doc.addPage();
  };
  const text = (value: string, size = 10, font = 'Helvetica', colour = INK) =>
    doc.font(font).fontSize(size).fillColor(colour).text(pdfText(value), left, doc.y, { width });
  const heading = (value: string) => {
    room(60);
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND).text(pdfText(value).toUpperCase(), left, doc.y, { width });
    doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor(RULE).lineWidth(1).stroke();
    doc.moveDown(0.5);
  };
  const pair = (label: string, value: string) => {
    room(18);
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(pdfText(label), left, y, { width: 90 });
    const after = doc.font('Helvetica').fontSize(10).fillColor(INK);
    after.text(pdfText(value), left + 95, y, { width: width - 95 });
    doc.y = Math.max(doc.y, y + 14);
  };

  // Title block.
  doc.rect(left, 40, width, 48).fillColor(WASH).fill();
  doc.font('Helvetica-Bold').fontSize(18).fillColor(BRAND).text('Job sheet', left + 10, 48, { width: width / 2 });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(pdfText(data.organisation), left + 10, 70, { width: width / 2 });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(pdfText(data.number), left + width / 2, 50, {
    width: width / 2 - 10,
    align: 'right',
  });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Printed ${when(data.generatedAt)}`, left + width / 2, 70, {
    width: width / 2 - 10,
    align: 'right',
  });
  doc.y = 100;

  heading('Job');
  pair('Title', data.title);
  pair('Priority', data.priority);
  pair('Status', data.status);
  pair('Raised', `${when(data.raisedAt)}${data.raisedBy ? ' by ' + data.raisedBy : ''}`);
  if (data.completedAt) pair('Completed', when(data.completedAt));
  if (data.assignee) pair('Done by', data.assignee);
  pair('Location', data.location.name + (data.location.code ? ` (${data.location.code})` : ''));
  if (data.site) pair('Site', data.site);
  if (data.location.address) pair('Address', data.location.address);
  if (data.asset) pair('Asset', `${data.asset.name} (${data.asset.number})`);

  heading('Problem reported');
  text(data.description || 'No description.');

  if (data.notes.length) {
    heading('Work carried out');
    for (const note of data.notes) {
      room(30);
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(when(note.at), left, doc.y, { width });
      text(note.body.length > 800 ? note.body.slice(0, 797) + '...' : note.body);
      doc.moveDown(0.4);
    }
  }

  if (data.checklists.length) {
    heading('Checklists');
    for (const list of data.checklists) {
      room(40);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(pdfText(list.title), left, doc.y, { width });
      doc.moveDown(0.2);
      for (const item of list.items) {
        room(26);
        const y = doc.y;
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(pdfText(item.label), left + 8, y, { width: width * 0.62 });
        const afterLabel = doc.y;
        const answerColour = item.answer === null ? MUTED : item.kind === 'pass_fail' && item.answer === 'fail' ? '#8F2424' : INK;
        doc
          .font(item.answer === null ? 'Helvetica-Oblique' : 'Helvetica-Bold')
          .fontSize(9.5)
          .fillColor(answerColour)
          .text(pdfText(quantity(item)), left + width * 0.66, y, { width: width * 0.34 });
        doc.y = Math.max(afterLabel, doc.y);
        if (item.note) {
          doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(pdfText(`Note: ${item.note}`), left + 16, doc.y, {
            width: width - 16,
          });
        }
        doc.moveDown(0.25);
      }
      doc.moveDown(0.3);
    }
  }

  if (data.costs) {
    heading('Labour and parts');
    for (const item of data.costs.items) {
      room(18);
      const y = doc.y;
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(INK)
        .text(pdfText(`${item.description} · ${COST_KIND_LABELS[item.kind]} · ${item.quantity}`), left + 8, y, {
          width: width * 0.72,
        });
      const after = doc.y;
      doc.text(formatMinor(item.amountMinor, data.costs.currency), left + width * 0.75, y, {
        width: width * 0.25,
        align: 'right',
      });
      doc.y = Math.max(after, doc.y);
      doc.moveDown(0.2);
    }
    room(24);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(RULE).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
    const y = doc.y;
    doc.text('Total (excluding VAT)', left + 8, y, { width: width * 0.7 });
    doc.text(formatMinor(data.costs.totalMinor, data.costs.currency), left + width * 0.75, y, {
      width: width * 0.25,
      align: 'right',
    });
  }

  if (data.photos.length) {
    heading('Photos');
    const cell = (width - 20) / 3;
    let column = 0;
    let rowTop = doc.y;
    for (const photo of data.photos) {
      if (column === 0) {
        room(150);
        rowTop = doc.y;
      }
      const x = left + column * (cell + 10);
      let drawn = false;
      if (photo.image) {
        try {
          doc.image(photo.image, x, rowTop, { fit: [cell, 100], align: 'center' });
          drawn = true;
        } catch {
          drawn = false;
        }
      }
      if (!drawn) {
        doc.rect(x, rowTop, cell, 100).strokeColor(RULE).stroke();
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Photo on record', x + 6, rowTop + 44, { width: cell - 12, align: 'center' });
      }
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(pdfText(`${PHOTO_PHASE_LABELS[photo.phase]}${photo.caption ? ': ' + photo.caption : ''}`), x, rowTop + 104, {
          width: cell,
          height: 22,
          ellipsis: true,
        });
      column = (column + 1) % 3;
      if (column === 0) doc.y = rowTop + 130;
    }
    if (column !== 0) doc.y = rowTop + 130;
  }

  if (data.signatures.length) {
    heading('Sign-off');
    room(100);
    const top = doc.y;
    const cell = (width - 10) / 2;
    data.signatures.forEach((signature, index) => {
      const x = left + index * (cell + 10);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(SIGNATURE_ROLE_LABELS[signature.role], x, top, { width: cell });
      if (signature.image) {
        try {
          doc.image(signature.image, x, top + 14, { fit: [cell - 20, 50] });
        } catch {
          // A drawing that cannot be read leaves the name and time, which are the record.
        }
      }
      doc.moveTo(x, top + 68).lineTo(x + cell - 20, top + 68).strokeColor(RULE).stroke();
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(INK)
        .text(pdfText(signature.signerName), x, top + 72, { width: cell - 20 });
      doc.fontSize(8.5).fillColor(MUTED).text(when(signature.signedAt), x, top + 86, { width: cell - 20 });
    });
    doc.y = top + 105;
  }

  // Footer on every page. The bottom margin is lifted so writing there cannot add a page.
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(pages.start + index);
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(pdfText(data.organisation), left, doc.page.height - 32, { width: width / 2, lineBreak: false });
    doc.text(`Page ${index + 1} of ${pages.count}`, left + width / 2, doc.page.height - 32, {
      width: width / 2,
      align: 'right',
      lineBreak: false,
    });
  }
  doc.end();
  return finished;
}
