import { useCallback, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { toolById } from '../tools/registry';
import type { Options, ToolDef } from '../tools/types';
import type { OutputFile } from '../lib/pdf';
import DropZone, { acceptsFile, useFilePicker } from './DropZone';
import FileGrid from './FileGrid';
import OptionsPanel from './OptionsPanel';
import ResultView from './ResultView';
import { takeHandoff } from './handoff';

export default function ToolPageRoute() {
  const { toolId } = useParams();
  // Keying on location.key restarts the tool when its nav link is clicked again.
  const { key } = useLocation();
  const tool = toolById(toolId);
  if (!tool) {
    return (
      <div className="notfound">
        <h1>404</h1>
        <p>This tool doesn’t exist.</p>
        <Link to="/" className="btn-select">See all PDF tools</Link>
      </div>
    );
  }
  return <ToolPage key={`${tool.id}:${key}`} tool={tool} />;
}

type Stage = 'work' | 'processing' | 'done';

function ToolPage({ tool }: { tool: ToolDef }) {
  const [files, setFilesRaw] = useState<File[]>(() => {
    const carried = takeHandoff().filter((f) => acceptsFile(tool, f));
    return tool.multiple ? carried : carried.slice(0, 1);
  });
  const [options, setOptions] = useState<Options>(() => ({ ...(tool.defaults ?? {}) }));
  const [stage, setStage] = useState<Stage>('work');
  const [progress, setProgress] = useState<{ value: number; label?: string }>({ value: 0 });
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const setFiles = useCallback((next: File[]) => {
    setError(null);
    setFilesRaw(next);
  }, []);

  const addFiles = (incoming: File[]) => {
    const ok = incoming.filter((f) => acceptsFile(tool, f));
    const rejected = incoming.length - ok.length;
    setFilesRaw((prev) => (tool.multiple ? [...prev, ...ok] : ok.slice(0, 1)));
    setError(rejected ? `${rejected} file${rejected > 1 ? 's were' : ' was'} skipped: only ${tool.acceptLabel} files are supported here.` : null);
  };
  const picker = useFilePicker(tool, addFiles);

  const run = async () => {
    const min = tool.minFiles ?? 1;
    if (files.length < min) {
      setError(`Please select at least ${min} ${tool.acceptLabel} files.`);
      return;
    }
    const invalid = tool.validate?.({ files, options });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setStage('processing');
    setProgress({ value: 0 });
    try {
      // Yield so the progress screen paints before heavy work starts.
      await new Promise((r) => setTimeout(r, 30));
      const result = await tool.process({
        files,
        options,
        progress: (value, label) => setProgress((p) => ({ value: Math.max(0, Math.min(1, value)), label: label ?? p.label })),
      });
      setOutputs(result);
      setStage('done');
    } catch (e) {
      console.error(e);
      const err = e as Error & { name?: string };
      let msg = err.message || String(e);
      if (tool.id !== 'unlock-pdf' && (err.name === 'PasswordException' || /encrypted|password/i.test(msg))) {
        msg = `${msg.replace(/\.$/, '')}. If the file is password protected, unlock it first with Unlock PDF.`;
      }
      setError(msg);
      setStage('work');
    }
  };

  const showUpload = files.length === 0 && tool.minFiles !== 0;

  if (stage === 'processing') {
    return (
      <div className="processing">
        <h2>{progress.label || `${tool.action}…`}</h2>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${Math.round(progress.value * 100)}%` }} />
        </div>
        <p>{Math.round(progress.value * 100)}%</p>
      </div>
    );
  }

  if (stage === 'done') {
    return <ResultView tool={tool} outputs={outputs} inputSize={files.reduce((n, f) => n + f.size, 0)} onBack={() => setStage('work')} />;
  }

  if (showUpload) {
    const Uploader = tool.Uploader;
    return (
      <div className="tool-start">
        <h1>{tool.title}</h1>
        <p className="tool-desc">{tool.description}</p>
        {error && <div className="error">{error}</div>}
        {Uploader ? <Uploader tool={tool} onFiles={addFiles} /> : <DropZone tool={tool} onFiles={addFiles} />}
        <p className="privacy-note">🔒 Files are processed in your browser — they are never uploaded.</p>
      </div>
    );
  }

  const Workspace = tool.Workspace ?? FileGrid;
  const sidebar = tool.Workspace ? tool.sidebar : true;
  return (
    <div className={`workspace ${sidebar ? '' : 'no-sidebar'}`}>
      {picker.element}
      <div className="workspace-main">
        {!sidebar && error && <div className="error floating">{error}</div>}
        <Workspace tool={tool} files={files} setFiles={setFiles} options={options} setOptions={setOptions} addMore={picker.open} run={run} />
      </div>
      {sidebar && (
        <aside className="sidebar">
          <h2>{tool.title}</h2>
          {tool.options ? (
            <OptionsPanel fields={tool.options} options={options} setOptions={setOptions} />
          ) : (
            <p className="sidebar-info">
              {tool.multiple && files.length > 1
                ? 'Drag and drop files to change their order, or use the sort button.'
                : 'Ready when you are. Press the button below to start.'}
            </p>
          )}
          {error && <div className="error">{error}</div>}
          <button className="btn-action" onClick={run}>
            {tool.action} <span aria-hidden>➜</span>
          </button>
        </aside>
      )}
    </div>
  );
}
