import { PDFDocument } from '@cantoo/pdf-lib';
import JSZip from 'jszip';
import {
  canvasToBlob,
  imageToEmbeddable,
  pdfBlob,
  readBytes,
  withSuffix,
  type OutputFile,
  type Progress,
} from '../../lib/pdf';
import type { ProcessContext } from '../types';

export const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
};

const MARGINS: Record<string, number> = { none: 0, small: 20, big: 50 };

export async function imagesToPdf({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const margin = MARGINS[options.margin] ?? 0;
  const merge = options.merge !== false;
  const outputs: OutputFile[] = [];
  let doc = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    progress(i / files.length, `Adding ${files[i].name}`);
    const img = await imageToEmbeddable(files[i]);
    const embedded = img.type === 'png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    let pw: number;
    let ph: number;
    if (options.pageSize === 'fit') {
      pw = img.width * 0.75 + margin * 2;
      ph = img.height * 0.75 + margin * 2;
    } else {
      [pw, ph] = PAGE_SIZES[options.pageSize] ?? PAGE_SIZES.a4;
      const landscape = options.orientation === 'landscape' || (options.orientation === 'auto' && img.width > img.height);
      if (landscape) [pw, ph] = [ph, pw];
    }
    const boxW = pw - margin * 2;
    const boxH = ph - margin * 2;
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const page = doc.addPage([pw, ph]);
    page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    if (!merge) {
      outputs.push({ name: withSuffix(files[i].name, ''), blob: pdfBlob(await doc.save()) });
      doc = await PDFDocument.create();
    }
  }
  if (merge) outputs.push({ name: files.length === 1 ? withSuffix(files[0].name, '') : 'images.pdf', blob: pdfBlob(await doc.save()) });
  return outputs;
}

/**
 * Render an HTML document to PDF pages. The markup is loaded in a sandboxed iframe
 * (scripts disabled), captured with html2canvas and sliced into pages.
 */
export async function htmlToPdfBytes(
  html: string,
  { pageSize = 'a4', landscape = false, margin = 36, progress }: { pageSize?: string; landscape?: boolean; margin?: number; progress?: Progress } = {},
): Promise<Uint8Array> {
  const { default: html2canvas } = await import('html2canvas');
  let [pw, ph] = PAGE_SIZES[pageSize] ?? PAGE_SIZES.a4;
  if (landscape) [pw, ph] = [ph, pw];
  const cssWidth = Math.round(((pw - margin * 2) / 72) * 96);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${cssWidth}px;height:1000px;border:0;background:#fff`;
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
    });
    const idoc = iframe.contentDocument!;
    // Give web fonts and images a moment to settle.
    await Promise.all(
      Array.from(idoc.images).map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))),
    );
    await new Promise((r) => setTimeout(r, 150));
    const body = idoc.body;
    if (!body.style.background && !getComputedStyle(body).backgroundColor.match(/rgb\((?!0, 0, 0)/)) body.style.background = '#fff';
    const fullHeight = Math.max(body.scrollHeight, idoc.documentElement.scrollHeight, 1);
    iframe.style.height = `${fullHeight}px`;
    progress?.(0.3, 'Rendering page');
    const canvas = await html2canvas(idoc.documentElement, {
      scale: 2,
      width: cssWidth,
      windowWidth: cssWidth,
      height: fullHeight,
      windowHeight: fullHeight,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    const out = await PDFDocument.create();
    const pxPerPt = canvas.width / (pw - margin * 2);
    const sliceH = Math.floor((ph - margin * 2) * pxPerPt);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    const pages = Math.max(1, Math.ceil(canvas.height / sliceH));
    for (let i = 0; i < pages; i++) {
      progress?.(0.4 + (0.6 * i) / pages, `Creating page ${i + 1} of ${pages}`);
      const h = Math.min(sliceH, canvas.height - i * sliceH);
      slice.height = h;
      const ctx = slice.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, slice.width, h);
      ctx.drawImage(canvas, 0, i * sliceH, canvas.width, h, 0, 0, canvas.width, h);
      const jpg = await out.embedJpg(await readBytes(await canvasToBlob(slice, 'image/jpeg', 0.92)));
      const page = out.addPage([pw, ph]);
      page.drawImage(jpg, { x: margin, y: ph - margin - h / pxPerPt, width: canvas.width / pxPerPt, height: h / pxPerPt });
    }
    return out.save();
  } finally {
    iframe.remove();
  }
}

const DOC_CSS = `
  body{font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.4;color:#111;margin:0;padding:0}
  img{max-width:100%;height:auto}
  table{border-collapse:collapse;margin:8px 0}
  td,th{border:1px solid #bbb;padding:4px 6px;vertical-align:top}
  h1{font-size:20pt}h2{font-size:16pt}h3{font-size:13pt}
  p{margin:0 0 8px}
`;

export async function wordToPdf({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const mammoth = await import('mammoth');
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    progress(f / files.length, `Reading ${file.name}`);
    if (!file.name.toLowerCase().endsWith('.docx')) throw new Error(`${file.name}: only .docx files are supported. Save legacy .doc files as .docx first.`);
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${DOC_CSS}</style></head><body>${value}</body></html>`;
    const bytes = await htmlToPdfBytes(html, {
      pageSize: options.pageSize,
      landscape: options.orientation === 'landscape',
      progress: (x, l) => progress((f + x) / files.length, l),
    });
    outputs.push({ name: withSuffix(file.name, ''), blob: pdfBlob(bytes) });
  }
  return outputs;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export async function excelToPdf({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const XLSX = await import('xlsx');
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    progress(f / files.length, `Reading ${file.name}`);
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true });
    const parts = wb.SheetNames.map((name) => {
      const table = XLSX.utils.sheet_to_html(wb.Sheets[name], { header: '', footer: '' });
      return `<h2>${escapeHtml(name)}</h2>${table}`;
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${DOC_CSS}
      body{font-size:9pt} h2{font-size:12pt;margin:12px 0 4px} td{white-space:nowrap}
      h2:not(:first-child){page-break-before:always}</style></head><body>${parts.join('')}</body></html>`;
    const bytes = await htmlToPdfBytes(html, {
      pageSize: options.pageSize,
      landscape: options.orientation !== 'portrait',
      margin: 24,
      progress: (x, l) => progress((f + x) / files.length, l),
    });
    outputs.push({ name: withSuffix(file.name, ''), blob: pdfBlob(bytes) });
  }
  return outputs;
}

const EMU_PER_PT = 12700;

/** Minimal PowerPoint renderer: positions text boxes and pictures from the slide XML. */
export async function pptToPdf({ files, progress }: ProcessContext): Promise<OutputFile[]> {
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    if (!file.name.toLowerCase().endsWith('.pptx')) throw new Error(`${file.name}: only .pptx files are supported.`);
    progress(f / files.length, `Reading ${file.name}`);
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const parser = new DOMParser();
    const xml = async (path: string) => {
      const entry = zip.file(path);
      return entry ? parser.parseFromString(await entry.async('text'), 'application/xml') : null;
    };
    const pres = await xml('ppt/presentation.xml');
    const sldSz = pres?.getElementsByTagName('p:sldSz')[0];
    const slideW = Number(sldSz?.getAttribute('cx') ?? 9144000) / EMU_PER_PT;
    const slideH = Number(sldSz?.getAttribute('cy') ?? 6858000) / EMU_PER_PT;

    // Slide order comes from presentation.xml relationships.
    const presRels = await xml('ppt/_rels/presentation.xml.rels');
    const relTarget = new Map<string, string>();
    Array.from(presRels?.getElementsByTagName('Relationship') ?? []).forEach((r) => relTarget.set(r.getAttribute('Id')!, r.getAttribute('Target')!));
    const slidePaths = Array.from(pres?.getElementsByTagName('p:sldId') ?? [])
      .map((s) => relTarget.get(s.getAttribute('r:id')!))
      .filter(Boolean)
      .map((t) => 'ppt/' + t!.replace(/^\/?ppt\//, '').replace(/^\.\.\//, ''));

    const scale = 960 / slideW;
    const htmlSlides: string[] = [];
    for (let s = 0; s < slidePaths.length; s++) {
      progress((f + (s / slidePaths.length) * 0.5) / files.length, `Reading slide ${s + 1}`);
      const path = slidePaths[s];
      const doc = await xml(path);
      if (!doc) continue;
      const relsDoc = await xml(path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
      const rels = new Map<string, string>();
      Array.from(relsDoc?.getElementsByTagName('Relationship') ?? []).forEach((r) => rels.set(r.getAttribute('Id')!, r.getAttribute('Target')!));

      let bg = '#ffffff';
      const bgFill = doc.getElementsByTagName('p:bg')[0]?.getElementsByTagName('a:srgbClr')[0];
      if (bgFill) bg = '#' + bgFill.getAttribute('val');

      const parts: string[] = [];
      const box = (el: Element) => {
        const off = el.getElementsByTagName('a:off')[0];
        const ext = el.getElementsByTagName('a:ext')[0];
        if (!off || !ext) return null;
        const v = (n: Element, a: string) => (Number(n.getAttribute(a)) / EMU_PER_PT) * scale;
        return `left:${v(off, 'x')}px;top:${v(off, 'y')}px;width:${v(ext, 'cx')}px;height:${v(ext, 'cy')}px;`;
      };
      for (const pic of Array.from(doc.getElementsByTagName('p:pic'))) {
        const pos = box(pic);
        const embed = pic.getElementsByTagName('a:blip')[0]?.getAttribute('r:embed');
        const target = embed && rels.get(embed);
        if (!pos || !target) continue;
        const imgPath = 'ppt/' + target.replace(/^\.\.\//, '');
        const entry = zip.file(imgPath);
        if (!entry) continue;
        const ext = imgPath.split('.').pop()!.toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        parts.push(`<img style="position:absolute;${pos}object-fit:fill" src="data:${mime};base64,${await entry.async('base64')}">`);
      }
      for (const sp of Array.from(doc.getElementsByTagName('p:sp'))) {
        const pos = box(sp);
        const paras = Array.from(sp.getElementsByTagName('a:p')).map((p) => {
          const runs = Array.from(p.getElementsByTagName('a:r')).map((r) => {
            const rPr = r.getElementsByTagName('a:rPr')[0];
            const sz = Number(rPr?.getAttribute('sz') ?? 1800) / 100;
            const color = rPr?.getElementsByTagName('a:srgbClr')[0]?.getAttribute('val');
            const style = [
              `font-size:${sz * scale}px`,
              rPr?.getAttribute('b') === '1' ? 'font-weight:bold' : '',
              rPr?.getAttribute('i') === '1' ? 'font-style:italic' : '',
              rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none' ? 'text-decoration:underline' : '',
              color ? `color:#${color}` : '',
            ].join(';');
            return `<span style="${style}">${escapeHtml(r.getElementsByTagName('a:t')[0]?.textContent ?? '')}</span>`;
          });
          const algn = p.getElementsByTagName('a:pPr')[0]?.getAttribute('algn');
          const align = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : 'left';
          return `<p style="margin:0 0 4px;text-align:${align}">${runs.join('') || '&nbsp;'}</p>`;
        });
        const fill = sp.getElementsByTagName('p:spPr')[0]?.getElementsByTagName('a:solidFill')[0]?.getElementsByTagName('a:srgbClr')[0]?.getAttribute('val');
        if (!pos) {
          if (paras.length) parts.push(`<div style="position:relative;padding:20px">${paras.join('')}</div>`);
          continue;
        }
        parts.push(`<div style="position:absolute;${pos}overflow:hidden;padding:4px;box-sizing:border-box;${fill ? `background:#${fill};` : ''}">${paras.join('')}</div>`);
      }
      htmlSlides.push(`<div class="slide" style="background:${bg}">${parts.join('')}</div>`);
    }
    if (!htmlSlides.length) throw new Error(`${file.name} does not contain any slides`);

    // Render each slide individually so pages map 1:1 to slides.
    const { default: html2canvas } = await import('html2canvas');
    const out = await PDFDocument.create();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0';
    document.body.appendChild(host);
    try {
      for (let s = 0; s < htmlSlides.length; s++) {
        progress((f + 0.5 + (s / htmlSlides.length) * 0.5) / files.length, `Rendering slide ${s + 1} of ${htmlSlides.length}`);
        host.innerHTML = `<style>.slide{position:relative;width:960px;height:${slideH * scale}px;overflow:hidden;font-family:Calibri,Carlito,Arial,sans-serif;color:#000}</style>${htmlSlides[s]}`;
        await Promise.all(Array.from(host.querySelectorAll('img')).map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
        const canvas = await html2canvas(host.querySelector('.slide') as HTMLElement, { scale: 2, logging: false, backgroundColor: null });
        const jpg = await out.embedJpg(await readBytes(await canvasToBlob(canvas, 'image/jpeg', 0.9)));
        out.addPage([slideW, slideH]).drawImage(jpg, { x: 0, y: 0, width: slideW, height: slideH });
      }
    } finally {
      host.remove();
    }
    outputs.push({ name: withSuffix(file.name, ''), blob: pdfBlob(await out.save()) });
  }
  return outputs;
}

export async function htmlToPdf({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const render = (html: string) =>
    htmlToPdfBytes(html, {
      pageSize: options.pageSize,
      landscape: options.orientation === 'landscape',
      margin: MARGINS[options.margin] ?? 20,
      progress,
    });
  if (files.length) {
    const outputs: OutputFile[] = [];
    for (const file of files) outputs.push({ name: withSuffix(file.name, ''), blob: pdfBlob(await render(await file.text())) });
    return outputs;
  }
  if (options.source === 'url') {
    let url: URL;
    try {
      url = new URL(options.url.trim().match(/^https?:\/\//) ? options.url.trim() : `https://${options.url.trim()}`);
    } catch {
      throw new Error('Please enter a valid web address');
    }
    progress(0.05, 'Fetching page…');
    let html: string;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      html = await res.text();
    } catch {
      throw new Error(
        `The website ${url.host} does not allow other sites to read it (CORS). Save the page from your browser (Ctrl+S) and upload the .html file, or paste its HTML instead.`,
      );
    }
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${url.href}">`);
    return [{ name: `${url.host}.pdf`, blob: pdfBlob(await render(html)) }];
  }
  if (!options.html?.trim()) throw new Error('Please paste some HTML');
  return [{ name: 'webpage.pdf', blob: pdfBlob(await render(options.html)) }];
}


/** Scan to PDF: optional document-style filters, then lay the shots out as pages. */
export async function scanToPdf(ctx: ProcessContext): Promise<OutputFile[]> {
  const filter = ctx.options.filter as string;
  if (!filter || filter === 'none') return imagesToPdf({ ...ctx, options: { ...ctx.options, merge: true } });
  const processed: File[] = [];
  for (const file of ctx.files) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const c = canvas.getContext('2d')!;
      c.drawImage(img, 0, 0);
      const data = c.getImageData(0, 0, canvas.width, canvas.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (filter === 'bw') {
          const v = lum > 150 ? 255 : lum < 90 ? 0 : (lum - 90) * (255 / 60);
          d[i] = d[i + 1] = d[i + 2] = v;
        } else if (filter === 'gray') {
          d[i] = d[i + 1] = d[i + 2] = lum;
        } else if (filter === 'enhance') {
          for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, (d[i + k] - 128) * 1.35 + 150));
        }
      }
      c.putImageData(data, 0, 0);
      processed.push(new File([await canvasToBlob(canvas, 'image/jpeg', 0.9)], file.name, { type: 'image/jpeg' }));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const [out] = await imagesToPdf({ ...ctx, files: processed, options: { ...ctx.options, merge: true } });
  return [{ ...out, name: 'scan.pdf' }];
}
