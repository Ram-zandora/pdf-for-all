import { useState } from 'react';
import { formatBytes } from '../lib/pdf';
import { useThumb } from '../lib/useThumb';
import type { WorkspaceProps } from '../tools/types';

function FileCard({ file, onRemove }: { file: File; onRemove: () => void }) {
  const thumb = useThumb(file);
  const ext = file.name.split('.').pop()?.toUpperCase();
  return (
    <div className="file-card">
      <div className="file-actions">
        <button title="Remove" onClick={onRemove}>✕</button>
      </div>
      <div className="file-thumb">
        {thumb?.src ? (
          <img src={thumb.src} alt="" draggable={false} />
        ) : thumb?.error ? (
          <span className="thumb-placeholder">🔒 {thumb.error}</span>
        ) : thumb ? (
          <span className="thumb-placeholder file-ext">{ext}</span>
        ) : (
          <span className="spinner" />
        )}
      </div>
      <div className="file-name" title={file.name}>{file.name}</div>
      <div className="file-meta">
        {formatBytes(file.size)}
        {thumb?.pages ? ` · ${thumb.pages} page${thumb.pages > 1 ? 's' : ''}` : ''}
      </div>
    </div>
  );
}

/** Default workspace: sortable file cards with thumbnails. */
export default function FileGrid({ tool, files, setFiles, addMore }: WorkspaceProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = files.slice();
    const [f] = next.splice(from, 1);
    next.splice(to, 0, f);
    setFiles(next);
  };
  return (
    <div className="file-grid-wrap">
      <div className="file-grid">
        {files.map((f, i) => (
          <div
            key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
            className={`file-slot ${drag === i ? 'dragging' : ''}`}
            draggable={tool.multiple}
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
            <FileCard file={f} onRemove={() => setFiles(files.filter((_, k) => k !== i))} />
          </div>
        ))}
      </div>
      <div className="grid-tools">
        {tool.multiple && (
          <button className="fab" title="Add more files" onClick={addMore}>
            +<span className="fab-count">{files.length}</span>
          </button>
        )}
        {tool.multiple && files.length > 1 && (
          <button
            className="fab small"
            title="Sort by name"
            onClick={() => setFiles(files.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))}
          >
            A↓Z
          </button>
        )}
      </div>
    </div>
  );
}
