import { useEffect, useRef, useState } from 'react';
import DropZone from '../DropZone';
import type { ToolDef } from '../../tools/types';
import { canvasToBlob } from '../../lib/pdf';

/** Camera capture for Scan to PDF, with a regular image picker as fallback. */
export default function ScanUploader({ tool, onFiles }: { tool: ToolDef; onFiles: (files: File[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream]);

  const start = async () => {
    setErr('');
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false }));
    } catch {
      setErr('Camera is not available. Allow camera access, or pick photos instead.');
    }
  };

  const snap = async () => {
    const v = video.current!;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await canvasToBlob(c, 'image/jpeg', 0.92);
    const file = new File([blob], `scan_${shots.length + 1}.jpg`, { type: 'image/jpeg' });
    setShots([...shots, { file, url: URL.createObjectURL(blob) }]);
  };

  const finish = () => {
    stream?.getTracks().forEach((t) => t.stop());
    onFiles(shots.map((s) => s.file));
  };

  if (stream) {
    return (
      <div className="scan">
        <video ref={video} autoPlay playsInline muted className="scan-video" />
        <div className="scan-actions">
          <button className="btn-light" onClick={() => { stream.getTracks().forEach((t) => t.stop()); setStream(null); }}>Cancel</button>
          <button className="shutter" onClick={snap} aria-label="Capture" />
          <button className="btn-action inline" disabled={!shots.length} onClick={finish}>Done ({shots.length})</button>
        </div>
        <div className="scan-shots">
          {shots.map((s, i) => (
            <div key={i} className="scan-shot">
              <img src={s.url} alt="" />
              <button onClick={() => setShots(shots.filter((_, k) => k !== i))}>✕</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="scan-start">
        <button className="btn-select" onClick={start}>📷 Use camera</button>
      </div>
      {err && <div className="error">{err}</div>}
      <DropZone tool={tool} onFiles={onFiles} />
    </>
  );
}
