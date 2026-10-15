import { LineCapStyle, PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type PDFImage } from '@cantoo/pdf-lib';
import {
  canvasToBlob,
  dataUrlToBytes,
  hexToRgb,
  imageToEmbeddable,
  openPdfJs,
  openPdfLib,
  parseRanges,
  pdfBlob,
  readBytes,
  renderPage,
  withSuffix,
  type OutputFile,
} from '../../lib/pdf';
import type { ProcessContext } from '../types';

/**
 * Maps between "display" coordinates (top-left origin, after the page's /Rotate is
 * applied, in points — the same space pdf.js renders) and PDF user space.
 */
export function displaySpace(page: PDFPage) {
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const b = page.getCropBox();
  const sideways = r === 90 || r === 270;
  const width = sideways ? b.height : b.width;
  const height = sideways ? b.width : b.height;
  const toPdf = (dx: number, dy: number): [number, number] => {
    switch (r) {
      case 90:
        return [b.x + dy, b.y + dx];
      case 180:
        return [b.x + b.width - dx, b.y + dy];
      case 270:
        return [b.x + b.width - dy, b.y + b.height - dx];
      default:
        return [b.x + dx, b.y + b.height - dy];
    }
  };
  return { width, height, rotation: r, toPdf };
}

function pagesFor(doc: PDFDocument, expr: string | undefined): Set<number> {
  if (!expr?.trim()) return new Set(doc.getPageIndices());
  return new Set(parseRanges(expr, doc.getPageCount()).flat());
}

function fontFor(name: string | undefined, bold: boolean, italic = false): StandardFonts {
  const family = name === 'Times' ? 'Times' : name === 'Courier' ? 'Courier' : 'Helvetica';
  const map: Record<string, StandardFonts[]> = {
    Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
    Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
    Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
  };
  return map[family][(bold ? 1 : 0) + (italic ? 2 : 0)];
}

/** Standard PDF fonts only cover Latin-1; anything else is drawn as an image of the text. */
function canEncode(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

async function textImage(doc: PDFDocument, text: string, sizePt: number, color: string, bold: boolean, family = 'sans-serif') {
  const scale = 4;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `${bold ? 'bold ' : ''}${sizePt * scale}px ${family}`;
  ctx.font = font;
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(lines.length * sizePt * 1.25 * scale);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, 0, i * sizePt * 1.25 * scale));
  const png = await doc.embedPng(await readBytes(await canvasToBlob(canvas, 'image/png')));
  return { png, width: canvas.width / scale, height: canvas.height / scale };
}

const POS: Record<string, [number, number]> = {
  'top-left': [0, 0], 'top-center': [0.5, 0], 'top-right': [1, 0],
  'middle-left': [0, 0.5], center: [0.5, 0.5], 'middle-right': [1, 0.5],
  'bottom-left': [0, 1], 'bottom-center': [0.5, 1], 'bottom-right': [1, 1],
};

export async function pageNumbers({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    progress(f / files.length, `Numbering ${files[f].name}`);
    const doc = await openPdfLib(files[f]);
    const font = await doc.embedFont(fontFor(options.font, !!options.bold));
    const targets = pagesFor(doc, options.pages);
    const total = doc.getPageCount();
    const size = Number(options.fontSize) || 12;
    const margin = { small: 20, recommended: 36, big: 60 }[options.margin as string] ?? 36;
    const [cr, cg, cb] = hexToRgb(options.color || '#000000');
    let n = Number(options.start) || 1;
    const facing = options.facing;
    doc.getPages().forEach((page, i) => {
      if (!targets.has(i)) return;
      let text = (options.format as string)
        .replace(/\{n\}/g, String(n))
        .replace(/\{p\}/g, String(total));
      if (!canEncode(font, text)) text = String(n);
      n++;
      const ds = displaySpace(page);
      let [ax, ay] = POS[options.position] ?? POS['bottom-center'];
      // In facing-pages mode, mirror left/right positions on even pages.
      if (facing && i % 2 === 1 && ax !== 0.5) ax = 1 - ax;
      const w = font.widthOfTextAtSize(text, size);
      const dx = margin + ax * (ds.width - margin * 2 - w);
      const dy = ay === 0 ? margin + size * 0.8 : ay === 1 ? ds.height - margin : ds.height / 2;
      const [x, y] = ds.toPdf(dx, dy);
      page.drawText(text, { x, y, size, font, color: rgb(cr, cg, cb), rotate: degrees(ds.rotation) });
    });
    outputs.push({ name: withSuffix(files[f].name, '_numbered'), blob: pdfBlob(await doc.save()) });
  }
  return outputs;
}

export async function watermark({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    progress(f / files.length, `Stamping ${files[f].name}`);
    const doc = await openPdfLib(files[f]);
    const targets = pagesFor(doc, options.pages);
    const opacity = (Number(options.opacity) || 50) / 100;
    const angle = Number(options.rotation) || 0;

    // Prepare either an image or text "stamp" with its natural size in points.
    let stamp: { draw: (page: PDFPage, x: number, y: number, rot: number) => void; w: number; h: number };
    if (options.type === 'image') {
      if (!options.image) throw new Error('Please choose an image for the watermark');
      const img = await imageToEmbeddable(options.image);
      const embedded: PDFImage = img.type === 'png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
      const scale = (Number(options.imageScale) || 50) / 100;
      const w = img.width * 0.75 * scale;
      const h = img.height * 0.75 * scale;
      stamp = { w, h, draw: (page, x, y, rot) => page.drawImage(embedded, { x, y, width: w, height: h, opacity, rotate: degrees(rot) }) };
    } else {
      const text: string = options.text || 'CONFIDENTIAL';
      const size = Number(options.fontSize) || 48;
      const [cr, cg, cb] = hexToRgb(options.color || '#ff0000');
      const font = await doc.embedFont(fontFor(options.font, !!options.bold, !!options.italic));
      if (canEncode(font, text)) {
        const w = font.widthOfTextAtSize(text, size);
        const h = font.heightAtSize(size, { descender: false });
        stamp = { w, h, draw: (page, x, y, rot) => page.drawText(text, { x, y, size, font, color: rgb(cr, cg, cb), opacity, rotate: degrees(rot) }) };
      } else {
        const img = await textImage(doc, text, size, options.color || '#ff0000', !!options.bold);
        stamp = { w: img.width, h: img.height, draw: (page, x, y, rot) => page.drawImage(img.png, { x, y, width: img.width, height: img.height, opacity, rotate: degrees(rot) }) };
      }
    }

    const rad = (angle * Math.PI) / 180;
    doc.getPages().forEach((page, i) => {
      if (!targets.has(i)) return;
      const ds = displaySpace(page);
      // Place the stamp so that its centre lands on (cx, cy) in display space, rotated by `angle`.
      const place = (cx: number, cy: number) => {
        // Bottom-left corner of the rotated box relative to its centre (display space, y down).
        const ox = -stamp.w / 2;
        const oy = stamp.h / 2;
        const dx = cx + ox * Math.cos(rad) + oy * Math.sin(rad);
        const dy = cy - ox * Math.sin(rad) + oy * Math.cos(rad);
        const [x, y] = ds.toPdf(dx, dy);
        stamp.draw(page, x, y, ds.rotation + angle);
      };
      if (options.position === 'mosaic') {
        const stepX = stamp.w + 80;
        const stepY = stamp.h + 120;
        for (let y = stepY / 2; y < ds.height + stepY; y += stepY) {
          const shift = (Math.round(y / stepY) % 2) * (stepX / 2);
          for (let x = stepX / 2 - shift; x < ds.width + stepX; x += stepX) place(x, y);
        }
      } else {
        const [px, py] = POS[options.position] ?? POS.center;
        const m = 40 + Math.max(stamp.w, stamp.h) / 2;
        place(m + px * (ds.width - 2 * m), m + py * (ds.height - 2 * m));
      }
    });
    outputs.push({ name: withSuffix(files[f].name, '_watermarked'), blob: pdfBlob(await doc.save()) });
  }
  return outputs;
}

/* ------------------------------------------------------------------ */
/* Visual editor annotations (Edit, Sign, Redact)                      */
/* ------------------------------------------------------------------ */

export type Annotation =
  | { id: string; type: 'text'; page: number; x: number; y: number; w: number; h: number; text: string; size: number; color: string; font: string; bold: boolean; italic: boolean }
  | { id: string; type: 'image'; page: number; x: number; y: number; w: number; h: number; src: string }
  | { id: string; type: 'rect'; page: number; x: number; y: number; w: number; h: number; color: string; fill: boolean; opacity: number; stroke?: number }
  | { id: string; type: 'ellipse'; page: number; x: number; y: number; w: number; h: number; color: string; fill: boolean; opacity: number; stroke?: number }
  | { id: string; type: 'draw'; page: number; x: number; y: number; w: number; h: number; points: [number, number][]; color: string; stroke: number };

export async function applyAnnotations(doc: PDFDocument, annotations: Annotation[]) {
  const fonts = new Map<StandardFonts, PDFFont>();
  const getFont = async (sf: StandardFonts) => {
    if (!fonts.has(sf)) fonts.set(sf, await doc.embedFont(sf));
    return fonts.get(sf)!;
  };
  const pages = doc.getPages();
  for (const a of annotations) {
    const page = pages[a.page];
    if (!page) continue;
    const ds = displaySpace(page);
    const rot = degrees(ds.rotation);
    const [x, y] = ds.toPdf(a.x, a.y + a.h);
    switch (a.type) {
      case 'text': {
        if (!a.text.trim()) break;
        const font = await getFont(fontFor(a.font, a.bold, a.italic));
        const [r, g, b] = hexToRgb(a.color);
        const lines = a.text.split('\n');
        if (lines.every((l) => canEncode(font, l))) {
          lines.forEach((line, i) => {
            const [lx, ly] = ds.toPdf(a.x, a.y + a.size * (0.9 + i * 1.2));
            page.drawText(line, { x: lx, y: ly, size: a.size, font, color: rgb(r, g, b), rotate: rot });
          });
        } else {
          const img = await textImage(doc, a.text, a.size, a.color, a.bold, a.font === 'Times' ? 'serif' : a.font === 'Courier' ? 'monospace' : 'sans-serif');
          const [ix, iy] = ds.toPdf(a.x, a.y + img.height);
          page.drawImage(img.png, { x: ix, y: iy, width: img.width, height: img.height, rotate: rot });
        }
        break;
      }
      case 'image': {
        const bytes = dataUrlToBytes(a.src);
        const img = a.src.startsWith('data:image/jpeg') ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
        page.drawImage(img, { x, y, width: a.w, height: a.h, rotate: rot });
        break;
      }
      case 'rect': {
        const [r, g, b] = hexToRgb(a.color);
        page.drawRectangle({
          x, y, width: a.w, height: a.h, rotate: rot,
          ...(a.fill ? { color: rgb(r, g, b), opacity: a.opacity } : { borderColor: rgb(r, g, b), borderWidth: a.stroke ?? 2, borderOpacity: a.opacity }),
        });
        break;
      }
      case 'ellipse': {
        const [r, g, b] = hexToRgb(a.color);
        const [cx, cy] = ds.toPdf(a.x + a.w / 2, a.y + a.h / 2);
        const sideways = ds.rotation % 180 !== 0;
        page.drawEllipse({
          x: cx, y: cy, xScale: (sideways ? a.h : a.w) / 2, yScale: (sideways ? a.w : a.h) / 2,
          ...(a.fill ? { color: rgb(r, g, b), opacity: a.opacity } : { borderColor: rgb(r, g, b), borderWidth: a.stroke ?? 2, borderOpacity: a.opacity }),
        });
        break;
      }
      case 'draw': {
        if (a.points.length < 2) break;
        const [r, g, b] = hexToRgb(a.color);
        // drawSvgPath uses a y-down coordinate system anchored at (x, y).
        const [ox, oy] = ds.toPdf(0, 0);
        const path = a.points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`).join(' ');
        page.drawSvgPath(path, { x: ox, y: oy, borderColor: rgb(r, g, b), borderWidth: a.stroke, rotate: rot, borderLineCap: LineCapStyle.Round });
        break;
      }
    }
  }
}

export async function editPdf({ files, options }: ProcessContext): Promise<OutputFile[]> {
  const doc = await openPdfLib(files[0]);
  const annotations: Annotation[] = options.annotations ?? [];
  if (!annotations.length) throw new Error('Add some text, images, shapes or drawings to the document first');
  await applyAnnotations(doc, annotations);
  return [{ name: withSuffix(files[0].name, '_edited'), blob: pdfBlob(await doc.save()) }];
}

export async function signPdf({ files, options }: ProcessContext): Promise<OutputFile[]> {
  const doc = await openPdfLib(files[0]);
  const annotations: Annotation[] = options.annotations ?? [];
  if (!annotations.length) throw new Error('Place your signature on the document first');
  await applyAnnotations(doc, annotations);
  return [{ name: withSuffix(files[0].name, '_signed'), blob: pdfBlob(await doc.save()) }];
}

/**
 * True redaction: draw the boxes, then replace every affected page with a flattened
 * image so the hidden text and graphics are gone from the file, not just covered.
 */
export async function redactPdf({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const annotations: Annotation[] = options.annotations ?? [];
  if (!annotations.length) throw new Error('Mark at least one area to redact');
  const marked = await openPdfLib(files[0]);
  await applyAnnotations(marked, annotations);
  const markedBytes = await marked.save();

  const affected = [...new Set(annotations.map((a) => a.page))].sort((a, b) => a - b);
  const render = await openPdfJs(markedBytes);
  const out = await PDFDocument.load(markedBytes);
  for (let k = 0; k < affected.length; k++) {
    const idx = affected[k];
    progress(k / affected.length, `Flattening page ${idx + 1}`);
    const vp = (await render.getPage(idx + 1)).getViewport({ scale: 1 });
    const canvas = await renderPage(render, idx + 1, 200 / 72);
    const jpg = await out.embedJpg(await readBytes(await canvasToBlob(canvas, 'image/jpeg', 0.9)));
    out.removePage(idx);
    const page = out.insertPage(idx, [vp.width, vp.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: vp.width, height: vp.height });
  }
  await render.destroy();
  // Also scrub document metadata that could leak information.
  out.setTitle('');
  out.setAuthor('');
  out.setSubject('');
  out.setKeywords([]);
  return [{ name: withSuffix(files[0].name, '_redacted'), blob: pdfBlob(await out.save()) }];
}

export async function cropPdf({ files, options }: ProcessContext): Promise<OutputFile[]> {
  const doc = await openPdfLib(files[0]);
  const crop = options.crop as { page: number; x: number; y: number; w: number; h: number } | undefined;
  if (!crop || crop.w < 2 || crop.h < 2) throw new Error('Drag on the page to select the area to keep');
  const ref = displaySpace(doc.getPage(crop.page));
  // Crop is stored relative to the reference page so it can be applied to pages of other sizes.
  const rel = { x: crop.x / ref.width, y: crop.y / ref.height, w: crop.w / ref.width, h: crop.h / ref.height };
  doc.getPages().forEach((page, i) => {
    if (options.scope === 'current' && i !== crop.page) return;
    const ds = displaySpace(page);
    const [x1, y1] = ds.toPdf(rel.x * ds.width, rel.y * ds.height);
    const [x2, y2] = ds.toPdf((rel.x + rel.w) * ds.width, (rel.y + rel.h) * ds.height);
    const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    page.setCropBox(box.x, box.y, box.w, box.h);
    page.setMediaBox(box.x, box.y, box.w, box.h);
  });
  return [{ name: withSuffix(files[0].name, '_cropped'), blob: pdfBlob(await doc.save()) }];
}
