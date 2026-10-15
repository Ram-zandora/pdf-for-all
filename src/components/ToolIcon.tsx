import type { ToolDef } from '../tools/types';

export default function ToolIcon({ tool, size = 48 }: { tool: Pick<ToolDef, 'icon' | 'color'>; size?: number }) {
  return (
    <span className="tool-icon" style={{ width: size, height: size, background: tool.color }}>
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={tool.icon} />
      </svg>
    </span>
  );
}
