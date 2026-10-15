import { useEffect, useMemo, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getDoc, usePageImage } from '../../lib/usePdf';
import type { WorkspaceProps } from '../../tools/types';
import type { PageRef } from '../../tools/processors/organize';

type Item = PageRef & { key: string };

const FILE_COLORS = ['#e5322d', '#3b82c4', '#5ba53c', '#a259d9', '#f0a019', '#17a2b8'];

function PageCard({ item, doc, index, onRotate, onDelete, onInsert }: {
  item: Item; doc?: PDFDocumentProxy; index: number;
  onRotate: (d: number) => void; onDelete: () => void; onInsert: () => void;
}) {
  const { ref, src } = usePageImage(item.blank ? undefined : doc, item.page + 1, 150);
  return (
    <div className="page-card">
      <div className="page-tools">
        <button title="Rotate left" onClick={() => onRotate(-90)}>↺</button>
        <button title="Rotate right" onClick={() => onRotate(90)}>↻</button>
        <button title="Delete page" onClick={onDelete}>✕</button>
      </div>
      <div className="page-thumb" ref={ref}>
        {item.blank ? (
          <div className="blank-page" style={{ transform: `rotate(${item.rotate}deg)` }} />
        ) : src ? (
          <img src={src} alt="" draggable={false} style={{ transform: `rotate(${item.rotate}deg)` }} />
        ) : (
          <span className="spinner" />
        )}
      </div>
      <div className="page-label">
        <span className="file-dot" style={{ background: item.blank ? '#bbb' : FILE_COLORS[item.file % FILE_COLORS.length] }} />
        {index + 1}
      </div>
      <button className="insert-blank" title="Insert blank page after" onClick={onInsert}>+</button>
    </div>
  );
}

export default function OrganizeWorkspace({ files, options, setOptions, addMore }: WorkspaceProps) {
  const [docs, setDocs] = useState<(PDFDocumentProxy | undefined)[]>([]);
  const [error, setError] = useState<string>();
  const [drag, setDrag] = useState<number | null>(null);
  const items: Item[] = options.pages ?? [];
  const setItems = (pages: Item[]) => setOptions({ ...options, pages });

  // Load every file; keep existing page edits and append pages from newly added files.
  const filesKey = useMemo(() => files.map((f) => `${f.name}:${f.size}`).join('|'), [files]);
  useEffect(() => {
    let alive = true;
    Promise.all(files.map(getDoc)).then(
      (loaded) => {
        if (!alive) return;
        setDocs(loaded);
        const known = new Set(items.filter((i) => !i.blank).map((i) => i.file));
        const extra: Item[] = [];
        loaded.forEach((d, fi) => {
          if (known.has(fi)) return;
          for (let p = 0; p < d.numPages; p++) extra.push({ file: fi, page: p, rotate: 0, key: `${fi}-${p}-${Math.random()}` });
        });
        const valid = items.filter((i) => i.blank || i.file < files.length);
        if (extra.length || valid.length !== items.length) setOptions({ ...options, pages: [...valid, ...extra] });
      },
      () => alive && setError('One of the files could not be opened. Is it password protected?'),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey]);

  const update = (i: number, patch: Partial<Item>) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const move = (from: number, to: number) => {
    const next = items.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setItems(next);
  };

  if (error) return <div className="error">{error}</div>;
  return (
    <div className="file-grid-wrap">
      <div className="organize-bar">
        <button className="btn-light" onClick={() => setItems(items.map((i) => ({ ...i, rotate: (i.rotate + 90) % 360 })))}>↻ Rotate all</button>
        <button className="btn-light" onClick={() => setItems(items.slice().reverse())}>⇅ Reverse order</button>
        <button
          className="btn-light"
          onClick={() =>
            setItems(docs.flatMap((d, fi) => Array.from({ length: d?.numPages ?? 0 }, (_, p) => ({ file: fi, page: p, rotate: 0, key: `${fi}-${p}-${Math.random()}` }))))
          }
        >
          ⟲ Reset
        </button>
        <span className="muted">{items.length} pages · drag to reorder</span>
      </div>
      <div className="page-grid">
        {items.map((item, i) => (
          <div
            key={item.key}
            className={`page-slot ${drag === i ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDrag(i)}
            onDragEnd={() => setDrag(null)}
            onDragOver={(e) => {
              e.preventDefault();
              if (drag !== null && drag !== i) {
                move(drag, i);
                setDrag(i);
              }
            }}
          >
            <PageCard
              item={item}
              index={i}
              doc={docs[item.file]}
              onRotate={(d) => update(i, { rotate: (item.rotate + d + 360) % 360 })}
              onDelete={() => setItems(items.filter((_, k) => k !== i))}
              onInsert={() => {
                const next = items.slice();
                next.splice(i + 1, 0, { file: item.file, page: 0, rotate: 0, blank: true, key: `blank-${Math.random()}` });
                setItems(next);
              }}
            />
          </div>
        ))}
      </div>
      <div className="grid-tools">
        <button className="fab" title="Add more PDF files" onClick={addMore}>+</button>
      </div>
    </div>
  );
}
