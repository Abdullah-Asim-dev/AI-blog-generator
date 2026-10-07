'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Cpu, PenLine, Copy, Check, Download, Sparkles, RefreshCw, ArrowLeft, ArrowRight, Square } from 'lucide-react';

// Change the port here if your backend runs somewhere else
const API_URL = process.env.NEXT_PUBLIC_API_URL 
  || 'https://ai-blog-generator-1-0wlv.onrender.com/api/v1/generate';

// Turns the saved research into plain text the writer can use
function researchToText(r) {
  if (!r || typeof r !== 'object') return '';
  const lines = [];
  if (r.facts?.length) lines.push('Facts (use these, with their source):', ...r.facts.map((f) => `- ${f}`));
  if (r.questions?.length) lines.push('', 'Questions people ask (answer them in the article and the FAQ):', ...r.questions.map((q) => `- ${q}`));
  if (r.gaps?.length) lines.push('', 'Angles that competitors miss (cover them):', ...r.gaps.map((g) => `- ${g}`));
  if (r.sources?.length) lines.push('', 'Source URLs:', ...r.sources.map((s) => `- ${s.title} - ${s.url}`));
  return lines.join('\n');
}

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
const countWords = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export default function SplitWriterWorkspace() {
  const [loaded, setLoaded] = useState(false);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiDraft, setAiDraft] = useState('');
  const [finalText, setFinalText] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    setBrief({
      topic: getStr('blog_topic'),
      keywords: getList('blog_keywords'),
      audience: getStr('blog_audience', 'general'),
      type: getStr('blog_type', 'How-to guide'),
      tone: getStr('blog_tone', 'Friendly'),
      length: getStr('blog_length', '1200'),
      language: getStr('blog_language', 'English'),
      author: getStr('blog_author'),
      links: getStr('blog_links'),
      research: (() => { try { return JSON.parse(localStorage.getItem('blog_research')); } catch { return null; } })(),
    });
    setAiDraft(getStr('cache_ai_draft'));
    setFinalText(getStr('cache_human_blog'));
    setLoaded(true);
  }, []);

  // Autosave edits
  useEffect(() => {
    if (loaded) setStr('cache_human_blog', finalText);
  }, [loaded, finalText]);

  const generate = async () => {
    if (!brief?.topic) return;
    if (finalText.trim() && !window.confirm('This replaces your current text with a new draft. Continue?')) return;
    abortRef.current = new AbortController();
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post(
        API_URL,
        {
          topic: brief.topic,
          keywords: brief.keywords,
          audience: brief.audience,
          article_type: brief.type,
          tone: brief.tone,
          language: brief.language,
          word_count: Number(brief.length),
          research: researchToText(brief.research),
          author: brief.author || '',
          internal_links: (brief.links || '').split('\n').map((l) => l.trim()).filter(Boolean),
        },
        { signal: abortRef.current.signal, timeout: 300000 }
      );
      if (!data.success) throw new Error(data.error || 'The server could not write the article.');
      setAiDraft(data.original_ai_draft || '');
      setFinalText(data.final_humanized_blog || '');
      setStr('cache_ai_draft', data.original_ai_draft || '');
      setStr('blog_seo_pack', ''); // the old SEO pack belongs to the old article
    } catch (e) {
      if (axios.isCancel(e)) setError('Stopped. Your previous text is unchanged.');
      else if (e.code === 'ECONNABORTED') setError('The server took too long. Try a shorter length.');
      else if (e.response) {
        const d = e.response.data?.detail;
        setError(e.response.data?.error || (typeof d === 'string' ? d : `Server error (${e.response.status}). Check the server log.`));
      }
      else setError(`Can't reach the writing server at ${API_URL}. Check that it is running.`);
    } finally {
      setLoading(false);
    }
  };

  const stop = () => abortRef.current?.abort();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(finalText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy was blocked by the browser. Select the text and copy it manually.');
    }
  };

  const download = () => {
    const name = (brief?.topic || 'article').slice(0, 50).replace(/[^\w\u0600-\u06FF]+/g, '-');
    const url = URL.createObjectURL(new Blob([finalText], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const finalWords = useMemo(() => countWords(finalText), [finalText]);
  const draftWords = useMemo(() => countWords(aiDraft), [aiDraft]);
  const target = Number(brief?.length || 0);
  const hasText = finalText.trim().length > 0;

  const btnGhost =
    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70';

  if (!loaded) return null;

  // No brief yet
  if (!brief.topic) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-bold text-slate-50">No topic yet</h1>
        <p className="mt-2 text-sm text-slate-400">Set up your article first, then come back to write it.</p>
        <Link href="/" className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
          <ArrowLeft size={15} /> Go to content brief
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-[640px] w-full max-w-7xl flex-col px-4 py-5 sm:px-6">
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mt-0.5 text-xl font-bold text-slate-50 sm:text-2xl">Write your article</h1>
          <p className="mt-1 max-w-2xl truncate text-sm text-slate-400" title={brief.topic}>{brief.topic}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[brief.type, brief.tone, brief.language, `~${brief.length} words`, ...(brief.research?.questions?.length ? ['Research ✓'] : [])].map((t) => (
              <span key={t} className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{t}</span>
            ))}
            {brief.keywords.map((k, i) => (
              <span key={k} className={`rounded-md px-2 py-0.5 text-xs ${i === 0 ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-500/10 text-emerald-300'}`}>{k}</span>
            ))}
            <Link href="/" className="px-1 py-0.5 text-xs text-slate-500 underline hover:text-slate-300">Edit brief</Link>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {loading ? (
            <button onClick={stop} className="flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70">
              <Square size={13} /> Stop
            </button>
          ) : (
            <button onClick={generate} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-[0.99]">
              {hasText ? <><RefreshCw size={15} /> Write again</> : <><Sparkles size={15} /> Write article</>}
            </button>
          )}
          <Link href="/analyzer" className="hidden items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 sm:flex">
            Check SEO <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Two panels */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        {/* AI draft */}
        <section className="flex min-h-[260px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-panel">
          <div className="flex items-center justify-between border-b border-slate-800 bg-panel2 px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-sm font-medium text-orange-300">
              <Cpu size={15} /> AI first draft
            </h2>
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500">{draftWords} words</span>
              <button
                type="button"
                disabled={!aiDraft}
                onClick={() => setFinalText(aiDraft)}
                className={btnGhost}
                title="Replace the edited version with this draft"
              >
                Use this version
              </button>
            </div>
          </div>
          <textarea
            readOnly
            dir="auto"
            value={aiDraft}
            aria-label="AI first draft"
            placeholder="The AI's raw draft will appear here after you write the article."
            className="w-full flex-1 resize-none bg-transparent p-5 font-mono text-xs leading-relaxed text-slate-400 placeholder:text-slate-600 focus:outline-none"
          />
        </section>

        {/* Final editable */}
        <section className="relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-emerald-500/25 bg-panel">
          <div className="flex items-center justify-between border-b border-slate-800 bg-panel2 px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-sm font-medium text-emerald-300">
              <PenLine size={15} /> Final version <span className="text-xs font-normal text-slate-500">(you can edit)</span>
            </h2>
            <div className="flex items-center gap-1">
              <span className={`mr-1 text-xs ${target && finalWords >= target * 0.9 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {finalWords}{target ? ` / ${target}` : ''} words
              </span>
              <button type="button" onClick={copy} disabled={!hasText} className={btnGhost}>
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={download} disabled={!hasText} className={btnGhost}>
                <Download size={14} /> Save .md
              </button>
            </div>
          </div>

          {loading && (
            <div className="absolute inset-x-0 top-[45px] h-0.5 overflow-hidden bg-slate-800">
              <div className="h-full w-1/3 animate-pulse bg-emerald-500" />
            </div>
          )}

          <textarea
            dir="auto"
            value={finalText}
            onChange={(e) => setFinalText(e.target.value)}
            disabled={loading}
            aria-label="Final article"
            placeholder={loading ? 'Writing your article… this can take up to a minute.' : 'Your finished article will appear here. Edit it freely, changes save automatically.'}
            className="w-full flex-1 resize-none bg-transparent p-5 font-serif text-[15px] leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none disabled:opacity-60"
          />
        </section>
      </div>
    </div>
  );
}