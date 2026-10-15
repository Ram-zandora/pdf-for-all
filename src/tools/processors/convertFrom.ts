import {
  baseName,
  canvasToBlob,
  extractLines,
  lineText,
  openPdfJs,
  readBytes,
  renderPage,
  type OutputFile,
} from '../../lib/pdf';
import type { ProcessContext } from '../types';
import { pdfjs } from '../../lib/pdf';

const QUALITY_DPI: Record<string, number> = { normal: 150, high: 300 };

export async function pdfToImages({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const format = options.format === 'png' ? 'png' : 'jpg';
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const doc = await openPdfJs(files[f]);
    const name = baseName(files[f].name);
    if (options.mode === 'extract') {
      let count = 0;
      for (let i = 1; i <= doc.numPages; i++) {
        progress((f + (i - 1) / doc.numPages) / files.length, `Scanning page ${i} for images`);
        const page = await doc.getPage(i);
        const ops = await page.getOperatorList();
        const seen = new Set<string>();
        for (let k = 0; k < ops.fnArray.length; k++) {
          if (ops.fnArray[k] !== pdfjs.OPS.paintImageXObject) continue;
          const id = ops.argsArray[k][0] as string;
          if (seen.has(id)) continue;
          seen.add(id);
          const img = await new Promise<{ width: number; height: number; data?: Uint8ClampedArray; bitmap?: ImageBitmap; kind?: number } | null>(
            (resolve) => {
              const store = id.startsWith('g_') ? page.commonObjs : page.objs;
              try {
                store.get(id, resolve);
              } catch {
                resolve(null);
              }
              setTimeout(() => resolve(null), 3000);
            },
          );
          if (!img || img.width < 8 || img.height < 8) continue;
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          if (img.bitmap) {
            ctx.drawImage(img.bitmap, 0, 0);
          } else if (img.data) {
            const rgba = new Uint8ClampedArray(img.width * img.height * 4);
            const px = img.width * img.height;
            if (img.data.length === px * 4) rgba.set(img.data);
            else if (img.data.length === px * 3) {
              for (let p = 0; p < px; p++) {
                rgba[p * 4] = img.data[p * 3];
                rgba[p * 4 + 1] = img.data[p * 3 + 1];
                rgba[p * 4 + 2] = img.data[p * 3 + 2];
                rgba[p * 4 + 3] = 255;
              }
            } else continue; // 1-bit masks and other packed formats are skipped
            ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
          } else continue;
          count++;
          outputs.push({ name: `${name}_image_${count}.${format}`, blob: await canvasToBlob(canvas, mime, 0.92) });
        }
      }
    } else {
      const dpi = QUALITY_DPI[options.quality] ?? 150;
      for (let i = 1; i <= doc.numPages; i++) {
        progress((f + (i - 1) / doc.numPages) / files.length, `Converting page ${i} of ${doc.numPages}`);
        const canvas = await renderPage(doc, i, dpi / 72);
        outputs.push({ name: `${name}_page_${i}.${format}`, blob: await canvasToBlob(canvas, mime, 0.92) });
      }
    }
    await doc.destroy();
  }
  if (!outputs.length) throw new Error('No embedded images were found in this PDF. Try “Page to image” instead.');
  return outputs;
}

export async function pdfToWord({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const docx = await import('docx');
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const pdf = await openPdfJs(files[f]);
    const sections: import('docx').ISectionOptions[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      progress((f + (i - 1) / pdf.numPages) / files.length, `Converting page ${i} of ${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const pageProps = {
        page: {
          size: { width: docx.convertInchesToTwip(vp.width / 72), height: docx.convertInchesToTwip(vp.height / 72) },
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        },
      };
      if (options.mode === 'layout') {
        const canvas = await renderPage(pdf, i, 2);
        sections.push({
          properties: pageProps,
          children: [
            new docx.Paragraph({
              children: [
                new docx.ImageRun({
                  type: 'jpg',
                  data: await readBytes(await canvasToBlob(canvas, 'image/jpeg', 0.9)),
                  transformation: { width: (vp.width / 72) * 96 - 1, height: (vp.height / 72) * 96 - 2 },
                }),
              ],
            }),
          ],
        });
        continue;
      }
      const { lines } = await extractLines(pdf, i);
      const left = Math.min(...lines.map((l) => l.items[0].x), 72);
      // Body text size = most common line height on the page.
      const sizes = lines.map((l) => Math.round(Math.max(...l.items.map((it) => it.height))));
      const freq = new Map<number, number>();
      sizes.forEach((s) => freq.set(s, (freq.get(s) ?? 0) + 1));
      const body = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
      const children: import('docx').Paragraph[] = [];
      let prevY = lines[0]?.y ?? 0;
      lines.forEach((line, idx) => {
        const size = sizes[idx];
        const gap = line.y - prevY;
        prevY = line.y;
        const bold = /bold|black|heavy/i.test(line.items[0].fontName) || size > body * 1.25;
        children.push(
          new docx.Paragraph({
            spacing: { before: idx && gap > size * 1.9 ? Math.round((gap - size * 1.2) * 20) : 0, after: 0 },
            indent: { left: Math.max(0, Math.round((line.items[0].x - left) * 20)) },
            children: [new docx.TextRun({ text: lineText(line), size: Math.max(12, Math.round(size * 2)), bold })],
          }),
        );
      });
      if (!children.length) children.push(new docx.Paragraph({ children: [] }));
      sections.push({
        properties: { ...pageProps, page: { ...pageProps.page, margin: { top: 720, bottom: 720, left: Math.round(left * 20), right: 720 } } },
        children,
      });
    }
    await pdf.destroy();
    const document = new docx.Document({ creator: 'PDF for All', sections });
    outputs.push({ name: `${baseName(files[f].name)}.docx`, blob: await docx.Packer.toBlob(document) });
  }
  return outputs;
}

export async function pdfToPowerPoint({ files, progress }: ProcessContext): Promise<OutputFile[]> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const pdf = await openPdfJs(files[f]);
    const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
    const pptx = new PptxGenJS();
    const w = 10;
    const h = (first.height / first.width) * w;
    pptx.defineLayout({ name: 'PDF', width: w, height: h });
    pptx.layout = 'PDF';
    for (let i = 1; i <= pdf.numPages; i++) {
      progress((f + (i - 1) / pdf.numPages) / files.length, `Converting page ${i} of ${pdf.numPages}`);
      const canvas = await renderPage(pdf, i, 2);
      const slide = pptx.addSlide();
      slide.addImage({ data: canvas.toDataURL('image/jpeg', 0.9), x: 0, y: 0, w, h });
      // Keep the page text in the speaker notes so it stays searchable/editable.
      const { lines } = await extractLines(pdf, i);
      if (lines.length) slide.addNotes(lines.map(lineText).join('\n'));
    }
    await pdf.destroy();
    const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
    outputs.push({ name: `${baseName(files[f].name)}.pptx`, blob });
  }
  return outputs;
}

export async function pdfToExcel({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const XLSX = await import('xlsx');
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const pdf = await openPdfJs(files[f]);
    const wb = XLSX.utils.book_new();
    const allRows: (string | number)[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      progress((f + (i - 1) / pdf.numPages) / files.length, `Reading tables on page ${i}`);
      const { lines } = await extractLines(pdf, i);
      // Column boundaries: cluster item start positions across the whole page.
      const starts = lines.flatMap((l) => cells(l).map((c) => c.x)).sort((a, b) => a - b);
      const cols: number[] = [];
      for (const x of starts) if (!cols.length || x - cols[cols.length - 1] > 12) cols.push(x);
      const rows = lines.map((l) => {
        const row: (string | number)[] = new Array(cols.length).fill('');
        for (const c of cells(l)) {
          let col = 0;
          for (let k = 0; k < cols.length; k++) if (cols[k] <= c.x + 6) col = k;
          const num = c.text.replace(/[,\s]/g, '');
          const value = /^-?\d+(\.\d+)?$/.test(num) ? Number(num) : c.text;
          row[col] = row[col] === '' ? value : `${row[col]} ${c.text}`;
        }
        return row;
      });
      if (options.sheets === 'single') {
        allRows.push(...rows);
        if (i < pdf.numPages) allRows.push([]);
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows.length ? rows : [['(no text on this page)']]), `Page ${i}`);
      }
    }
    if (options.sheets === 'single') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(allRows), 'Sheet1');
    await pdf.destroy();
    const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    outputs.push({
      name: `${baseName(files[f].name)}.xlsx`,
      blob: new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    });
  }
  return outputs;
}

/** Split a line into cells wherever there is a wide horizontal gap between text items. */
function cells(line: import('../../lib/pdf').TextLine): { x: number; text: string }[] {
  const out: { x: number; text: string; end: number }[] = [];
  for (const it of line.items) {
    const last = out[out.length - 1];
    if (last && it.x - last.end < it.height * 1.2) {
      last.text += (it.x - last.end > it.height * 0.15 ? ' ' : '') + it.str;
      last.end = it.x + it.width;
    } else {
      out.push({ x: it.x, text: it.str, end: it.x + it.width });
    }
  }
  return out.map(({ x, text }) => ({ x, text: text.trim() })).filter((c) => c.text);
}
