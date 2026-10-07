'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Sparkles, Sun, Moon, Check } from 'lucide-react';

const STEPS = [
  { name: 'Brief', path: '/' },
  { name: 'Write', path: '/writer' },
  { name: 'Review', path: '/analyzer' },
  { name: 'Publish', path: '/publisher' },
];

function ThemeToggle() {
  const [theme, setTheme] = useState('dark');
  useEffect(() => setTheme(document.documentElement.dataset.theme || 'dark'), []);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="rounded-lg p-2 text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export default function TopBar() {
  const pathname = usePathname();
  const current = Math.max(0, STEPS.findIndex((s) => (s.path === '/' ? pathname === '/' : pathname.startsWith(s.path))));

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-panel px-4 sm:px-6">
      <Link href="/" className="flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950">
          <Sparkles size={16} />
        </span>
        <span className="hidden text-sm font-semibold text-slate-50 sm:block">LuminaWrite</span>
      </Link>

      <nav aria-label="Progress" className="min-w-0">
        <ol className="flex items-center gap-1 sm:gap-2">
          {STEPS.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={s.path} className="flex items-center gap-1 sm:gap-2">
                {i > 0 && <span className={`h-px w-3 sm:w-8 ${done || active ? 'bg-emerald-500/60' : 'bg-slate-700'}`} />}
                <Link
                  href={s.path}
                  aria-current={active ? 'step' : undefined}
                  className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 sm:pr-3 ${
                    active ? 'bg-emerald-500/10 text-emerald-300' : done ? 'text-slate-300 hover:text-slate-50' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      active ? 'bg-emerald-500 text-slate-950' : done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {done ? <Check size={13} /> : i + 1}
                  </span>
                  <span className={active ? 'inline' : 'hidden sm:inline'}>{s.name}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <ThemeToggle />
    </header>
  );
}