import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdfJs, renderPage } from './pdf';

const docs = new WeakMap<File, Promise<PDFDocumentProxy>>();

export function getDoc(file: File): Promise<PDFDocumentProxy> {
  if (!docs.has(file)) docs.set(file, openPdfJs(file));
  return docs.get(file)!;
}

/** Shared pdf.js document for a File (opened once, reused by all page views). */
export function usePdfDoc(file: File | undefined) {
  const [state, setState] = useState<{ doc?: PDFDocumentProxy; error?: string }>({});
  useEffect(() => {
    if (!file) return;
    let alive = true;
    setState({});
    getDoc(file).then(
      (doc) => alive && setState({ doc }),
      (e) => alive && setState({ error: (e as { name?: string }).name === 'PasswordException' ? 'This PDF is password protected. Unlock it first.' : 'Could not open this PDF.' }),
    );
    return () => {
      alive = false;
    };
  }, [file]);
  return state;
}

const thumbCache = new WeakMap<PDFDocumentProxy, Map<string, string>>();

/** Lazily rendered page image; renders once it scrolls into view. */
export function usePageImage(doc: PDFDocumentProxy | undefined, page: number, width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    if (!doc || !ref.current) return;
    let alive = true;
    const key = `${page}@${width}`;
    let cache = thumbCache.get(doc);
    if (!cache) thumbCache.set(doc, (cache = new Map()));
    const hit = cache.get(key);
    if (hit) {
      setSrc(hit);
      return;
    }
    const io = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const p = await doc.getPage(page);
      const vp = p.getViewport({ scale: 1 });
      const canvas = await renderPage(doc, page, (width * (window.devicePixelRatio || 1)) / vp.width);
      const url = canvas.toDataURL('image/jpeg', 0.85);
      cache!.set(key, url);
      if (alive) setSrc(url);
    }, { rootMargin: '400px' });
    io.observe(ref.current);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [doc, page, width]);
  return { ref, src };
}
