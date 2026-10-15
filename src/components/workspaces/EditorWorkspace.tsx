import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjs } from '../../lib/pdf';
import { usePageImage, usePdfDoc } from '../../lib/usePdf';
import type { WorkspaceProps } from '../../tools/types';
import type { Annotation } from '../../tools/processors/edit';
import SignatureModal, { loadSaved, type SignatureKind } from './SignatureModal';

type ToolKind = 'select' | 'text' | 'draw' | 'rect' | 'ellipse' | 'highlight' | 'whiteout' | 'redact' | 'place';
type Size = { w: number; h: number };

const uid = () => Math.random().toString(36).slice(2, 10);
const CSS_FONT: Record<string, string> = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };

function textBox(text: string, size: number) {
  const lines = text.split('\n');
  return { w: Math.max(20, Math.max(...lines.map((l) => l.length)) * size * 0.56), h: lines.length * size * 1.2 };
}

/** Drag helper: reports pointer deltas in page points until release. */
function startDrag(e: RPointerEvent, scale: number, onMove: (dx: number, dy: number, ev: PointerEvent) => void, onEnd?: () => void) {
  e.preventDefault();
  e.stopPropagation();
  const sx = e.clientX;
  const sy = e.clientY;
  const move = (ev: PointerEvent) => onMove((ev.clientX - sx) / scale, (ev.clientY - sy) / scale, ev);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onEnd?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

interface PageViewProps {
  doc: PDFDocumentProxy;
  index: number;
  size: Size;
  width: number;
  anns: Annotation[];
  tool: ToolKind;
  selected: string | null;
  mode: 'edit' | 'sign' | 'redact';
  style: Style;
  onSelect: (id: string | null) => void;
  onAdd: (a: Annotation) => void;
  onChange: (id: string, patch: Partial<Annotation>, commit?: boolean) => void;
  onPlace: (page: number, x: number, y: number) => void;
  beginChange: () => void;
}

interface Style {
  color: string;
  size: number;
  font: string;
  bold: boolean;
  italic: boolean;
  stroke: number;
  fill: boolean;
  opacity: number;
}

function PageView({ doc, index, size, width, anns, tool, selected, mode, style, onSelect, onAdd, onChange, onPlace, beginChange }: PageViewProps) {
  const scale = width / size.w;
  const { ref, src } = usePageImage(doc, index + 1, width);
  const overlay = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = overlay.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale] as [number, number];
  };

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const [x, y] = toPage(e);
    if (tool === 'select') return onSelect(null);
    if (tool === 'place') return onPlace(index, x, y);
    if (tool === 'text') {
      // Keep the browser from moving focus away from the new text box on mousedown.
      e.preventDefault();
      const text = '';
      onAdd({ id: uid(), type: 'text', page: index, x, y: y - style.size * 0.6, ...textBox('Text', style.size), text, size: style.size, color: style.color, font: style.font, bold: style.bold, italic: style.italic });
      return;
    }
    if (tool === 'draw') {
      const pts: [number, number][] = [[x, y]];
      let d: Annotation = { id: uid(), type: 'draw', page: index, x, y, w: 0, h: 0, points: pts, color: style.color, stroke: style.stroke };
      setDraft(d);
      startDrag(e, scale, (_dx, _dy, ev) => {
        pts.push(toPage(ev));
        d = { ...d, points: pts.slice() } as Annotation;
        setDraft(d);
      }, () => {
        setDraft(null);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        if (pts.length > 1) onAdd({ ...d, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } as Annotation);
      });
      return;
    }
    // Box tools: rect, ellipse, highlight, whiteout, redact
    const base: Annotation =
      tool === 'ellipse'
        ? { id: uid(), type: 'ellipse', page: index, x, y, w: 0, h: 0, color: style.color, fill: style.fill, opacity: style.opacity, stroke: style.stroke }
        : {
            id: uid(), type: 'rect', page: index, x, y, w: 0, h: 0,
            color: tool === 'highlight' ? '#ffeb3b' : tool === 'whiteout' ? '#ffffff' : tool === 'redact' ? '#000000' : style.color,
            fill: tool === 'rect' ? style.fill : true,
            opacity: tool === 'highlight' ? 0.4 : tool === 'rect' ? style.opacity : 1,
            stroke: style.stroke,
          };
    let cur: Annotation = base;
    setDraft(base);
    startDrag(e, scale, (dx, dy) => {
      cur = { ...base, x: Math.min(x, x + dx), y: Math.min(y, y + dy), w: Math.abs(dx), h: Math.abs(dy) } as Annotation;
      setDraft(cur);
    }, () => {
      setDraft(null);
      if (cur.w > 3 && cur.h > 3) onAdd(cur);
    });
  };

  const items = draft ? [...anns, draft] : anns;
  return (
    <div className="ed-page" style={{ width, height: size.h * scale }} data-page={index}>
      <div ref={ref} className="ed-page-img">{src ? <img src={src} alt={`Page ${index + 1}`} draggable={false} /> : <span className="spinner" />}</div>
      <div ref={overlay} className={`ed-overlay tool-${tool}`} onPointerDown={down}>
        {items.map((a) => (
          <AnnotationView
            key={a.id}
            a={a}
            scale={scale}
            mode={mode}
            selected={selected === a.id}
            interactive={tool === 'select' || a.type === 'text'}
            onSelect={() => onSelect(a.id)}
            onChange={(p, commit) => onChange(a.id, p, commit)}
            beginChange={beginChange}
          />
        ))}
      </div>
      <div className="ed-page-num">{index + 1}</div>
    </div>
  );
}

function AnnotationView({ a, scale, selected, interactive, mode, onSelect, onChange, beginChange }: {
  a: Annotation; scale: number; selected: boolean; interactive: boolean; mode: string;
  onSelect: () => void; onChange: (p: Partial<Annotation>, commit?: boolean) => void; beginChange: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (a.type === 'text' && selected && !a.text) textRef.current?.focus();
  }, [a, selected]);
  const box = { left: a.x * scale, top: a.y * scale, width: a.w * scale, height: a.h * scale };

  const moveStart = (e: RPointerEvent) => {
    onSelect();
    beginChange();
    const ox = a.x;
    const oy = a.y;
    const pts = a.type === 'draw' ? a.points : null;
    startDrag(e, scale, (dx, dy) =>
      onChange(pts ? ({ x: ox + dx, y: oy + dy, points: pts.map(([px, py]) => [px + dx, py + dy]) } as Partial<Annotation>) : { x: ox + dx, y: oy + dy }),
    );
  };
  const resizeStart = (e: RPointerEvent) => {
    beginChange();
    const { w, h } = a;
    const keepRatio = a.type === 'image';
    startDrag(e, scale, (dx, dy) => {
      const nw = Math.max(8, w + dx);
      onChange({ w: nw, h: keepRatio ? (nw * h) / w : Math.max(8, h + dy) });
    });
  };

  const cls = `ann ann-${a.type} ${selected ? 'selected' : ''} ${interactive ? '' : 'passive'}`;
  if (a.type === 'text') {
    return (
      <div className={cls} style={{ left: box.left, top: box.top }} onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}>
        {selected && <span className="ann-move" title="Drag to move" onPointerDown={moveStart}>✥</span>}
        <textarea
          ref={textRef}
          value={a.text}
          placeholder="Type here"
          rows={Math.max(1, a.text.split('\n').length)}
          spellCheck={false}
          onFocus={beginChange}
          onChange={(e) => onChange({ text: e.target.value, ...textBox(e.target.value || 'Text', a.size) })}
          style={{
            fontFamily: CSS_FONT[a.font] ?? CSS_FONT.Helvetica,
            fontSize: a.size * scale,
            lineHeight: 1.2,
            color: a.color,
            fontWeight: a.bold ? 700 : 400,
            fontStyle: a.italic ? 'italic' : 'normal',
            width: Math.max(40, a.w * scale + 12),
          }}
        />
      </div>
    );
  }
  let inner = null;
  if (a.type === 'image') inner = <img src={a.src} alt="" draggable={false} />;
  else if (a.type === 'rect') {
    const redact = mode === 'redact';
    inner = (
      <div
        className="ann-fill"
        style={a.fill ? { background: a.color, opacity: redact ? 0.85 : a.opacity } : { border: `${(a.stroke ?? 2) * scale}px solid ${a.color}`, opacity: a.opacity }}
      />
    );
  } else if (a.type === 'ellipse') {
    inner = (
      <div className="ann-fill" style={{ borderRadius: '50%', ...(a.fill ? { background: a.color, opacity: a.opacity } : { border: `${(a.stroke ?? 2) * scale}px solid ${a.color}`, opacity: a.opacity }) }} />
    );
  } else if (a.type === 'draw') {
    const pad = a.stroke;
    return (
      <svg
        className={cls}
        style={{ left: (a.x - pad) * scale, top: (a.y - pad) * scale, width: (a.w + pad * 2) * scale, height: (a.h + pad * 2) * scale }}
        viewBox={`${a.x - pad} ${a.y - pad} ${a.w + pad * 2} ${a.h + pad * 2}`}
        onPointerDown={interactive ? moveStart : undefined}
      >
        <polyline points={a.points.map((p) => p.join(',')).join(' ')} fill="none" stroke={a.color} strokeWidth={a.stroke} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <div className={cls} style={box} onPointerDown={interactive ? moveStart : undefined}>
      {inner}
      {selected && <span className="ann-resize" onPointerDown={resizeStart} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function EditorWorkspace({ tool, files, options, setOptions, run }: WorkspaceProps) {
  const mode = tool.id === 'sign-pdf' ? 'sign' : tool.id === 'redact-pdf' ? 'redact' : 'edit';
  const { doc, error } = usePdfDoc(files[0]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [active, setActive] = useState<ToolKind>(mode === 'redact' ? 'redact' : mode === 'sign' ? 'select' : 'select');
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(0);
  const [style, setStyle] = useState<Style>({ color: mode === 'sign' ? '#1a3fb0' : '#000000', size: 14, font: 'Helvetica', bold: false, italic: false, stroke: 2, fill: false, opacity: 1 });
  const [modal, setModal] = useState<SignatureKind | null>(null);
  const [saved, setSaved] = useState(loadSaved);
  const [placing, setPlacing] = useState<Omit<Annotation, 'id' | 'page' | 'x' | 'y'> | null>(null);
  const [search, setSearch] = useState('');
  const [searchMsg, setSearchMsg] = useState('');
  const history = useRef<Annotation[][]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  const anns: Annotation[] = options.annotations ?? [];
  const optsRef = useRef(options);
  optsRef.current = options;
  const setAnns = useCallback((next: Annotation[]) => setOptions({ ...optsRef.current, annotations: next }), [setOptions]);
  const snapshot = useCallback(() => {
    history.current.push(optsRef.current.annotations ?? []);
    if (history.current.length > 100) history.current.shift();
  }, []);
  const commit = (next: Annotation[]) => {
    snapshot();
    setAnns(next);
  };
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setAnns(prev);
  }, [setAnns]);

  useEffect(() => {
    if (!doc) return;
    (async () => {
      const out: Size[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
        out.push({ w: vp.width, h: vp.height });
      }
      setSizes(out);
    })();
  }, [doc]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(900, el.clientWidth - 48)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sizes.length]);

  // Track which page is in view for the thumbnail strip and "add to current page" actions.
  const onScroll = () => {
    const el = scroller.current!;
    const pages = Array.from(el.querySelectorAll<HTMLElement>('.ed-page'));
    const mid = el.scrollTop + el.clientHeight / 3;
    let idx = 0;
    pages.forEach((p, i) => {
      if (p.offsetTop <= mid) idx = i;
    });
    setCurrent(idx);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT';
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !typing) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !typing) {
        commit(anns.filter((a) => a.id !== selected));
        setSelected(null);
      } else if (e.key === 'Escape') {
        setPlacing(null);
        setActive(mode === 'redact' ? 'redact' : 'select');
        setSelected(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const sel = anns.find((a) => a.id === selected);
  const patchSelected = (p: Partial<Style>) => {
    setStyle({ ...style, ...p });
    if (!sel) return;
    const patch: Record<string, unknown> = {};
    if (p.color !== undefined) patch.color = p.color;
    if (sel.type === 'text') {
      if (p.size !== undefined) Object.assign(patch, { size: p.size, ...textBox(sel.text || 'Text', p.size) });
      if (p.font !== undefined) patch.font = p.font;
      if (p.bold !== undefined) patch.bold = p.bold;
      if (p.italic !== undefined) patch.italic = p.italic;
    } else {
      if (p.stroke !== undefined) patch.stroke = p.stroke;
      if (p.fill !== undefined && (sel.type === 'rect' || sel.type === 'ellipse')) patch.fill = p.fill;
      if (p.opacity !== undefined) patch.opacity = p.opacity;
    }
    commit(anns.map((a) => (a.id === selected ? ({ ...a, ...patch } as Annotation) : a)));
  };

  const addImage = (src: string, natW: number, natH: number, page = current, at?: [number, number]) => {
    const size = sizes[page];
    const w = Math.min(natW, size.w * 0.4);
    const h = (w * natH) / natW;
    const a: Annotation = { id: uid(), type: 'image', page, x: at ? at[0] - w / 2 : (size.w - w) / 2, y: at ? at[1] - h / 2 : (size.h - h) / 2, w, h, src };
    commit([...anns, a]);
    setSelected(a.id);
  };

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          // Normalize to PNG so pdf-lib can embed any format.
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d')!.drawImage(img, 0, 0);
          const isJpg = f.type === 'image/jpeg';
          addImage(isJpg ? (reader.result as string) : c.toDataURL('image/png'), img.naturalWidth * 0.75, img.naturalHeight * 0.75);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  /** Sign mode: arm a click-to-place action for a signature, initials, or text item. */
  const arm = (kind: 'signature' | 'initials' | 'name' | 'date' | 'text') => {
    if (kind === 'signature' || kind === 'initials') {
      const s = saved[kind];
      if (!s) return setModal(kind);
      setPlacing({ type: 'image', w: s.w, h: s.h, src: s.src } as Omit<Annotation, 'id' | 'page' | 'x' | 'y'>);
    } else {
      const text = kind === 'date' ? new Date().toLocaleDateString() : kind === 'name' ? saved.name || 'Your name' : 'Text';
      setPlacing({ type: 'text', text, size: 12, color: style.color, font: 'Helvetica', bold: false, italic: false, ...textBox(text, 12) } as Omit<Annotation, 'id' | 'page' | 'x' | 'y'>);
    }
    setActive('place');
  };

  const place = (page: number, x: number, y: number) => {
    if (!placing) return;
    const a = { ...placing, id: uid(), page, x: x - placing.w / 2, y: y - placing.h / 2 } as Annotation;
    commit([...anns, a]);
    setSelected(a.id);
    setPlacing(null);
    setActive('select');
  };

  const runSearch = async () => {
    if (!doc || !search.trim()) return;
    const q = search.trim().toLowerCase();
    const found: Annotation[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      for (const it of content.items) {
        if (!('str' in it)) continue;
        const str = it.str.toLowerCase();
        let from = str.indexOf(q);
        while (from >= 0 && str.length) {
          const tx = pdfjs.Util.transform(vp.transform, it.transform);
          const fh = Math.hypot(tx[2], tx[3]);
          const unit = it.width / it.str.length;
          found.push({ id: uid(), type: 'rect', page: i - 1, x: tx[4] + unit * from - 1, y: tx[5] - fh * 0.95, w: unit * q.length + 2, h: fh * 1.2, color: '#000000', fill: true, opacity: 1 });
          from = str.indexOf(q, from + q.length);
        }
      }
    }
    setSearchMsg(found.length ? `Marked ${found.length} match${found.length > 1 ? 'es' : ''}` : 'No matches found (scanned pages need OCR first)');
    if (found.length) commit([...anns, ...found]);
  };

  if (error) return <div className="error">{error}</div>;
  if (!doc || !sizes.length) return <div className="center-loading"><span className="spinner" /> Loading document…</div>;

  const pageWidth = Math.max(240, width * zoom);
  const toolBtn = (id: ToolKind, label: string, icon: string) => (
    <button className={`tb-btn ${active === id ? 'active' : ''}`} title={label} onClick={() => { setActive(id); setPlacing(null); }}>
      <span className="tb-icon">{icon}</span>
      <span className="tb-label">{label}</span>
    </button>
  );
  const isTextSel = sel?.type === 'text';
  const actionLabel = mode === 'sign' ? 'Sign' : mode === 'redact' ? 'Redact' : 'Save changes';

  return (
    <div className="editor">
      <div className="editor-toolbar">
        {mode === 'edit' && (
          <>
            {toolBtn('select', 'Select', '➚')}
            {toolBtn('text', 'Text', 'T')}
            <button className="tb-btn" title="Image" onClick={pickImage}><span className="tb-icon">🖼</span><span className="tb-label">Image</span></button>
            {toolBtn('draw', 'Draw', '✎')}
            {toolBtn('rect', 'Rectangle', '▭')}
            {toolBtn('ellipse', 'Ellipse', '◯')}
            {toolBtn('highlight', 'Highlight', '▆')}
            {toolBtn('whiteout', 'Whiteout', '⬜')}
          </>
        )}
        {mode === 'redact' && (
          <>
            {toolBtn('select', 'Select', '➚')}
            {toolBtn('redact', 'Mark area', '▇')}
            <button className="tb-btn" onClick={() => commit([...anns, { id: uid(), type: 'rect', page: current, x: 0, y: 0, w: sizes[current].w, h: sizes[current].h, color: '#000000', fill: true, opacity: 1 }])}>
              <span className="tb-icon">▣</span><span className="tb-label">Whole page</span>
            </button>
            <form className="tb-search" onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
              <input placeholder="Find text to redact…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="btn-light">Mark all</button>
              {searchMsg && <span className="muted">{searchMsg}</span>}
            </form>
          </>
        )}
        {mode === 'sign' && toolBtn('select', 'Select', '➚')}
        <span className="tb-sep" />
        {(mode === 'edit' || mode === 'sign') && (
          <div className="tb-props">
            <input type="color" title="Color" value={sel && 'color' in sel ? sel.color : style.color} onChange={(e) => patchSelected({ color: e.target.value })} />
            {(isTextSel || active === 'text') && (
              <>
                <select value={isTextSel ? sel.font : style.font} onChange={(e) => patchSelected({ font: e.target.value })}>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Times">Times</option>
                  <option value="Courier">Courier</option>
                </select>
                <select value={isTextSel ? sel.size : style.size} onChange={(e) => patchSelected({ size: Number(e.target.value) })}>
                  {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className={`tb-mini ${(isTextSel ? sel.bold : style.bold) ? 'on' : ''}`} onClick={() => patchSelected({ bold: !(isTextSel ? sel.bold : style.bold) })}><b>B</b></button>
                <button className={`tb-mini ${(isTextSel ? sel.italic : style.italic) ? 'on' : ''}`} onClick={() => patchSelected({ italic: !(isTextSel ? sel.italic : style.italic) })}><i>I</i></button>
              </>
            )}
            {mode === 'edit' && !isTextSel && (
              <>
                <label className="tb-field">Stroke
                  <input type="range" min={1} max={12} value={sel && 'stroke' in sel ? sel.stroke ?? 2 : style.stroke} onChange={(e) => patchSelected({ stroke: Number(e.target.value) })} />
                </label>
                <label className="tb-field"><input type="checkbox" checked={sel && 'fill' in sel ? sel.fill : style.fill} onChange={(e) => patchSelected({ fill: e.target.checked })} /> Fill</label>
              </>
            )}
          </div>
        )}
        <span className="tb-spacer" />
        <button className="tb-mini" title="Undo (Ctrl+Z)" onClick={undo} disabled={!history.current.length}>↶</button>
        {sel && (
          <button className="tb-mini danger" title="Delete selected" onClick={() => { commit(anns.filter((a) => a.id !== selected)); setSelected(null); }}>🗑</button>
        )}
        <button className="tb-mini" title="Zoom out" onClick={() => setZoom(Math.max(0.4, zoom - 0.2))}>−</button>
        <span className="muted">{Math.round(zoom * 100)}%</span>
        <button className="tb-mini" title="Zoom in" onClick={() => setZoom(Math.min(2.5, zoom + 0.2))}>+</button>
      </div>

      <div className="editor-body">
        <div className="ed-thumbs">
          {sizes.map((_, i) => (
            <Thumb key={i} doc={doc} index={i} active={i === current} count={anns.filter((a) => a.page === i).length}
              onClick={() => scroller.current?.querySelector<HTMLElement>(`[data-page="${i}"]`)?.scrollIntoView({ behavior: 'smooth' })} />
          ))}
        </div>
        <div className="ed-scroll" ref={scroller} onScroll={onScroll}>
          {placing && <div className="ed-hint">Click on the page where you want to place it · Esc to cancel</div>}
          {sizes.map((s, i) => (
            <PageView
              key={i}
              doc={doc}
              index={i}
              size={s}
              width={pageWidth}
              anns={anns.filter((a) => a.page === i)}
              tool={active}
              mode={mode}
              style={style}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                const a = anns.find((x) => x.id === id);
                if (a?.type === 'text') setStyle((st) => ({ ...st, color: a.color, size: a.size, font: a.font, bold: a.bold, italic: a.italic }));
              }}
              onAdd={(a) => {
                commit([...anns, a]);
                setSelected(a.id);
                if (a.type === 'text') setActive('select');
              }}
              onChange={(id, patch) => setAnns((optsRef.current.annotations as Annotation[]).map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)))}
              beginChange={snapshot}
              onPlace={place}
            />
          ))}
        </div>
        {mode === 'sign' ? (
          <aside className="sidebar sign-panel">
            <h2>Signing options</h2>
            <p className="muted">Click an item, then click on the document to place it. Drag to move, use the corner to resize.</p>
            <SignItem label="Signature" img={saved.signature?.src} onPlace={() => arm('signature')} onEdit={() => setModal('signature')} />
            <SignItem label="Initials" img={saved.initials?.src} onPlace={() => arm('initials')} onEdit={() => setModal('initials')} />
            <SignItem label="Name" text={saved.name || 'Your name'} onPlace={() => arm('name')} onEdit={() => setModal('signature')} />
            <SignItem label="Date" text={new Date().toLocaleDateString()} onPlace={() => arm('date')} />
            <SignItem label="Text" text="Custom text" onPlace={() => arm('text')} />
            <button className="btn-action" onClick={run}>{actionLabel} <span aria-hidden>➜</span></button>
          </aside>
        ) : (
          <aside className="sidebar ed-side">
            <h2>{tool.title}</h2>
            {mode === 'redact' ? (
              <p className="muted">Drag over the areas to hide, or search for text. Redacted pages are flattened so the hidden content is permanently removed.</p>
            ) : (
              <p className="muted">Pick a tool from the toolbar and click or drag on a page. Select an item to move, resize, restyle or delete it.</p>
            )}
            <p className="muted">{anns.length} item{anns.length === 1 ? '' : 's'} on {new Set(anns.map((a) => a.page)).size} page(s)</p>
            <button className="btn-action" onClick={run}>{actionLabel} <span aria-hidden>➜</span></button>
          </aside>
        )}
      </div>
      {modal && (
        <SignatureModal
          initialKind={modal}
          onClose={() => setModal(null)}
          onSave={(next) => {
            setSaved(next);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function SignItem({ label, img, text, onPlace, onEdit }: { label: string; img?: string; text?: string; onPlace: () => void; onEdit?: () => void }) {
  return (
    <div className="sign-item">
      <button className="sign-preview" onClick={onPlace} title={`Place ${label.toLowerCase()}`}>
        <span className="sign-label">{label}</span>
        {img ? <img src={img} alt="" /> : <span className="sign-text">{text ?? `Create ${label.toLowerCase()}`}</span>}
      </button>
      {onEdit && <button className="tb-mini" title="Edit" onClick={onEdit}>✎</button>}
    </div>
  );
}

function Thumb({ doc, index, active, count, onClick }: { doc: PDFDocumentProxy; index: number; active: boolean; count: number; onClick: () => void }) {
  const { ref, src } = usePageImage(doc, index + 1, 100);
  return (
    <button className={`ed-thumb ${active ? 'active' : ''}`} onClick={onClick}>
      <div ref={ref}>{src ? <img src={src} alt="" /> : <span className="spinner" />}</div>
      <span>{index + 1}{count ? ` · ${count}` : ''}</span>
    </button>
  );
}
