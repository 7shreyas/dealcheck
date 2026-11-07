// Renders a report as a simple, readable PDF (pdf-lib, standard fonts).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { DISCLAIMER_TEXT } from "./copy";
import type { Report } from "./types";

const PAGE = { width: 612, height: 792, margin: 54 };
const BRAND = rgb(0.114, 0.306, 0.847); // #1D4ED8
const TEXT = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.28, 0.33, 0.41);

/** Standard PDF fonts only cover WinAnsi; swap anything else for a safe character. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderReportPdf(report: Report, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`DealCheck Deal Kit: ${title}`));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE.width - PAGE.margin * 2;

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const ensure = (h: number) => {
    if (y - h < PAGE.margin) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };
  const write = (text: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 11;
    const indent = opts.indent ?? 0;
    for (const line of wrap(text, font, size, width - indent)) {
      ensure(size + 4);
      page.drawText(line, { x: PAGE.margin + indent, y: y - size, size, font, color: opts.color ?? TEXT });
      y -= size + 4;
    }
    y -= opts.gap ?? 4;
  };

  write("DealCheck Deal Kit", { font: bold, size: 12, color: BRAND, gap: 2 });
  write(title, { font: bold, size: 20, gap: 12 });

  for (const section of report.sections) {
    ensure(40);
    y -= 6;
    write(section.title, { font: bold, size: 14, color: BRAND, gap: 6 });
    for (const block of section.body) {
      if (block.type === "p") write(block.text);
      else if (block.type === "list") for (const item of block.items) write(`- ${item}`, { indent: 8, gap: 2 });
      else if (block.type === "message") {
        write(block.label, { font: bold, size: 11, gap: 1 });
        write(`"${block.text}"`, { indent: 8, color: MUTED, gap: 6 });
      } else if (block.type === "table") {
        if (block.head.some(Boolean)) write(block.head.join("   |   "), { font: bold, size: 10, gap: 2 });
        for (const row of block.rows) write(row.filter(Boolean).join("   |   "), { size: 10, gap: 2 });
        y -= 4;
      }
    }
  }

  y -= 10;
  write(DISCLAIMER_TEXT, { size: 9, color: MUTED });
  return doc.save();
}
