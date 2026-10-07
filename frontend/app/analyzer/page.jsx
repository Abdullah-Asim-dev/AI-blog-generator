'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Check, AlertTriangle, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8001/api/v1'; // change the port if your backend uses another

const getStr = (k, f = '') => {
  try { return localStorage.getItem(k) ?? f; } catch { return f; }
};
const setStr = (k, v) => {
  try { localStorage.setItem(k, v); } catch {}
};
const getList = (k) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return Array.isArray(v) ? v : [];
  } catch { return []; }
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Word boundaries that also work for Urdu and other non-English scripts
const phraseRegex = (p) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(p)}(?![\\p{L}\\p{N}])`, 'giu');
const countMatches = (text, p) => (text.match(phraseRegex(p)) || []).length;

// Wording that often reads as machine-written. Edit this list freely.
const STOCK_PHRASES = [
  'furthermore', 'moreover', 'in conclusion', 'delve into', 'delve', 'a testament to',
  'in today\'s fast-paced world', 'it\'s important to note', 'it is important to note',
  'game-changer', 'unlock the power', 'in the realm of', 'rich tapestry', 'navigate the landscape',
];

function analyze(text, keywords, targetWords) {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/) : [];
  const wordCount = words.length;
  const sentences = trimmed.split(/[.!?۔؟]+/).map((s) => s.trim()).filter(Boolean);
  const avgSentence = sentences.length ? wordCount / sentences.length : 0;
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim());
  const longParas = paragraphs.filter((p) => p.trim().split(/\s+/).length > 150).length;
  const headings = trimmed.split('\n').filter((l) => /^#{1,3}\s+\S/.test(l));
  const first100 = words.slice(0, 100).join(' ');

  const kwRows = keywords.map((kw) => {
    const hits = countMatches(trimmed, kw);
    const kwWords = kw.trim().split(/\s+/).length;
    const density = wordCount ? ((hits * kwWords) / wordCount) * 100 : 0;
    let state = 'good';
    if (hits === 0) state = 'missing';
    else if (density < 0.5) state = 'low';
    else if (density > 2.5) state = 'high';
    return { kw, hits, density, state };
  });

  const bodyParas = paragraphs.filter((p) => !/^#{1,6}\s/.test(p.trim()));
  const firstParaWords = bodyParas.length ? bodyParas[0].trim().split(/\s+/).length : 0;
  const questionHeadings = trimmed.split('\n').filter((l) => /^#{2,3}\s+.+[?؟]\s*$/.test(l)).length;
  const hasFaq =
    /^#{2,3}\s+.*(faq|frequently asked|سوالات)/im.test(trimmed) ||
    trimmed.split('\n').filter((l) => /^###\s+.+[?؟]\s*$/.test(l)).length >= 3;
  const hasTableOrList = /^\s*\|.+\|\s*$/m.test(trimmed) || (trimmed.match(/^\s*[-*]\s+\S/gm) || []).length >= 3;
  const hasSources =
    /^#{2,3}\s+(sources|references|ذرائع|حوالہ)/im.test(trimmed) || (trimmed.match(/https?:\/\//g) || []).length >= 2;
  const main = keywords[0];
  const lengthGoal = targetWords ? Math.round(targetWords * 0.9) : 300;
  const checks = [
    {
      ok: wordCount >= lengthGoal,
      text: targetWords ? `Close to your target length (${wordCount} of ${targetWords} words)` : `At least 300 words (${wordCount})`,
    },
    ...(main
      ? [
          { ok: phraseRegex(main).test(first100), text: `Main keyword "${main}" appears in the first 100 words` },
          {
            ok: headings.some((h) => phraseRegex(main).test(h)),
            text: `Main keyword is in at least one heading`,
          },
        ]
      : []),
    { ok: headings.length >= 2, text: `Uses headings to break up the article (${headings.length} found)` },
    { ok: avgSentence > 0 && avgSentence <= 20, text: `Sentences are short enough (${avgSentence.toFixed(0)} words on average)` },
    { ok: longParas === 0, text: longParas ? `${longParas} paragraph(s) over 150 words` : 'No overly long paragraphs' },
    ...(wordCount > 0
      ? [
          { ok: firstParaWords > 0 && firstParaWords <= 70, text: `Opens with a short direct answer (${firstParaWords} words)` },
          { ok: questionHeadings >= 2, text: `Has question-style headings (${questionHeadings})` },
          { ok: hasFaq, text: 'Has a FAQ section' },
          { ok: hasTableOrList, text: 'Has a table or list that sums up the key points' },
          { ok: hasSources, text: 'Lists sources or links to references' },
        ]
      : []),
    ...(keywords.length ? [{ ok: kwRows.every((r) => r.state === 'good'), text: 'Every keyword is used a healthy amount' }] : []),
  ];

  const stock = STOCK_PHRASES.map((p) => ({ p, n: countMatches(trimmed, p) })).filter((x) => x.n > 0);
  const score = checks.length && wordCount ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 100) : 0;

  return { wordCount, sentences: sentences.length, headings: headings.length, readMin: Math.max(1, Math.ceil(wordCount / 200)), kwRows, checks, stock, score };
}

const STATE_LABEL = { good: 'Good', low: 'Too few', high: 'Too many', missing: 'Missing' };
const STATE_STYLE = {
  good: 'text-emerald-300 bg-emerald-500/10',
  low: 'text-amber-300 bg-amber-500/10',
  high: 'text-orange-300 bg-orange-500/10',
  missing: 'text-red-300 bg-red-500/10',
};

function CopyButton({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  const click = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={click}
      className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
    >
      {done ? 'Copied' : label}
    </button>
  );
}

function PackRow({ title, value, limit }) {
  if (!value) return null;
  const over = limit && value.length > limit;
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-300">{title}</p>
        <span className="flex items-center gap-1">
          {limit && <span className={`text-xs ${over ? 'text-amber-300' : 'text-slate-500'}`}>{value.length}/{limit}</span>}
          <CopyButton value={value} />
        </span>
      </div>
      <p dir="auto" className="mt-1 rounded-lg bg-panel2 px-3 py-2 text-xs leading-relaxed text-slate-200">{value}</p>
    </div>
  );
}

function SeoPack({ text, keywords }) {
  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('blog_seo_pack'));
      if (v && v.meta_title) setPack(v);
    } catch {}
  }, []);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post(
        `${API_BASE}/seo-pack`,
        { article: text, topic: getStr('blog_topic'), keywords, author: getStr('blog_author'), language: getStr('blog_language', 'English') },
        { timeout: 120000 }
      );
      if (!data.success) throw new Error(data.error || 'Could not create the SEO pack.');
      setPack(data);
      setStr('blog_seo_pack', JSON.stringify(data));
    } catch (e) {
      const d = e.response?.data?.detail;
      setError(typeof d === 'string' ? d : e.response ? `Server error (${e.response.status}).` : `Can't reach the server at ${API_BASE}. Is the backend running?`);
    } finally {
      setLoading(false);
    }
  };

  const script = pack ? `<script type="application/ld+json">\n${pack.schema_json}\n</script>` : '';

  return (
    <section className="rounded-2xl border border-slate-800 bg-panel p-5">
      <h2 className="text-sm font-semibold text-slate-100">Search and AI pack</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Meta tags, FAQ and schema that help Google and AI answer engines understand and quote this article.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
      >
        <Sparkles size={14} /> {loading ? 'Creating…' : pack ? 'Create again' : 'Create SEO pack'}
      </button>
      {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}

      {pack && (
        <div className="mt-4 space-y-3">
          <PackRow title="Meta title" value={pack.meta_title} limit={60} />
          <PackRow title="Meta description" value={pack.meta_description} limit={155} />
          <PackRow title="URL slug" value={pack.slug} />
          <PackRow title="Image alt text" value={pack.image_alt} limit={120} />
          <PackRow title="Image idea" value={pack.image_prompt} />
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-300">Schema (JSON-LD) · {pack.faq?.length || 0} FAQ questions</p>
              <CopyButton value={script} label="Copy as script tag" />
            </div>
            <textarea
              readOnly
              value={pack.schema_json}
              aria-label="Schema JSON-LD"
              className="mt-1 h-36 w-full resize-y rounded-lg bg-panel2 p-3 font-mono text-[11px] leading-relaxed text-slate-300 focus:outline-none"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Paste it into your page's HTML (WordPress: a Custom HTML block or an SEO plugin; Blogger: HTML view).
              The slug and description are also sent to WordPress, Ghost and Dev.to when you publish.
            </p>
          </div>
          <p className="text-xs text-slate-500">Changed the article after this? Press "Create again".</p>
        </div>
      )}
    </section>
  );
}

export default function SEO_AI_Analyzer() {
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [target, setTarget] = useState(0);

  useEffect(() => {
    setText(getStr('cache_human_blog'));
    setKeywords(getList('blog_keywords'));
    setTarget(Number(getStr('blog_length', '0')) || 0);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) setStr('cache_human_blog', text);
  }, [loaded, text]);

  const r = useMemo(() => analyze(text, keywords, target), [text, keywords, target]);

  if (!loaded) return null;

  if (!text.trim()) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-bold text-slate-50">Nothing to check yet</h1>
        <p className="mt-2 text-sm text-slate-400">Write an article first, then come back to review it.</p>
        <Link href="/writer" className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
          <ArrowLeft size={15} /> Go to writer
        </Link>
      </div>
    );
  }

  const scoreColor = r.score >= 80 ? 'bg-emerald-500' : r.score >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 sm:text-3xl">Review your article</h1>
          <p className="mt-1.5 text-sm text-slate-400">Edit on the left. The checks update as you type.</p>
        </div>
        <Link href="/publisher" className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
          Continue to publish <ArrowRight size={15} />
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Editor */}
        <textarea
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Article text"
          className="min-h-[520px] w-full resize-y rounded-2xl border border-slate-800 bg-panel p-6 font-serif text-[15px] leading-relaxed text-slate-200 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 lg:min-h-[calc(100dvh-14rem)]"
        />

        {/* Results */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-800 bg-panel p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-100">SEO and AI-search checklist</h2>
              <span className="text-sm font-semibold text-slate-100">{r.score}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full rounded-full transition-all ${scoreColor}`} style={{ width: `${r.score}%` }} />
            </div>
            <ul className="mt-4 space-y-2.5">
              {r.checks.map((c) => (
                <li key={c.text} className={`flex items-start gap-2 text-xs leading-snug ${c.ok ? 'text-slate-300' : 'text-slate-400'}`}>
                  {c.ok ? (
                    <Check size={14} className="mt-px shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle size={14} className="mt-px shrink-0 text-amber-400" />
                  )}
                  {c.text}
                </li>
              ))}
            </ul>
          </section>

          <SeoPack text={text} keywords={keywords} />

          <section className="grid grid-cols-4 gap-2 rounded-2xl border border-slate-800 bg-panel p-4 text-center">
            {[
              ['Words', r.wordCount],
              ['Min read', r.readMin],
              ['Sentences', r.sentences],
              ['Headings', r.headings],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-lg font-semibold text-slate-50">{v}</p>
                <p className="text-xs text-slate-500">{k}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-panel p-5">
            <h2 className="text-sm font-semibold text-slate-100">Keywords</h2>
            <p className="mt-0.5 text-xs text-slate-500">A healthy range is 0.5% to 2.5% of the words.</p>
            {r.kwRows.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                No keywords set. <Link href="/" className="underline">Add some in the brief.</Link>
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {r.kwRows.map((k, i) => (
                  <li key={k.kw} className="flex items-center justify-between gap-3 rounded-lg bg-panel2 px-3 py-2">
                    <span className="min-w-0 truncate text-sm text-slate-200" dir="auto">
                      {k.kw} {i === 0 && <span className="text-xs text-emerald-400">main</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      <span className="text-slate-500">{k.hits}× · {k.density.toFixed(1)}%</span>
                      <span className={`rounded px-1.5 py-0.5 ${STATE_STYLE[k.state]}`}>{STATE_LABEL[k.state]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-panel p-5">
            <h2 className="text-sm font-semibold text-slate-100">Stock phrases</h2>
            <p className="mt-0.5 text-xs text-slate-500">Wording that often sounds machine-written. Rewording these helps the text read naturally.</p>
            {r.stock.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300"><Check size={14} /> None found.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.stock.map((s) => (
                  <span key={s.p} className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                    {s.p} <span className="text-amber-400/70">×{s.n}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}