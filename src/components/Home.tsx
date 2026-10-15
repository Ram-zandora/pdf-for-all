import { useState } from 'react';
import { Link } from 'react-router-dom';
import ToolIcon from './ToolIcon';
import { TOOLS } from '../tools/registry';
import type { Category } from '../tools/types';

const FILTERS: { id: 'all' | Category | 'convert'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'organize', label: 'Organize PDF' },
  { id: 'optimize', label: 'Optimize PDF' },
  { id: 'convert', label: 'Convert PDF' },
  { id: 'edit', label: 'Edit PDF' },
  { id: 'security', label: 'PDF Security' },
];

export default function Home() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const tools = TOOLS.filter((t) =>
    (filter === 'all' || t.category === filter || (filter === 'convert' && t.category.startsWith('convert'))) &&
    (!q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
  );
  return (
    <>
      <section className="hero">
        <h1>Every tool you need to work with PDFs in one place</h1>
        <p>
          Every tool you need to use PDFs, at your fingertips. All are 100% FREE and easy to use! Merge, split, compress,
          convert, rotate, unlock and watermark PDFs with just a few clicks.
        </p>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f.id} className={`chip ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
          <input className="search" type="search" placeholder="Search tools…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </section>
      <section className="tool-grid">
        {tools.map((t) => (
          <Link key={t.id} to={`/${t.id}`} className="tool-card">
            {t.isNew && <span className="badge-new">New!</span>}
            <ToolIcon tool={t} />
            <h3>{t.title}</h3>
            <p>{t.description}</p>
          </Link>
        ))}
        {!tools.length && <p className="empty">No tools match “{query}”.</p>}
      </section>
      <section className="features">
        <div>
          <h3>🔒 Private by design</h3>
          <p>Your documents are processed entirely inside your browser. Nothing is ever uploaded to a server.</p>
        </div>
        <div>
          <h3>⚡ Fast &amp; free</h3>
          <p>No sign-up, no watermarks, no limits on file size or number of tasks. Just open a tool and go.</p>
        </div>
        <div>
          <h3>🧰 {TOOLS.length} tools</h3>
          <p>Merge, split, compress, convert, OCR, sign, redact, compare and more — everything in one place.</p>
        </div>
      </section>
    </>
  );
}
