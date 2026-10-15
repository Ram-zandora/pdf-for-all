import { Link } from 'react-router-dom';
import Logo from './Logo';
import { TOOLS } from '../tools/registry';
import { CATEGORIES } from '../tools/types';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>Every tool you need to work with PDFs, 100% free. Files are processed on your own device and never uploaded anywhere.</p>
        </div>
        {CATEGORIES.slice(0, 4).map((c) => (
          <div key={c.id} className="footer-col">
            <h4>{c.label}</h4>
            {TOOLS.filter((t) => t.category === c.id).map((t) => (
              <Link key={t.id} to={`/${t.id}`}>{t.title}</Link>
            ))}
          </div>
        ))}
        <div className="footer-col">
          <h4>{CATEGORIES[4].label} &amp; Security</h4>
          {TOOLS.filter((t) => t.category === 'edit' || t.category === 'security').map((t) => (
            <Link key={t.id} to={`/${t.id}`}>{t.title}</Link>
          ))}
        </div>
      </div>
      <div className="footer-bottom">© {new Date().getFullYear()} PDF for All — The PDF Editor. Open source, private by design.</div>
    </footer>
  );
}
