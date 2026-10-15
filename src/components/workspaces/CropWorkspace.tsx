import { useEffect, useRef, useState } from 'react';
import { usePageImage, usePdfDoc } from '../../lib/usePdf';
import type { WorkspaceProps } from '../../tools/types';

type Box = { x: number; y: number; w: number; h: number };

export default function CropWorkspace({ files, options, setOptions }: WorkspaceProps) {
  const { doc, error } = usePdfDoc(files[0]);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const width = Math.min(640, typeof window !== 'undefined' ? window.innerWidth - 64 : 640);
  const { ref, src } = usePageImage(doc, page + 1, width);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!doc) return;
    doc.getPage(page + 1).then((p) => {
      const vp = p.getViewport({ scale: 1 });
      setSize({ w: vp.width, h: vp.height });
      // Default crop: trim 5% from each side.
      if (!options.crop || options.crop.page !== page) {
        setOptions({ ...options, crop: { page, x: vp.width * 0.05, y: vp.height * 0.05, w: vp.width * 0.9, h: vp.height * 0.9 } });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page]);

  if (error) return <div className="error">{error}</div>;
  if (!doc || !size) return <div className="center-loading"><span className="spinner" /> Loading…</div>;
  const scale = width / size.w;
  const crop: Box = options.crop ?? { x: 0, y: 0, w: size.w, h: size.h };
  const set = (b: Box) => {
    const x = Math.max(0, Math.min(b.x, size.w - 10));
    const y = Math.max(0, Math.min(b.y, size.h - 10));
    setOptions({ ...options, crop: { page, x, y, w: Math.max(10, Math.min(b.w, size.w - x)), h: Math.max(10, Math.min(b.h, size.h - y)) } });
  };

  const drag = (e: React.PointerEvent, mode: 'move' | 'new' | string) => {
    e.preventDefault();
    e.stopPropagation();
    const r = area.current!.getBoundingClientRect();
    const sx = (e.clientX - r.left) / scale;
    const sy = (e.clientY - r.top) / scale;
    const start = { ...crop };
    const move = (ev: PointerEvent) => {
      const px = (ev.clientX - r.left) / scale;
      const py = (ev.clientY - r.top) / scale;
      const dx = px - sx;
      const dy = py - sy;
      if (mode === 'new') set({ x: Math.min(sx, px), y: Math.min(sy, py), w: Math.abs(dx), h: Math.abs(dy) });
      else if (mode === 'move') set({ ...start, x: start.x + dx, y: start.y + dy });
      else {
        let { x, y, w, h } = start;
        if (mode.includes('w')) { x = start.x + dx; w = start.w - dx; }
        if (mode.includes('e')) w = start.w + dx;
        if (mode.includes('n')) { y = start.y + dy; h = start.h - dy; }
        if (mode.includes('s')) h = start.h + dy;
        set({ x, y, w, h });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="crop-ws">
      <div className="crop-nav">
        <button className="btn-light" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button>
        <span>Page {page + 1} of {doc.numPages}</span>
        <button className="btn-light" disabled={page >= doc.numPages - 1} onClick={() => setPage(page + 1)}>Next ›</button>
        <button className="btn-light" onClick={() => set({ x: 0, y: 0, w: size.w, h: size.h })}>Reset</button>
      </div>
      <div className="crop-area" ref={area} style={{ width, height: size.h * scale }} onPointerDown={(e) => drag(e, 'new')}>
        <div ref={ref} className="ed-page-img">{src ? <img src={src} alt="" draggable={false} /> : <span className="spinner" />}</div>
        <div
          className="crop-box"
          style={{ left: crop.x * scale, top: crop.y * scale, width: crop.w * scale, height: crop.h * scale }}
          onPointerDown={(e) => drag(e, 'move')}
        >
          {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => (
            <span key={h} className={`crop-handle h-${h}`} onPointerDown={(e) => drag(e, h)} />
          ))}
        </div>
      </div>
      <div className="crop-dims muted">
        Selection: {Math.round(crop.w)} × {Math.round(crop.h)} pt · offset {Math.round(crop.x)}, {Math.round(crop.y)}
      </div>
    </div>
  );
}
