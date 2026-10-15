import type { WorkspaceProps } from '../../tools/types';

const SAMPLE = `<!doctype html>
<html>
  <body style="font-family: sans-serif; padding: 24px">
    <h1>Hello PDF!</h1>
    <p>Paste your own HTML here, upload saved web pages, or enter a URL.</p>
  </body>
</html>`;

export default function HtmlWorkspace({ files, setFiles, options, setOptions, addMore }: WorkspaceProps) {
  const set = (k: string, v: string) => setOptions({ ...options, [k]: v });
  return (
    <div className="html-ws">
      <div className="tabs">
        {[['html', 'Paste HTML'], ['file', 'HTML files'], ['url', 'Website URL']].map(([k, l]) => (
          <button key={k} className={`tab ${options.source === k ? 'active' : ''}`} onClick={() => {
            if (k !== 'file') setFiles([]);
            set('source', k);
          }}>{l}</button>
        ))}
      </div>
      {options.source === 'html' && (
        <div className="html-panes">
          <textarea className="code" spellCheck={false} value={options.html || ''} placeholder={SAMPLE} onChange={(e) => set('html', e.target.value)} />
          <iframe title="Preview" sandbox="" className="html-preview" srcDoc={options.html || SAMPLE} />
        </div>
      )}
      {options.source === 'url' && (
        <div className="url-box">
          <input type="url" placeholder="https://example.com" value={options.url || ''} onChange={(e) => set('url', e.target.value)} />
          <p className="muted">
            Conversion runs entirely in your browser, so it only works for sites that allow cross-origin access (CORS).
            For other sites, save the page (Ctrl+S) and use “HTML files”.
          </p>
        </div>
      )}
      {options.source === 'file' && (
        <div className="url-box">
          <button className="btn-select" onClick={addMore}>Select HTML files</button>
          <ul className="output-list">
            {files.map((f, i) => (
              <li key={i}>
                <span className="output-name">{f.name}</span>
                <button className="link" onClick={() => setFiles(files.filter((_, k) => k !== i))}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
