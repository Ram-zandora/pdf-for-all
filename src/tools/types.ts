import type { ComponentType } from 'react';
import type { OutputFile, Progress } from '../lib/pdf';

export type Category = 'organize' | 'optimize' | 'convert-to' | 'convert-from' | 'edit' | 'security';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'organize', label: 'Organize PDF' },
  { id: 'optimize', label: 'Optimize PDF' },
  { id: 'convert-to', label: 'Convert to PDF' },
  { id: 'convert-from', label: 'Convert from PDF' },
  { id: 'edit', label: 'Edit PDF' },
  { id: 'security', label: 'PDF Security' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Options = Record<string, any>;

export type OptionField =
  | { key: string; label: string; type: 'choice'; choices: { value: string; label: string; hint?: string }[]; showIf?: (o: Options) => boolean }
  | { key: string; label: string; type: 'text' | 'password' | 'textarea'; placeholder?: string; hint?: string; showIf?: (o: Options) => boolean }
  | { key: string; label: string; type: 'number'; min?: number; max?: number; step?: number; showIf?: (o: Options) => boolean }
  | { key: string; label: string; type: 'range'; min: number; max: number; step?: number; unit?: string; showIf?: (o: Options) => boolean }
  | { key: string; label: string; type: 'color' | 'checkbox'; showIf?: (o: Options) => boolean }
  | { key: string; label: string; type: 'select'; choices: { value: string; label: string }[]; showIf?: (o: Options) => boolean }
  | { key: string; label: string; type: 'image'; hint?: string; showIf?: (o: Options) => boolean };

export interface ProcessContext {
  files: File[];
  options: Options;
  progress: Progress;
}

export interface WorkspaceProps {
  tool: ToolDef;
  files: File[];
  setFiles: (files: File[]) => void;
  options: Options;
  setOptions: (o: Options) => void;
  addMore: () => void;
  /** Start processing (for workspaces that render their own action button). */
  run: () => void;
}

export interface ToolDef {
  id: string;
  title: string;
  description: string;
  category: Category;
  color: string;
  /** SVG path data drawn in a 24x24 viewBox. */
  icon: string;
  accept: string;
  acceptLabel: string;
  multiple: boolean;
  minFiles?: number;
  action: string;
  resultTitle: string;
  options?: OptionField[];
  defaults?: Options;
  /** Custom workspace shown after upload instead of the file grid. */
  Workspace?: ComponentType<WorkspaceProps>;
  /** Whether the workspace keeps the options sidebar. */
  sidebar?: boolean;
  /** Custom upload stage (e.g. camera capture) used instead of the drop zone. */
  Uploader?: ComponentType<{ onFiles: (files: File[]) => void; tool: ToolDef }>;
  validate?: (ctx: { files: File[]; options: Options }) => string | null;
  process: (ctx: ProcessContext) => Promise<OutputFile[]>;
  isNew?: boolean;
}
