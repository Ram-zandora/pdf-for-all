import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadBlob, formatBytes, PDF_MIME, type OutputFile } from '../lib/pdf';
import { zipOutputs } from '../tools/processors/organize';
import { TOOLS } from '../tools/registry';
import type { ToolDef } from '../tools/types';
import ToolIcon from './ToolIcon';
import { setHandoff } from './handoff';

export default function ResultView({ tool, outputs, inputSize, onBack }: { tool: ToolDef; outputs: OutputFile[]; inputSize: number; onBack: () => void }) {
  const navigate = useNavigate();
  const [zip, setZip] = useState<Blob | null>(null);
  const single = outputs.length === 1;
  useEffect(() => {
    if (!single) zipOutputs(outputs).then(setZip);
  }, [outputs, single]);

  const total = outputs.reduce((n, o) => n + o.blob.size, 0);
  const saved = tool.id === 'compress-pdf' && inputSize > 0 ? Math.round((1 - total / inputSize) * 100) : null;
  const allPdf = outputs.every((o) => o.blob.type === PDF_MIME);
  const next = TOOLS.filter((t) => t.id !== tool.id && t.accept.includes('pdf') && !t.Uploader).slice(0, 12);

  const downloadAll = () => {
    if (single) downloadBlob(outputs[0].blob, outputs[0].name);
    else if (zip) downloadBlob(zip, `${tool.id}_${outputs.length}_files.zip`);
  };

  const continueWith = (t: ToolDef) => {
    setHandoff(outputs.map((o) => new File([o.blob], o.name, { type: o.blob.type })));
    navigate(`/${t.id}`);
  };

  return (
    <div className="result">
      <h2>{tool.resultTitle}</h2>
      {saved !== null && (
        <div className="saved">
          <div className="saved-circle">{Math.max(0, saved)}%</div>
          <div>
            Your PDFs are now {Math.max(0, saved)}% smaller!
            <br />
            <small>{formatBytes(inputSize)} → {formatBytes(total)}</small>
          </div>
        </div>
      )}
      <div className="result-actions">
        <button className="btn-back" onClick={onBack} title="Back">←</button>
        <button className="btn-download" onClick={downloadAll} disabled={!single && !zip}>
          ⬇ Download {single ? outputs[0].name.split('.').pop()!.toUpperCase() : 'all (ZIP)'}
        </button>
      </div>
      <ul className="output-list">
        {outputs.map((o, i) => (
          <li key={i}>
            <span className="output-name">{o.name}</span>
            <span className="output-size">{formatBytes(o.blob.size)}</span>
            <button className="link" onClick={() => downloadBlob(o.blob, o.name)}>Download</button>
            {(o.blob.type === PDF_MIME || o.blob.type.startsWith('image/') || o.blob.type === 'text/html') && (
              <button className="link" onClick={() => window.open(URL.createObjectURL(o.blob), '_blank')}>Preview</button>
            )}
          </li>
        ))}
      </ul>
      {allPdf && (
        <div className="continue">
          <h3>Continue to…</h3>
          <div className="continue-grid">
            {next.map((t) => (
              <button key={t.id} className="continue-item" onClick={() => continueWith(t)}>
                <ToolIcon tool={t} size={28} />
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="privacy-note">
        🔒 Your files were processed locally in your browser and never left your device. <Link to="/">Back to all tools</Link>
      </p>
    </div>
  );
}
