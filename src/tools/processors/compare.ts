import { diffWordsWithSpace, type Change } from 'diff';
import { baseName, extractPageText, openPdfJs, type OutputFile } from '../../lib/pdf';
import type { ProcessContext } from '../types';

export async function documentText(file: File): Promise<string[]> {
  const doc = await openPdfJs(file);
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push(await extractPageText(doc, i));
  await doc.destroy();
  return pages;
}

export interface Comparison {
  changes: Change[];
  added: number;
  removed: number;
}

export function compareTexts(a: string, b: string): Comparison {
  const changes = diffWordsWithSpace(a, b);
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    const words = c.value.trim() ? c.value.trim().split(/\s+/).length : 0;
    if (c.added) added += words;
    if (c.removed) removed += words;
  }
  return { changes, added, removed };
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export async function compareReport({ files, progress }: ProcessContext): Promise<OutputFile[]> {
  if (files.length !== 2) throw new Error('Select exactly two PDF files to compare');
  progress(0.1, 'Extracting text');
  const [a, b] = await Promise.all(files.map(documentText));
  progress(0.6, 'Comparing');
  const { changes, added, removed } = compareTexts(a.join('\n\n'), b.join('\n\n'));
  const body = changes
    .map((c) => (c.added ? `<ins>${esc(c.value)}</ins>` : c.removed ? `<del>${esc(c.value)}</del>` : esc(c.value)))
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comparison report</title><style>
    body{font:15px/1.6 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#222}
    pre{white-space:pre-wrap;font:inherit;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:20px}
    ins{background:#d4f8d4;color:#05600c;text-decoration:none}del{background:#ffd7d5;color:#a50e0e}
    .stats span{display:inline-block;margin-right:16px;padding:4px 10px;border-radius:12px;background:#f1f1f1}
  </style></head><body><h1>Comparison report</h1>
  <p><b>Original:</b> ${esc(files[0].name)} (${a.length} pages)<br><b>Changed:</b> ${esc(files[1].name)} (${b.length} pages)</p>
  <p class="stats"><span style="background:#d4f8d4">${added} words added</span><span style="background:#ffd7d5">${removed} words removed</span></p>
  <pre>${body}</pre></body></html>`;
  return [{ name: `compare_${baseName(files[0].name)}_vs_${baseName(files[1].name)}.html`, blob: new Blob([html], { type: 'text/html' }) }];
}
