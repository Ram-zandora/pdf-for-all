import { PDFDocument, type PDFAConformanceLevel } from '@cantoo/pdf-lib';
import {
  canvasToBlob,
  openPdfJs,
  openPdfLib,
  pdfBlob,
  readBytes,
  renderPage,
  withSuffix,
  type OutputFile,
  type Progress,
} from '../../lib/pdf';
import type { ProcessContext } from '../types';
// Serve the OCR worker and engine from this site; only language data comes from the CDN.
import tesseractWorkerUrl from 'tesseract.js/dist/worker.min.js?url';
import tesseractCoreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import tesseractCoreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';

function wasmSimdSupported(): boolean {
  try {
    // Smallest module using a v128 instruction.
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

/** Rebuild a document from page images. Used by compression, repair and redaction. */
export async function rasterize(
  data: Blob | Uint8Array,
  { dpi, quality, progress, password }: { dpi: number; quality: number; progress?: Progress; password?: string },
): Promise<Uint8Array> {
  const src = await openPdfJs(data, password);
  const out = await PDFDocument.create();
  for (let i = 1; i <= src.numPages; i++) {
    progress?.((i - 1) / src.numPages, `Processing page ${i} of ${src.numPages}`);
    const page = await src.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const canvas = await renderPage(src, i, dpi / 72);
    const jpg = await out.embedJpg(await readBytes(await canvasToBlob(canvas, 'image/jpeg', quality)));
    const p = out.addPage([vp.width, vp.height]);
    p.drawImage(jpg, { x: 0, y: 0, width: vp.width, height: vp.height });
  }
  await src.destroy();
  return out.save();
}

const LEVELS: Record<string, { dpi: number; quality: number }> = {
  recommended: { dpi: 120, quality: 0.65 },
  extreme: { dpi: 72, quality: 0.45 },
};

export async function compress({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    const step = (x: number, l?: string) => progress((f + x) / files.length, l ?? `Compressing ${file.name}`);
    step(0);
    // Lossless pass: drop unused objects, pack into object streams, strip metadata.
    const doc = await openPdfLib(file);
    doc.setProducer('PDF for All');
    doc.setCreator('PDF for All');
    let best = await doc.save({ useObjectStreams: true });
    const level = LEVELS[options.level];
    if (level) {
      const raster = await rasterize(file, { ...level, progress: (x, l) => step(x * 0.95, l) });
      if (raster.length < best.length) best = raster;
    }
    // Never hand back something larger than the original.
    const original = await readBytes(file);
    if (best.length >= original.length) best = original;
    outputs.push({ name: withSuffix(file.name, '_compressed'), blob: pdfBlob(best) });
  }
  return outputs;
}

export async function repair({ files, progress }: ProcessContext): Promise<OutputFile[]> {
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    progress(f / files.length, `Repairing ${file.name}`);
    let bytes: Uint8Array;
    try {
      // pdf-lib rebuilds the cross-reference table from scratch when it saves.
      const doc = await PDFDocument.load(await readBytes(file), { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
      if (doc.getPageCount() === 0) throw new Error('no pages');
      // Copy pages into a fresh document so broken leftovers are dropped.
      const out = await PDFDocument.create();
      (await out.copyPages(doc, doc.getPageIndices())).forEach((p) => out.addPage(p));
      bytes = await out.save();
    } catch {
      // Fall back to pdf.js, which tolerates far more damage, and rebuild from page images.
      bytes = await rasterize(file, { dpi: 150, quality: 0.85, progress: (x) => progress((f + x) / files.length) });
    }
    outputs.push({ name: withSuffix(file.name, '_repaired'), blob: pdfBlob(bytes) });
  }
  return outputs;
}

export async function toPdfA({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    progress(f / files.length, `Converting ${files[f].name}`);
    const doc = await openPdfLib(files[f]);
    if (doc.isEncrypted) throw new Error(`${files[f].name} is password protected. Unlock it first.`);
    doc.convertToPDFA({ conformance: (options.conformance || '2B') as PDFAConformanceLevel });
    outputs.push({ name: withSuffix(files[f].name, '_pdfa'), blob: pdfBlob(await doc.save({ useObjectStreams: false })) });
  }
  return outputs;
}

export async function ocr({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  progress(0, 'Loading OCR engine…');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(options.language || 'eng', 1, {
    workerPath: tesseractWorkerUrl,
    corePath: wasmSimdSupported() ? tesseractCoreSimdUrl : tesseractCoreUrl,
    workerBlobURL: false,
    // English ships with the app; other languages are downloaded on demand from the CDN.
    ...((options.language || 'eng') === 'eng' ? { langPath: new URL('tessdata', document.baseURI).href } : {}),
    logger: (m: { status: string; progress: number }) => {
      if (m.status.startsWith('loading')) progress(0, `Loading OCR engine (${Math.round(m.progress * 100)}%)`);
    },
  });
  const outputs: OutputFile[] = [];
  try {
    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      const out = await PDFDocument.create();
      const isImage = file.type.startsWith('image/');
      const src = isImage ? null : await openPdfJs(file);
      const total = src ? src.numPages : 1;
      for (let i = 1; i <= total; i++) {
        progress((f + (i - 1) / total) / files.length, `Recognizing text: page ${i} of ${total}`);
        let image: HTMLCanvasElement | Blob;
        let size: [number, number] | null = null;
        if (src) {
          const vp = (await src.getPage(i)).getViewport({ scale: 1 });
          size = [vp.width, vp.height];
          image = await renderPage(src, i, 300 / 72);
        } else {
          image = file;
        }
        const res = await worker.recognize(image, {}, { pdf: true, text: false, blocks: false, hocr: false, tsv: false });
        const pagePdf = await PDFDocument.load(new Uint8Array(res.data.pdf as number[]));
        const [page] = await out.copyPages(pagePdf, [0]);
        if (size) {
          // Tesseract sizes pages from pixel dimensions; scale back to the original page size.
          const { width, height } = page.getSize();
          page.scaleContent(size[0] / width, size[1] / height);
          page.setSize(size[0], size[1]);
        }
        out.addPage(page);
      }
      await src?.destroy();
      outputs.push({ name: withSuffix(file.name, '_ocr'), blob: pdfBlob(await out.save()) });
    }
  } finally {
    await worker.terminate();
  }
  return outputs;
}
