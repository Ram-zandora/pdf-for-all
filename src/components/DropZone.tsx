import { useRef, useState, type ReactNode } from 'react';
import type { ToolDef } from '../tools/types';

export function acceptsFile(tool: ToolDef, file: File): boolean {
  const rules = tool.accept.split(',').map((r) => r.trim().toLowerCase());
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((r) => (r.startsWith('.') ? name.endsWith(r) : r.endsWith('/*') ? type.startsWith(r.slice(0, -1)) : type === r));
}

export function useFilePicker(tool: ToolDef, onFiles: (files: File[]) => void) {
  const input = useRef<HTMLInputElement>(null);
  const element = (
    <input
      ref={input}
      type="file"
      hidden
      accept={tool.accept}
      multiple={tool.multiple}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length) onFiles(files);
      }}
    />
  );
  return { element, open: () => input.current?.click() };
}

export default function DropZone({ tool, onFiles, children }: { tool: ToolDef; onFiles: (files: File[]) => void; children?: ReactNode }) {
  const [over, setOver] = useState(false);
  const picker = useFilePicker(tool, onFiles);
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(tool.multiple ? files : files.slice(0, 1));
      }}
    >
      {picker.element}
      <button className="btn-select" onClick={picker.open}>
        Select {tool.acceptLabel} file{tool.multiple ? 's' : ''}
      </button>
      <p className="drop-hint">or drop {tool.acceptLabel} here</p>
      {children}
    </div>
  );
}
