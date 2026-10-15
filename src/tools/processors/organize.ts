import JSZip from 'jszip';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { openPdfLib, parseRanges, pdfBlob, withSuffix, baseName, type OutputFile } from '../../lib/pdf';
import type { ProcessContext } from '../types';

export async function merge({ files, progress }: ProcessContext): Promise<OutputFile[]> {
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    progress(i / files.length, `Merging ${files[i].name}`);
    const src = await openPdfLib(files[i]);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return [{ name: 'merged.pdf', blob: pdfBlob(await out.save()) }];
}

async function subset(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

export async function split({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const file = files[0];
  const src = await openPdfLib(file);
  const count = src.getPageCount();
  let groups: number[][];
  if (options.mode === 'fixed') {
    const n = Math.max(1, Number(options.every) || 1);
    groups = [];
    for (let i = 0; i < count; i += n) groups.push(Array.from({ length: Math.min(n, count - i) }, (_, k) => i + k));
  } else if (options.mode === 'all') {
    groups = src.getPageIndices().map((i) => [i]);
  } else {
    groups = parseRanges(options.ranges || '', count);
  }

  if (options.mode === 'range' && options.mergeRanges) {
    return [{ name: withSuffix(file.name, '_split'), blob: pdfBlob(await subset(src, groups.flat())) }];
  }

  const outputs: OutputFile[] = [];
  for (let g = 0; g < groups.length; g++) {
    progress(g / groups.length, `Creating part ${g + 1} of ${groups.length}`);
    const grp = groups[g];
    const label = grp.length === 1 ? `${grp[0] + 1}` : `${grp[0] + 1}-${grp[grp.length - 1] + 1}`;
    outputs.push({ name: `${baseName(file.name)}_${label}.pdf`, blob: pdfBlob(await subset(src, grp)) });
  }
  return outputs;
}

export async function removePages({ files, options }: ProcessContext): Promise<OutputFile[]> {
  const src = await openPdfLib(files[0]);
  const count = src.getPageCount();
  const remove = new Set(parseRanges(options.ranges || '', count).flat());
  const keep = src.getPageIndices().filter((i) => !remove.has(i));
  if (!keep.length) throw new Error('You cannot remove every page of the document');
  return [{ name: withSuffix(files[0].name, '_removed'), blob: pdfBlob(await subset(src, keep)) }];
}

export async function extractPages({ files, options }: ProcessContext): Promise<OutputFile[]> {
  const src = await openPdfLib(files[0]);
  const groups = parseRanges(options.ranges || '', src.getPageCount());
  if (options.separate) {
    const outputs: OutputFile[] = [];
    for (const i of groups.flat()) {
      outputs.push({ name: `${baseName(files[0].name)}_page_${i + 1}.pdf`, blob: pdfBlob(await subset(src, [i])) });
    }
    return outputs;
  }
  return [{ name: withSuffix(files[0].name, '_extracted'), blob: pdfBlob(await subset(src, groups.flat())) }];
}

export interface PageRef {
  file: number;
  page: number;
  rotate: number;
  blank?: boolean;
}

export async function organize({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const pages: PageRef[] = options.pages;
  if (!pages?.length) throw new Error('There are no pages left in the document');
  const sources = await Promise.all(files.map((f) => openPdfLib(f)));
  const out = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    progress(i / pages.length);
    const ref = pages[i];
    if (ref.blank) {
      const neighbour = pages.find((p) => !p.blank);
      const size = neighbour ? sources[neighbour.file].getPage(neighbour.page).getSize() : { width: 595.28, height: 841.89 };
      const p = out.addPage([size.width, size.height]);
      p.setRotation(degrees(ref.rotate));
      continue;
    }
    const [copy] = await out.copyPages(sources[ref.file], [ref.page]);
    copy.setRotation(degrees((copy.getRotation().angle + ref.rotate) % 360));
    out.addPage(copy);
  }
  return [{ name: withSuffix(files[0].name, '_organized'), blob: pdfBlob(await out.save()) }];
}

export async function rotate({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const angle = Number(options.angle) || 90;
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    progress(f / files.length, `Rotating ${files[f].name}`);
    const doc = await openPdfLib(files[f]);
    const count = doc.getPageCount();
    let targets: Set<number>;
    if (options.which === 'odd') targets = new Set(doc.getPageIndices().filter((i) => i % 2 === 0));
    else if (options.which === 'even') targets = new Set(doc.getPageIndices().filter((i) => i % 2 === 1));
    else if (options.which === 'range') targets = new Set(parseRanges(options.ranges || '', count).flat());
    else targets = new Set(doc.getPageIndices());
    doc.getPages().forEach((p, i) => {
      if (targets.has(i)) p.setRotation(degrees((p.getRotation().angle + angle + 360) % 360));
    });
    outputs.push({ name: withSuffix(files[f].name, '_rotated'), blob: pdfBlob(await doc.save()) });
  }
  return outputs;
}

/** Bundle several outputs into one zip (used by the download page). */
export async function zipOutputs(outputs: OutputFile[]): Promise<Blob> {
  const zip = new JSZip();
  const seen = new Map<string, number>();
  for (const o of outputs) {
    let name = o.name;
    const n = seen.get(name) ?? 0;
    if (n) name = `${baseName(name)} (${n})${o.name.slice(baseName(o.name).length)}`;
    seen.set(o.name, n + 1);
    zip.file(name, o.blob);
  }
  return zip.generateAsync({ type: 'blob' });
}
