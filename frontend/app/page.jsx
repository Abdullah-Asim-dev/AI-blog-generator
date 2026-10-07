'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { ArrowRight, Check, Circle, RotateCcw, X, Lightbulb, Search } from 'lucide-react';

const MAX_KEYWORDS = 10;
const API_BASE = 'http://127.0.0.1:8001/api/v1'; // change the port if your backend uses another

const AUDIENCES = [
  { id: 'general', label: 'General', hint: 'Simple, clear language' },
  { id: 'tech-savvy', label: 'Tech-savvy', hint: 'Technical depth, examples' },
  { id: 'business-executive', label: 'Executives', hint: 'Short, ROI-focused' },
];
const TYPES = ['How-to guide', 'Listicle', 'Comparison', 'Opinion', 'Case study'];
const TONES = ['Friendly', 'Professional', 'Persuasive', 'Casual'];
const LENGTHS = [
  { id: '600', label: 'Short', words: 600 },
  { id: '1200', label: 'Standard', words: 1200 },
  { id: '2000', label: 'Long', words: 2000 },
];
const LANGUAGES = ['English', 'اردو', 'Roman Urdu'];
const EXAMPLES = [
  'Beginner guide to starting a freelance career in Pakistan',
  'Best budget laptops for students in 2026',
  'How small businesses can use AI to save time',
];

// Same localStorage keys as before, so the /writer page keeps working.
const getStr = (k, fallback) => {
  try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; }
};
const getList = (k) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return Array.isArray(v) ? v : [];
  } catch { return []; }
};
const setStr = (k, v) => {
  try { localStorage.setItem(k, v); } catch {}
};

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const id = typeof o === 'string' ? o : o.id;
        const text = typeof o === 'string' ? o : o.label;
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
              active
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700/70 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

function Field({ title, hint, children }) {
  return (
    <div className="space-y-2.5">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export default function ContentSetup() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [draft, setDraft] = useState('');
  const [audience, setAudience] = useState('general');
  const [type, setType] = useState('How-to guide');
  const [tone, setTone] = useState('Friendly');
  const [length, setLength] = useState('1200');
  const [language, setLanguage] = useState('English');
  const [error, setError] = useState('');
  const [author, setAuthor] = useState('');
  const [links, setLinks] = useState('');
  const [research, setResearch] = useState(null);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState('');

  // Load saved values once
  useEffect(() => {
    setTopic(getStr('blog_topic', ''));
    setKeywords(getList('blog_keywords'));
    setAudience(getStr('blog_audience', 'general'));
    setType(getStr('blog_type', 'How-to guide'));
    setTone(getStr('blog_tone', 'Friendly'));
    setLength(getStr('blog_length', '1200'));
    setLanguage(getStr('blog_language', 'English'));
    setAuthor(getStr('blog_author', ''));
    setLinks(getStr('blog_links', ''));
    try { setResearch(JSON.parse(localStorage.getItem('blog_research'))); } catch { setResearch(null); }
    setLoaded(true);
  }, []);

  // Save on every change (only after the first load, so nothing gets overwritten)
  useEffect(() => {
    if (!loaded) return;
    setStr('blog_topic', topic);
    setStr('blog_keywords', JSON.stringify(keywords));
    setStr('blog_audience', audience);
    setStr('blog_type', type);
    setStr('blog_tone', tone);
    setStr('blog_length', length);
    setStr('blog_language', language);
    setStr('blog_author', author);
    setStr('blog_links', links);
    setStr('blog_research', JSON.stringify(research || null));
  }, [loaded, topic, keywords, audience, type, tone, length, language, author, links, research]);

  const addKeywords = (raw) => {
    const incoming = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!incoming.length) return;
    setKeywords((prev) => {
      const next = [...prev];
      for (const k of incoming) {
        if (next.length >= MAX_KEYWORDS) break;
        if (!next.some((x) => x.toLowerCase() === k.toLowerCase())) next.push(k);
      }
      return next;
    });
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeywords(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && !draft && keywords.length) {
      setKeywords((k) => k.slice(0, -1));
    }
  };

  // Keyword ideas pulled from the topic text
  const ideas = useMemo(() => {
    const stop = new Set(['guide', 'about', 'their', 'there', 'which', 'with', 'from', 'your', 'best', 'how', 'that', 'this', 'what']);
    const words = topic.toLowerCase().match(/[a-z0-9]{5,}/g) || [];
    return [...new Set(words)]
      .filter((w) => !stop.has(w) && !keywords.some((k) => k.toLowerCase() === w))
      .slice(0, 5);
  }, [topic, keywords]);

  const checks = [
    { ok: topic.trim().length >= 20, text: 'Topic is specific (20+ characters)' },
    { ok: keywords.length >= 3, text: 'At least 3 keywords added' },
    {
      ok: keywords.length > 0 && topic.toLowerCase().includes(keywords[0].toLowerCase()),
      text: 'Main keyword appears in the topic',
    },
    { ok: !!research?.questions?.length, text: 'Research done (real questions and sources)' },
    { ok: author.trim().length > 1, text: 'Author name added' },
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  const words = LENGTHS.find((l) => l.id === length)?.words || 1200;

  const reset = () => {
    setTopic(''); setKeywords([]); setDraft(''); setAudience('general');
    setType('How-to guide'); setTone('Friendly'); setLength('1200'); setLanguage('English');
    setAuthor(''); setLinks(''); setResearch(null); setResearchError('');
    setError('');
  };

  const proceed = () => {
    if (!topic.trim()) {
      setError('Write what the article is about before continuing.');
      return;
    }
    router.push('/writer');
  };

  const runResearch = async () => {
    if (!topic.trim()) { setError('Write the topic first, then research it.'); return; }
    setResearching(true);
    setResearchError('');
    try {
      const { data } = await axios.post(`${API_BASE}/research`, { topic, keywords, language }, { timeout: 180000 });
      if (!data.success) throw new Error(data.error || 'Research failed.');
      setResearch(data);
    } catch (e) {
      const d = e.response?.data?.detail;
      setResearchError(typeof d === 'string' ? d : e.response ? `Server error (${e.response.status}).` : `Can't reach the server at ${API_BASE}. Is the backend running?`);
    } finally {
      setResearching(false);
    }
  };

  const inputBase =
    'w-full rounded-xl border border-slate-700/70 bg-panel2 px-4 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-slate-50 sm:text-3xl">Set up your article</h1>
          <p className="mt-1.5 max-w-xl text-sm text-slate-400">
            Tell us the topic and who it's for. The writer uses this to draft your outline and article.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          <RotateCcw size={13} /> Clear all
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Form */}
        <div className="space-y-8 rounded-2xl border border-slate-800 bg-panel p-6 sm:p-8">
          <Field title="What is the article about?" hint="The more specific, the better the draft.">
            <textarea
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setError(''); }}
              placeholder="e.g. A beginner guide to starting a freelance career in Pakistan"
              className={`${inputBase} h-28 resize-none py-3.5 leading-relaxed ${error ? 'border-red-500/70' : ''}`}
              aria-invalid={!!error}
            />
            <div className="flex items-center justify-between text-xs">
              {error ? <span className="text-red-400" role="alert">{error}</span> : <span />}
              <span className="text-slate-600">{topic.length} characters</span>
            </div>
            {!topic && (
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setTopic(ex)}
                    className="rounded-lg border border-dashed border-slate-700 px-3 py-1.5 text-left text-xs text-slate-400 hover:border-emerald-600 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field title="Keywords" hint={`Press Enter or comma to add. Paste a list to add many. ${keywords.length}/${MAX_KEYWORDS}`}>
            <div className="flex min-h-[3rem] flex-wrap items-center gap-2 rounded-xl border border-slate-700/70 bg-panel2 p-2.5 focus-within:border-emerald-500/70 focus-within:ring-2 focus-within:ring-emerald-500/30">
              {keywords.map((kw, i) => (
                <span
                  key={kw}
                  className={`flex items-center gap-1 rounded-md py-1 pl-2.5 pr-1.5 text-xs font-medium ${
                    i === 0 ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {kw}
                  {i === 0 && <span className="text-[10px] text-emerald-400/80">main</span>}
                  <button
                    type="button"
                    aria-label={`Remove ${kw}`}
                    onClick={() => setKeywords((k) => k.filter((_, j) => j !== i))}
                    className="rounded p-0.5 text-slate-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={(e) => {
                  const t = e.clipboardData.getData('text');
                  if (/[,\n]/.test(t)) { e.preventDefault(); addKeywords(t); }
                }}
                onBlur={() => { addKeywords(draft); setDraft(''); }}
                disabled={keywords.length >= MAX_KEYWORDS}
                placeholder={keywords.length ? 'Add another…' : 'freelancing, remote work…'}
                className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
              />
            </div>
            {ideas.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Lightbulb size={13} className="text-amber-400" /> Ideas from your topic:
                {ideas.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => addKeywords(w)}
                    className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:border-emerald-600 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                  >
                    + {w}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field
            title="Research (recommended)"
            hint="Finds real facts, the questions people ask and related keywords, so the article uses real sources instead of invented numbers."
          >
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runResearch}
                disabled={researching}
                className="flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
              >
                <Search size={14} />
                {researching ? 'Researching… up to 1 minute' : research?.questions?.length ? 'Research again' : 'Research this topic'}
              </button>
              <Link href="/planner" className="text-xs text-slate-500 underline hover:text-slate-300">
                Need topic ideas? Plan a topic cluster
              </Link>
            </div>
            {researchError && <p role="alert" className="text-xs text-red-400">{researchError}</p>}
            {research?.warning && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">{research.warning}</p>
            )}
            {research && (research.questions?.length > 0 || research.keywords?.length > 0) && (
              <div className="space-y-3 rounded-xl border border-slate-800 bg-panel2 p-4 text-xs">
                {research.keywords?.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-slate-500">Related keywords (click to add)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {research.keywords.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => addKeywords(k)}
                          className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:border-emerald-600 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                        >
                          + {k}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {research.questions?.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-slate-500">People also ask (these shape the FAQ)</p>
                    <ul className="list-disc space-y-1 pl-4 text-slate-300">
                      {research.questions.map((q) => <li key={q} dir="auto">{q}</li>)}
                    </ul>
                  </div>
                )}
                {research.gaps?.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-slate-500">What other articles miss</p>
                    <ul className="list-disc space-y-1 pl-4 text-slate-300">
                      {research.gaps.map((g) => <li key={g} dir="auto">{g}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-slate-500">
                  {research.facts?.length || 0} facts and {research.sources?.length || 0} sources found
                </p>
              </div>
            )}
          </Field>

          <div className="grid gap-8 sm:grid-cols-2">
            <Field title="Author name" hint="Google and AI engines trust articles with a named author.">
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                className={`${inputBase} h-12`}
              />
            </Field>
            <Field title="Your other posts (optional)" hint="One per line: Title - https://link. The writer links to the relevant ones.">
              <textarea
                value={links}
                onChange={(e) => setLinks(e.target.value)}
                placeholder={'What is Web3 - https://yourblog.com/web3\nBest wallets - https://yourblog.com/wallets'}
                className={`${inputBase} h-24 resize-none py-3 text-xs leading-relaxed`}
              />
            </Field>
          </div>

          <Field title="Article type">
            <Segmented label="Article type" options={TYPES} value={type} onChange={setType} />
          </Field>

          <Field title="Who is reading?" hint={AUDIENCES.find((a) => a.id === audience)?.hint}>
            <Segmented label="Audience" options={AUDIENCES} value={audience} onChange={setAudience} />
          </Field>

          <div className="grid gap-8 sm:grid-cols-2">
            <Field title="Tone">
              <Segmented label="Tone" options={TONES} value={tone} onChange={setTone} />
            </Field>
            <Field title="Language">
              <Segmented label="Language" options={LANGUAGES} value={language} onChange={setLanguage} />
            </Field>
          </div>

          <Field title="Length" hint={`About ${words} words, around ${Math.ceil(words / 200)} min read`}>
            <Segmented
              label="Length"
              options={LENGTHS.map((l) => ({ id: l.id, label: `${l.label} · ${l.words}` }))}
              value={length}
              onChange={setLength}
            />
          </Field>
        </div>

        {/* Live summary */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-5 rounded-2xl border border-slate-800 bg-panel p-5">
            <div>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Brief strength</h3>
                <span className="text-sm font-semibold text-emerald-400">{score}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${score}%` }} />
              </div>
            </div>

            <ul className="space-y-2">
              {checks.map((c) => (
                <li key={c.text} className={`flex items-start gap-2 text-xs ${c.ok ? 'text-slate-300' : 'text-slate-500'}`}>
                  {c.ok ? <Check size={14} className="mt-px shrink-0 text-emerald-400" /> : <Circle size={14} className="mt-px shrink-0" />}
                  {c.text}
                </li>
              ))}
            </ul>

            <dl className="space-y-1.5 border-t border-slate-800 pt-4 text-xs">
              {[
                ['Type', type],
                ['Audience', AUDIENCES.find((a) => a.id === audience)?.label],
                ['Tone', tone],
                ['Language', language],
                ['Length', `~${words} words`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>

            <button
              type="button"
              onClick={proceed}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-[0.99]"
            >
              Continue to writer <ArrowRight size={15} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}