'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Send, Eye, EyeOff, Check, ExternalLink, ArrowLeft, X } from 'lucide-react';

// Change the port here if your backend runs somewhere else
const API_BASE = 'https://ai-blog-generator-1-0wlv.onrender.com/api/v1';

// Each site: which fields it needs. `key` must match the backend field name.
const PLATFORMS = {
  wordpress: {
    label: 'WordPress',
    endpoint: '/publish-wordpress',
    help: "In WordPress: Users → Profile → Application Passwords. Don't use your normal login password.",
    fields: [
      { key: 'site_url', label: 'Site address', type: 'url', placeholder: 'https://yourblog.com', remember: true },
      { key: 'username', label: 'Username', type: 'text', placeholder: 'Your WordPress login', remember: true },
      { key: 'app_password', label: 'Application password', type: 'secret', placeholder: 'xxxx xxxx xxxx xxxx' },
    ],
  },
  devto: {
    label: 'Dev.to',
    endpoint: '/publish-devto',
    help: 'On dev.to: Settings → Extensions → Generate API key.',
    fields: [{ key: 'api_key', label: 'API key', type: 'secret', placeholder: 'Paste your Dev.to API key' }],
  },
  hashnode: {
    label: 'Hashnode',
    endpoint: '/publish-hashnode',
    help: 'On hashnode.com: Account settings → Developer → Generate new token. We use your first blog automatically.',
    fields: [
      { key: 'token', label: 'Access token', type: 'secret', placeholder: 'Paste your Hashnode token' },
      { key: 'publication_id', label: 'Blog ID (optional)', type: 'text', placeholder: 'Leave empty to use your first blog', optional: true, remember: true },
    ],
  },
  ghost: {
    label: 'Ghost',
    endpoint: '/publish-ghost',
    help: 'In Ghost admin: Settings → Integrations → Add custom integration. Copy the Admin API key (looks like id:secret).',
    fields: [
      { key: 'site_url', label: 'Site address', type: 'url', placeholder: 'https://yourblog.ghost.io', remember: true },
      { key: 'admin_key', label: 'Admin API key', type: 'secret', placeholder: 'id:secret' },
    ],
  },
  blogger: {
    label: 'Blogger',
    endpoint: '/publish-blogger',
    help: 'Blogger needs a Google token. Open developers.google.com/oauthplayground, choose "Blogger API v3" and tick the blogger scope, press Authorize, then "Exchange authorization code for tokens" and copy the Access token. It lasts about 1 hour, so create it just before publishing.',
    fields: [
      { key: 'blog_url', label: 'Blog address', type: 'url', placeholder: 'https://yourblog.blogspot.com', remember: true },
      { key: 'access_token', label: 'Google access token', type: 'secret', placeholder: 'ya29...' },
    ],
  },
  medium: {
    label: 'Medium',
    endpoint: '/publish-medium',
    help: 'Medium stopped giving out new API tokens in 2025. This works only if you already made an integration token (Medium → Settings → Security and apps). If you have none, publish to another site first, then on Medium use "Import a story" with that post link.',
    fields: [{ key: 'integration_token', label: 'Integration token', type: 'secret', placeholder: 'Paste your old Medium token' }],
  },
  linkedin: {
    label: 'LinkedIn',
    endpoint: '/publish-linkedin',
    liveOnly: true,
    help: 'LinkedIn does not accept full articles through its API, so this shares a short post: your title, the opening of the article, hashtags and a link. You need a LinkedIn developer app with "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect", and a token with the scopes openid, profile and w_member_social (developer portal → your app → Auth → OAuth token tools). Tokens last about 60 days.',
    fields: [
      { key: 'access_token', label: 'Access token', type: 'secret', placeholder: 'Paste your LinkedIn token' },
      { key: 'article_url', label: 'Link to your article (optional)', type: 'url', placeholder: 'https://yourblog.com/your-post', optional: true },
    ],
  },
};

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

export default function PublisherPage() {
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [pack, setPack] = useState(null); // from the Review page
  const [platform, setPlatform] = useState('wordpress');
  const [values, setValues] = useState({}); // { 'wordpress.site_url': '...' }
  const [show, setShow] = useState({});
  const [postStatus, setPostStatus] = useState('draft');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]); // newest first
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const art = getStr('cache_human_blog');
    const h1 = art.split('\n').find((l) => /^#\s+\S/.test(l));
    setTitle(h1 ? h1.replace(/^#\s+/, '').trim() : getStr('blog_topic'));
    setContent(art);
    try {
      const v = JSON.parse(localStorage.getItem('blog_seo_pack'));
      if (v && v.meta_title) setPack(v);
    } catch {}
    setKeywords(getList('blog_keywords'));
    const p = getStr('pub_platform', 'wordpress');
    setPlatform(PLATFORMS[p] ? p : 'wordpress');
    // Load remembered, non-secret fields
    const saved = {};
    Object.entries(PLATFORMS).forEach(([id, c]) =>
      c.fields.filter((f) => f.remember).forEach((f) => {
        saved[`${id}.${f.key}`] = getStr(`pub_${id}_${f.key}`);
      })
    );
    setValues(saved);
    setLoaded(true);
  }, []);

  const cfg = PLATFORMS[platform];
  const val = (k) => values[`${platform}.${k}`] || '';

  const setVal = (f, v) => {
    setValues((s) => ({ ...s, [`${platform}.${f.key}`]: v }));
    if (f.remember) setStr(`pub_${platform}_${f.key}`, v); // secrets are never saved
    setErrors((e) => ({ ...e, [f.key]: '' }));
  };

  const pick = (p) => {
    setPlatform(p);
    setStr('pub_platform', p);
    setErrors({});
  };

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = 'Add a title for the post.';
    cfg.fields.forEach((f) => {
      const v = val(f.key).trim();
      if (!f.optional && !v) e[f.key] = 'This field is required.';
      else if (f.type === 'url' && v && !/^https?:\/\/.+\..+/.test(v)) e[f.key] = 'Enter the full address, like https://yourblog.com';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const addResult = (r) => setResults((list) => [{ ...r, platform: cfg.label, id: Date.now() }, ...list]);

  const publish = async () => {
    if (!validate()) return;
    setLoading(true);
    const live = cfg.liveOnly || postStatus === 'publish';
    const payload = { title: title.trim(), content, status: live ? 'publish' : 'draft' };
    cfg.fields.forEach((f) => { payload[f.key] = val(f.key).trim(); });
    if (['devto', 'medium', 'linkedin'].includes(platform)) payload.tags = keywords;
    if (pack && ['wordpress', 'ghost', 'devto'].includes(platform)) {
      payload.slug = pack.slug;
      payload.excerpt = pack.meta_description; // WordPress
      payload.meta_description = pack.meta_description; // Ghost, Dev.to
    }

    try {
      const { data } = await axios.post(`${API_BASE}${cfg.endpoint}`, payload, { timeout: 60000 });
      if (!data.success) throw new Error(data.error || `${cfg.label} did not accept the post.`);
      addResult({
        ok: true,
        message: live ? (cfg.liveOnly ? 'Shared on LinkedIn.' : 'Published.') : 'Saved as a draft.',
        link: data.link || '',
      });
      // Clear secret fields after a successful send
      setValues((s) => {
        const n = { ...s };
        cfg.fields.filter((f) => f.type === 'secret').forEach((f) => delete n[`${platform}.${f.key}`]);
        return n;
      });
    } catch (e) {
      let message = e.message;
      const d = e.response?.data?.detail;
      if (e.code === 'ECONNABORTED') message = `${cfg.label} took too long to answer. Try again.`;
      else if (e.response?.status === 401 || e.response?.status === 403) message = typeof d === 'string' ? d : `${cfg.label} rejected the login details.`;
      else if (typeof d === 'string') message = d;
      else if (Array.isArray(d)) message = 'Some fields are missing or in the wrong format.';
      else if (!e.response && e.request) message = `Can't reach the server at ${API_BASE}. Check that the backend is running.`;
      addResult({ ok: false, message });
    } finally {
      setLoading(false);
    }
  };

  const input = (bad) =>
    `w-full rounded-xl border bg-panel2 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:outline-none focus:ring-2 ${
      bad ? 'border-red-500/70 focus:ring-red-500/30' : 'border-slate-700/70 focus:border-emerald-500/70 focus:ring-emerald-500/30'
    }`;
  const label = 'mb-1.5 block text-sm font-medium text-slate-200';
  const err = 'mt-1.5 text-xs text-red-400';

  if (!loaded) return null;
  const words = countWords(content);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50 sm:text-3xl">Publish your article</h1>
        <p className="mt-1.5 max-w-xl text-sm text-slate-400">
          Pick a site, enter its details and send. You can publish the same article to as many sites as you like, one after another.
        </p>
      </header>

      {!content.trim() && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          There is no article to publish yet.
          <Link href="/writer" className="flex items-center gap-1.5 font-medium underline">
            <ArrowLeft size={14} /> Write it first
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6 rounded-2xl border border-slate-800 bg-panel p-6 sm:p-8">
          {/* Site tabs */}
          <div role="tablist" aria-label="Where to publish" className="flex flex-wrap gap-2">
            {Object.entries(PLATFORMS).map(([id, p]) => (
              <button
                key={id}
                role="tab"
                aria-selected={platform === id}
                type="button"
                onClick={() => pick(id)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
                  platform === id
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700/70 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="title" className={label}>Post title</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={input(errors.title)} />
            {errors.title && <p className={err}>{errors.title}</p>}
          </div>

          {['wordpress', 'ghost', 'devto'].includes(platform) && (
            <p className="text-xs text-slate-500">
              {pack
                ? `The slug "${pack.slug}" and the meta description from your SEO pack are sent too.`
                : 'Tip: create the SEO pack on the Review page first, and its slug and description are sent along.'}
            </p>
          )}

          {cfg.fields.map((f) => (
            <div key={`${platform}.${f.key}`}>
              <label htmlFor={f.key} className={label}>{f.label}</label>
              <div className="relative">
                <input
                  id={f.key}
                  type={f.type === 'secret' && !show[platform + f.key] ? 'password' : f.type === 'url' ? 'url' : 'text'}
                  value={val(f.key)}
                  onChange={(e) => setVal(f, e.target.value)}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  className={`${input(errors[f.key])} ${f.type === 'secret' ? 'pr-11' : ''}`}
                />
                {f.type === 'secret' && (
                  <button
                    type="button"
                    onClick={() => setShow((s) => ({ ...s, [platform + f.key]: !s[platform + f.key] }))}
                    aria-label={show[platform + f.key] ? 'Hide' : 'Show'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                  >
                    {show[platform + f.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
              {errors[f.key] && <p className={err}>{errors[f.key]}</p>}
            </div>
          ))}

          <p className="rounded-lg bg-slate-800/50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-400">
            {cfg.help} We remember site addresses and usernames, never passwords, tokens or keys.
          </p>

          {cfg.liveOnly ? (
            <p className="rounded-lg bg-slate-800/50 px-3.5 py-2.5 text-xs text-slate-400">LinkedIn posts go live right away. There is no draft option.</p>
          ) : (
          <fieldset>
            <legend className={label}>After sending</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { id: 'draft', title: 'Save as draft', hint: 'Review it on the site first' },
                { id: 'publish', title: 'Publish now', hint: 'Goes live right away' },
              ].map((o) => (
                <label
                  key={o.id}
                  className={`cursor-pointer rounded-xl border p-3.5 transition-colors focus-within:ring-2 focus-within:ring-emerald-400/70 ${
                    postStatus === o.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700/70 hover:border-slate-500'
                  }`}
                >
                  <input type="radio" name="status" value={o.id} checked={postStatus === o.id} onChange={() => setPostStatus(o.id)} className="sr-only" />
                  <span className={`block text-sm font-medium ${postStatus === o.id ? 'text-emerald-300' : 'text-slate-200'}`}>{o.title}</span>
                  <span className="block text-xs text-slate-500">{o.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          )}

          <button
            type="button"
            onClick={publish}
            disabled={loading || !content.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
          >
            <Send size={15} />
            {loading ? 'Sending…' : cfg.liveOnly ? `Share on ${cfg.label}` : postStatus === 'publish' ? `Publish to ${cfg.label}` : `Send to ${cfg.label} as draft`}
          </button>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {results.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-panel p-5">
              <h2 className="text-sm font-semibold text-slate-100">Sent so far</h2>
              <ul className="mt-3 space-y-2.5">
                {results.map((r) => (
                  <li
                    key={r.id}
                    className={`rounded-lg border px-3 py-2.5 text-xs ${
                      r.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-red-500/30 bg-red-500/10 text-red-300'
                    }`}
                  >
                    <p className="flex items-center gap-1.5 font-medium">
                      {r.ok ? <Check size={13} /> : <X size={13} />} {r.platform}
                    </p>
                    <p className="mt-0.5 leading-snug">{r.message}</p>
                    {r.ok && r.link && (
                      <a href={r.link} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 underline">
                        Open <ExternalLink size={11} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-panel p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Article preview</h2>
              <span className="text-xs text-slate-500">{words} words</span>
            </div>
            <p dir="auto" className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-slate-400">
              {content.trim() || 'Nothing here yet.'}
            </p>
            <Link href="/writer" className="mt-4 inline-block text-xs text-slate-500 underline hover:text-slate-300">
              Edit in writer
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}