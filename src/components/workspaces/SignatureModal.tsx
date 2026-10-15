import { useEffect, useRef, useState } from 'react';

export type SignatureKind = 'signature' | 'initials';
interface SavedImage {
  src: string;
  w: number;
  h: number;
}
export interface SavedSignatures {
  name?: string;
  initials_text?: string;
  signature?: SavedImage;
  initials?: SavedImage;
}

const KEY = 'pdf-for-all:signatures';
const FONTS = ['"Dancing Script"', '"Great Vibes"', '"Caveat"', '"Homemade Apple"'];
const COLORS = ['#111111', '#1a3fb0', '#c21b1b', '#1b7a2e'];

export function loadSaved(): SavedSignatures {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function persist(s: SavedSignatures) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable (private mode); signatures then last for this session only */
  }
}

/** Crop a canvas to its non-transparent content and return a PNG plus a size in points. */
function trim(canvas: HTMLCanvasElement, targetHeightPt: number): SavedImage | null {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const h = targetHeightPt;
  return { src: out.toDataURL('image/png'), w: (out.width / out.height) * h, h };
}

function DrawPad({ color, padRef }: { color: string; padRef: React.MutableRefObject<HTMLCanvasElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    padRef.current = ref.current;
  });
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const ctx = c.getContext('2d')!;
    const sx = c.width / r.width;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo((e.clientX - r.left) * sx, (e.clientY - r.top) * sx);
    c.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      ctx.lineTo((ev.clientX - r.left) * sx, (ev.clientY - r.top) * sx);
      ctx.stroke();
    };
    const up = () => {
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
    };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
  };
  return (
    <div className="pad-wrap">
      <canvas ref={ref} width={1000} height={300} className="sig-pad" onPointerDown={down} />
      <button className="link" onClick={() => ref.current!.getContext('2d')!.clearRect(0, 0, 1000, 300)}>Clear</button>
    </div>
  );
}

export default function SignatureModal({ initialKind, onClose, onSave }: { initialKind: SignatureKind; onClose: () => void; onSave: (s: SavedSignatures) => void }) {
  const saved = loadSaved();
  const [kind, setKind] = useState<SignatureKind>(initialKind);
  const [tab, setTab] = useState<'type' | 'draw' | 'upload'>('type');
  const [name, setName] = useState(saved.name ?? '');
  const [initials, setInitials] = useState(saved.initials_text ?? '');
  const [font, setFont] = useState(FONTS[0]);
  const [color, setColor] = useState(COLORS[1]);
  const [upload, setUpload] = useState<string | null>(null);
  const pad = useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!initials && name) setInitials(name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const text = kind === 'signature' ? name : initials;

  const save = async () => {
    setErr('');
    let canvas: HTMLCanvasElement | null = null;
    if (tab === 'type') {
      if (!text.trim()) return setErr('Please type your ' + (kind === 'signature' ? 'name' : 'initials'));
      await document.fonts.load(`80px ${font}`);
      canvas = document.createElement('canvas');
      canvas.width = 1400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d')!;
      ctx.font = `120px ${font}`;
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 20, 150, 1360);
    } else if (tab === 'draw') {
      canvas = pad.current;
    } else {
      if (!upload) return setErr('Please choose an image');
      const img = new Image();
      await new Promise((r) => ((img.onload = r), (img.src = upload)));
      canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // Knock out a white/near-white background so the signature sits on the page.
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < d.data.length; i += 4) if (d.data[i] > 225 && d.data[i + 1] > 225 && d.data[i + 2] > 225) d.data[i + 3] = 0;
      ctx.putImageData(d, 0, 0);
    }
    const image = canvas && trim(canvas, kind === 'signature' ? 40 : 30);
    if (!image) return setErr('Your signature is empty');
    const next: SavedSignatures = { ...loadSaved(), name, initials_text: initials, [kind]: image };
    persist(next);
    onSave(next);
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Set your signature details</h2>
          <button className="tb-mini" onClick={onClose}>✕</button>
        </div>
        <div className="sig-fields">
          <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
          <label>Initials<input value={initials} onChange={(e) => setInitials(e.target.value)} placeholder="AB" /></label>
        </div>
        <div className="tabs">
          {(['signature', 'initials'] as const).map((k) => (
            <button key={k} className={`tab ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{k === 'signature' ? 'Signature' : 'Initials'}</button>
          ))}
          <span className="tb-spacer" />
          {(['type', 'draw', 'upload'] as const).map((t) => (
            <button key={t} className={`tab small ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        <div className="sig-body">
          {tab === 'type' && (
            <div className="sig-fonts">
              {FONTS.map((f) => (
                <label key={f} className={`sig-font ${font === f ? 'active' : ''}`}>
                  <input type="radio" checked={font === f} onChange={() => setFont(f)} />
                  <span style={{ fontFamily: f, color }}>{text || (kind === 'signature' ? 'Your name' : 'AB')}</span>
                </label>
              ))}
            </div>
          )}
          {tab === 'draw' && <DrawPad color={color} padRef={pad} />}
          {tab === 'upload' && (
            <div className="sig-upload">
              <input type="file" accept="image/*" onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => setUpload(r.result as string);
                r.readAsDataURL(f);
              }} />
              {upload && <img src={upload} alt="" />}
            </div>
          )}
          {tab !== 'upload' && (
            <div className="sig-colors">
              {COLORS.map((c) => (
                <button key={c} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
              ))}
            </div>
          )}
        </div>
        {err && <div className="error">{err}</div>}
        <div className="modal-foot">
          <button className="btn-light" onClick={onClose}>Cancel</button>
          <button className="btn-action inline" onClick={save}>Apply</button>
        </div>
      </div>
    </div>
  );
}
