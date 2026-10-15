import { useEffect, useState } from 'react';
import { compareTexts, documentText, type Comparison } from '../../tools/processors/compare';
import type { WorkspaceProps } from '../../tools/types';
import { usePageImage, usePdfDoc } from '../../lib/usePdf';

function Pages({ file }: { file: File }) {
  const { doc } = usePdfDoc(file);
  return (
    <div className="cmp-pages">
      <div className="cmp-title" title={file.name}>{file.name}</div>
      {doc && Array.from({ length: doc.numPages }, (_, i) => <PageImg key={i} file={file} index={i} />)}
    </div>
  );
}

function PageImg({ file, index }: { file: File; index: number }) {
  const { doc } = usePdfDoc(file);
  const { ref, src } = usePageImage(doc, index + 1, 320);
  return <div ref={ref} className="cmp-page">{src ? <img src={src} alt="" /> : <span className="spinner" />}</div>;
}

export default function CompareWorkspace({ files, setFiles, addMore, run }: WorkspaceProps) {
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'text' | 'visual'>('text');
  const pair = files.slice(0, 2);

  useEffect(() => {
    setResult(null);
    if (pair.length < 2) return;
    let alive = true;
    Promise.all(pair.map(documentText)).then(
      ([a, b]) => alive && setResult(compareTexts(a.join('\n\n'), b.join('\n\n'))),
      () => alive && setError('Could not read one of the documents. Is it password protected?'),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair[0], pair[1]]);

  if (pair.length < 2) {
    return (
      <div className="cmp-need">
        <p>Add a second PDF to compare with <b>{files[0]?.name}</b>.</p>
        <button className="btn-select" onClick={addMore}>Select second PDF</button>
      </div>
    );
  }

  return (
    <div className="compare">
      <div className="editor-toolbar">
        <button className={`tab ${view === 'text' ? 'active' : ''}`} onClick={() => setView('text')}>Text changes</button>
        <button className={`tab ${view === 'visual' ? 'active' : ''}`} onClick={() => setView('visual')}>Side by side</button>
        <button className="btn-light" onClick={() => setFiles([pair[1], pair[0]])}>⇄ Swap</button>
        {result && (
          <span className="cmp-stats">
            <span className="ins-chip">+{result.added} words</span>
            <span className="del-chip">−{result.removed} words</span>
          </span>
        )}
        <span className="tb-spacer" />
        <button className="btn-action inline" onClick={run}>Download report</button>
      </div>
      {error && <div className="error">{error}</div>}
      {view === 'text' ? (
        <div className="cmp-text">
          <div className="cmp-legend">
            <span><del>Removed</del> from {pair[0].name}</span>
            <span><ins>Added</ins> in {pair[1].name}</span>
          </div>
          {result ? (
            <pre>
              {result.changes.map((c, i) => (c.added ? <ins key={i}>{c.value}</ins> : c.removed ? <del key={i}>{c.value}</del> : <span key={i}>{c.value}</span>))}
            </pre>
          ) : (
            <div className="center-loading"><span className="spinner" /> Comparing…</div>
          )}
        </div>
      ) : (
        <div className="cmp-side">
          <Pages file={pair[0]} />
          <Pages file={pair[1]} />
        </div>
      )}
    </div>
  );
}
