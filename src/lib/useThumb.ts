import { useEffect, useState } from 'react';
import { openPdfJs, renderThumb } from './pdf';

export interface Thumb {
  src?: string;
  pages?: number;
  error?: string;
  kind: 'pdf' | 'image' | 'other';
}

const cache = new WeakMap<File, Promise<Thumb>>();

function load(file: File): Promise<Thumb> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (file.type.startsWith('image/')) return Promise.resolve({ kind: 'image', src: URL.createObjectURL(file) });
  if (!isPdf) return Promise.resolve({ kind: 'other' });
  return (async () => {
    try {
      const doc = await openPdfJs(file);
      const src = await renderThumb(doc, 1, 220);
      const pages = doc.numPages;
      await doc.destroy();
      return { kind: 'pdf', src, pages } as Thumb;
    } catch (e) {
      const name = (e as { name?: string }).name;
      return { kind: 'pdf', error: name === 'PasswordException' ? 'Password protected' : 'Preview unavailable' } as Thumb;
    }
  })();
}

/** First-page thumbnail (or image preview) for a file, cached per File object. */
export function useThumb(file: File): Thumb | null {
  const [thumb, setThumb] = useState<Thumb | null>(null);
  useEffect(() => {
    let alive = true;
    if (!cache.has(file)) cache.set(file, load(file));
    cache.get(file)!.then((t) => alive && setThumb(t));
    return () => {
      alive = false;
    };
  }, [file]);
  return thumb;
}
