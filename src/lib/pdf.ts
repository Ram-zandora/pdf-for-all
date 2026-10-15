import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from '@cantoo/pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };

export interface OutputFile {
  name: string;
  blob: Blob;
}

export type Progress = (fraction: number, label?: string) => void;

export const PDF_MIME = 'application/pdf';

export async function readBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Open a document with pdf.js (for rendering and text extraction). */
export async function openPdfJs(data: Blob | Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const bytes = data instanceof Uint8Array ? data.slice() : await readBytes(data);
  return pdfjs.getDocument({ data: bytes, password, isEvalSupported: false }).promise;
}

/** Open a document with pdf-lib (for editing). Encrypted files are opened leniently. */
export async function openPdfLib(file: Blob | Uint8Array, password?: string): Promise<PDFDocument> {
  const bytes = file instanceof Uint8Array ? file : await readBytes(file);
  return PDFDocument.load(bytes, password ? { password } : { ignoreEncryption: true });
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: PDF_MIME });
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export function withSuffix(name: string, suffix: string, ext = 'pdf'): string {
  return `${baseName(name)}${suffix}.${ext}`;
}

export async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), type, quality),
  );
}

/** Render a single page (1-based) to a canvas at the given scale. */
export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

/** Render a page to fit a target width, returning a data URL (used for thumbnails). */
export async function renderThumb(doc: PDFDocumentProxy, pageNumber: number, width = 180): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const canvas = await renderPage(doc, pageNumber, width / vp.width);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Parse a page-range expression like "1-3, 5, 8-" into 0-based page indices.
 * Ranges are returned as groups so split can make one file per group.
 */
export function parseRanges(expr: string, pageCount: number): number[][] {
  const groups: number[][] = [];
  for (const raw of expr.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    let from: number;
    let to: number;
    if (m) {
      from = m[1] ? parseInt(m[1], 10) : 1;
      to = m[2] ? parseInt(m[2], 10) : pageCount;
    } else if (/^\d+$/.test(part)) {
      from = to = parseInt(part, 10);
    } else {
      throw new Error(`Invalid page range "${part}"`);
    }
    from = Math.max(1, from);
    to = Math.min(pageCount, to);
    if (from > to) throw new Error(`Range "${part}" is outside the document (1-${pageCount})`);
    const group: number[] = [];
    for (let i = from; i <= to; i++) group.push(i - 1);
    groups.push(group);
  }
  if (!groups.length) throw new Error('Please enter at least one page range');
  return groups;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/** Convert any browser-decodable image to PNG or JPEG bytes that pdf-lib can embed. */
export async function imageToEmbeddable(file: Blob): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg'; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      return { bytes: await readBytes(file), type: file.type === 'image/png' ? 'png' : 'jpg', width: img.naturalWidth, height: img.naturalHeight };
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const blob = await canvasToBlob(canvas, 'image/png');
    return { bytes: await readBytes(blob), type: 'png', width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Text lines of a page, grouped by baseline, sorted top-to-bottom then left-to-right. */
export interface TextLine {
  y: number;
  items: { x: number; width: number; str: string; height: number; fontName: string }[];
}

export async function extractLines(doc: PDFDocumentProxy, pageNumber: number): Promise<{ lines: TextLine[]; width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const lines: TextLine[] = [];
  for (const it of content.items) {
    if (!('str' in it) || !it.str.trim()) continue;
    const [, , , d, e, f] = it.transform;
    const y = vp.height - f;
    const h = Math.abs(d) || it.height || 10;
    let line = lines.find((l) => Math.abs(l.y - y) < h * 0.5);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ x: e, width: it.width, str: it.str, height: h, fontName: it.fontName });
  }
  lines.sort((a, b) => a.y - b.y);
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
  return { lines, width: vp.width, height: vp.height };
}

export function lineText(line: TextLine): string {
  let out = '';
  let lastEnd = -Infinity;
  for (const it of line.items) {
    if (out && it.x - lastEnd > it.height * 0.15 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
    out += it.str;
    lastEnd = it.x + it.width;
  }
  return out;
}

export async function extractPageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const { lines } = await extractLines(doc, pageNumber);
  return lines.map(lineText).join('\n');
}
