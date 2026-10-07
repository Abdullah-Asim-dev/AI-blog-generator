'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Layers, Sparkles, ArrowRight } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8001/api/v1'; // change the port if your backend uses another
const LANGUAGES = ['English', 'اردو', 'Roman Urdu'];
const INTENTS = { informational: 'Learn', commercial: 'Compare', transactional: 'Buy' };

const getStr = (k, f = '') => {
  try { return localStorage.getItem(k) ?? f; } catch { return f; }
};
const setStr = (k, v) => {
  try { localStorage.setItem(k, v); } catch {}
};

export default function PlannerPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('English');
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTopic(getStr('cluster_topic'));
    setLanguage(getStr('blog_language', 'English'));
    try { setPlan(JSON.parse(localStorage.getItem('blog_cluster'))); } catch { setPlan(null); }
    setLoaded(true);
  }, []);

  const run = async () => {
    if (!topic.trim()) { setError('Write the main topic first.'); return; }
    setLoading(true);
    setError('');
    setStr('cluster_topic', topic);
    try {
      const { data } = await axios.post(`${API_BASE}/cluster-plan`, { topic, keywords: [], language, count: 8 }, { timeout: 120000 });
      if (!data.success) throw new Error(data.error || 'Could not plan the cluster.');
      setPlan(data);
      setStr('blog_cluster', JSON.stringify(data));
    } catch (e) {
      const d = e.response?.data?.detail;
      setError(typeof d === 'string' ? d : e.response ? `Server error (${e.response.status}).` : `Can't reach the server at ${API_BASE}. Is the backend running?`);
    } finally {
      setLoading(false);
    }
  };

  const write = (title, keyword) => {
    if (getStr('cache_human_blog').trim() && !window.confirm('Starting a new article replaces the one you are working on. Continue?')) return;
    setStr('blog_topic', title);
    setStr('blog_keywords', JSON.stringify(keyword ? [keyword] : []));
    setStr('blog_language', language);
    ['blog_research', 'cache_ai_draft', 'cache_human_blog', 'blog_seo_pack'].forEach((k) => setStr(k, ''));
    router.push('/');
  };

  const input =
    'w-full rounded-xl border border-slate-700/70 bg-panel2 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';

  if (!loaded) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-50 sm:text-3xl">
          <Layers size={24} className="text-emerald-400" /> Plan a topic cluster
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          One main article plus 8 supporting ones, each answering a different question. Linking them together shows Google you cover the whole topic.
        </p>
      </header>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-panel p-6">
        <div>
          <label htmlFor="topic" className="mb-1.5 block text-sm font-medium text-slate-200">Main topic</label>
          <input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Freelancing in Pakistan" className={input} />
        </div>
        <div role="radiogroup" aria-label="Language" className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={language === l}
              onClick={() => setLanguage(l)}
              className={`rounded-lg border px-3.5 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
                language === l ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700/70 text-slate-400 hover:border-slate-500'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <Sparkles size={15} /> {loading ? 'Planning…' : plan ? 'Plan again' : 'Plan the cluster'}
        </button>
      </div>

      {plan && (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-emerald-300">Main (pillar) article</p>
              <p dir="auto" className="mt-0.5 text-sm font-semibold text-slate-50">{plan.pillar.title}</p>
              <p dir="auto" className="text-xs text-slate-400">Keyword: {plan.pillar.keyword}</p>
            </div>
            <button
              type="button"
              onClick={() => write(plan.pillar.title, plan.pillar.keyword)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Write this <ArrowRight size={13} />
            </button>
          </div>

          <ul className="space-y-2">
            {plan.ideas.map((idea, i) => (
              <li key={`${idea.title}-${i}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-panel p-4">
                <div className="min-w-0">
                  <p dir="auto" className="text-sm font-medium text-slate-100">{idea.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span dir="auto">Keyword: {idea.keyword}</span>
                    <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-slate-300">{INTENTS[idea.intent] || idea.intent}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => write(idea.title, idea.keyword)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                >
                  Write this <ArrowRight size={12} />
                </button>
              </li>
            ))}
          </ul>

          <p className="rounded-lg bg-slate-800/50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-400">
            Write each article with its own research and facts, and link the supporting ones to the main article and to each other.
            Publish them over a few weeks rather than all at once, and avoid mass-producing thin pages, which Google treats as spam.
          </p>
        </div>
      )}
    </div>
  );
}