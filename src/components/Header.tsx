import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from './Logo';
import ToolIcon from './ToolIcon';
import { TOOLS } from '../tools/registry';
import { CATEGORIES, type Category } from '../tools/types';

function Menu({ categories, label }: { categories: Category[]; label: string }) {
  return (
    <div className="nav-dropdown">
      <button className="nav-link">
        {label} <span className="caret">▾</span>
      </button>
      <div className={`mega ${categories.length > 2 ? 'mega-wide' : ''}`}>
        {categories.map((c) => (
          <div key={c} className="mega-col">
            <div className="mega-title">{CATEGORIES.find((x) => x.id === c)!.label}</div>
            {TOOLS.filter((t) => t.category === c).map((t) => (
              <Link key={t.id} to={`/${t.id}`} className="mega-item">
                <ToolIcon tool={t} size={22} />
                {t.title}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="brand" aria-label="PDF for All home">
          <Logo />
        </Link>
        <nav className="nav">
          <Link to="/merge-pdf" className="nav-link">MERGE PDF</Link>
          <Link to="/split-pdf" className="nav-link">SPLIT PDF</Link>
          <Link to="/compress-pdf" className="nav-link">COMPRESS PDF</Link>
          <Menu label="CONVERT PDF" categories={['convert-to', 'convert-from']} />
          <Menu label="ALL PDF TOOLS" categories={CATEGORIES.map((c) => c.id)} />
        </nav>
        <button className="burger" aria-label="Menu" onClick={() => setOpen(!open)}>
          <span /> <span /> <span />
        </button>
      </div>
      {open && (
        <div className="mobile-menu">
          {CATEGORIES.map((c) => (
            <div key={c.id}>
              <div className="mega-title">{c.label}</div>
              {TOOLS.filter((t) => t.category === c.id).map((t) => (
                <Link key={t.id} to={`/${t.id}`} className="mega-item">
                  <ToolIcon tool={t} size={22} />
                  {t.title}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
