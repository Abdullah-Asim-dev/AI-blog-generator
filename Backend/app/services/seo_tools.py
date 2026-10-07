import json
import re
from datetime import date

from app.services.humanizer import call_openrouter_full

LANGS = {
    "English": ("English", "en"),
    "اردو": ("Urdu (in Urdu script)", "ur"),
    "Roman Urdu": ("Roman Urdu (Urdu written with English letters)", "ur-Latn"),
}


def _lang(language: str):
    return LANGS.get(language, (language, "en"))


def _plain(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_`>#]+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _clip(text: str, n: int) -> str:
    text = text.strip().strip('"')
    if len(text) <= n:
        return text
    cut = text[:n]
    if " " in cut and cut.rfind(" ") > n * 0.6:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,;:-–—")


def slugify(text: str) -> str:
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:70]


def _first_h1(article: str) -> str:
    for line in article.splitlines():
        m = re.match(r"^#\s+(.+)$", line)
        if m:
            return _plain(m.group(1))
    return ""


def parse_sections(text: str) -> dict:
    out, current = {}, None
    for line in text.splitlines():
        m = re.match(r"^\s*#{1,3}\s*(.+?)\s*$", line)
        if m:
            current = re.sub(r"[^A-Za-z ]", "", m.group(1)).strip().upper()
            out[current] = []
            continue
        b = re.match(r"^\s*(?:[-*•]|\d+[.)])\s+(.+)$", line)
        if b and current is not None:
            out[current].append(b.group(1).strip())
    return out


# ---------------- research ----------------
def research(topic: str, keywords: list, language: str = "English") -> dict:
    lang_name, _ = _lang(language)
    kw = ", ".join(keywords) if keywords else "none"
    head = f"""You are an SEO researcher.
Topic: {topic}
Known keywords: {kw}
Audience language: {lang_name}

Reply in exactly this format, with these headings and bullet lists, and nothing else:

## FACTS
- one verifiable fact or statistic, with the source site in square brackets, for example: - 63% of ... [example.com]  (maximum 8)

## QUESTIONS
- real questions people ask about this topic, like Google's People Also Ask  (maximum 8)

## RELATED KEYWORDS
- related search phrases  (maximum 10)

## COMMON SECTIONS
- topics that the top-ranking articles cover  (maximum 8)

## GAPS
- useful things most top articles miss  (maximum 5)

Write QUESTIONS and RELATED KEYWORDS in {lang_name}."""
    live_prompt = head + "\n\nSearch the web first. Never invent a statistic or a source. If you cannot find a fact, leave it out."
    off_prompt = head + "\n\nYou cannot browse the web now. Leave the FACTS section empty and fill the others from your general knowledge."

    warning, live = "", True
    try:
        r = call_openrouter_full(live_prompt, 3000, web=True)
        if not r["sources"]:
            warning = "No live web sources came back, so check every fact before you publish."
    except Exception as e:
        live = False
        r = call_openrouter_full(off_prompt, 2500, web=False)  # if this fails too, the error goes up
        warning = (f"Live web search was not available ({str(e)[:110]}). The questions and keywords come from the "
                   "model's own knowledge, and no facts were collected, so the article will avoid statistics.")

    sec = parse_sections(r["text"])
    return {
        "facts": sec.get("FACTS", [])[:8] if live else [],
        "questions": sec.get("QUESTIONS", [])[:8],
        "keywords": sec.get("RELATED KEYWORDS", [])[:10],
        "sections": sec.get("COMMON SECTIONS", [])[:8],
        "gaps": sec.get("GAPS", [])[:5],
        "sources": r["sources"][:10],
        "live": live and bool(r["sources"]),
        "warning": warning,
    }


# ---------------- SEO pack ----------------
def extract_faq(article: str) -> list:
    lines = article.splitlines()
    faqs, i = [], 0
    qpat = re.compile(r"^#{3}\s+(.+?[?؟][*_\s]*)$")
    while i < len(lines):
        m = qpat.match(lines[i])
        if not m:
            i += 1
            continue
        q = _plain(m.group(1))
        j, buf = i + 1, []
        while j < len(lines) and not re.match(r"^#{1,6}\s", lines[j]):
            buf.append(lines[j])
            j += 1
        a = _plain(" ".join(s.strip() for s in buf if s.strip()))
        if a:
            faqs.append({"question": q, "answer": a})
        i = j
    return faqs[:8]


def seo_pack(article: str, topic: str, keywords: list, author: str = "", language: str = "English", url: str = "") -> dict:
    lang_name, lang_code = _lang(language)
    main_kw = keywords[0] if keywords else topic
    prompt = f"""Create search metadata for the article below. Reply with exactly these five lines and nothing else:
TITLE: <meta title, at most 60 characters, includes the main keyword, written in {lang_name}>
DESCRIPTION: <meta description, 140 to 155 characters, a clear benefit and a reason to click, written in {lang_name}>
SLUG: <short URL slug in lowercase English letters and hyphens, 3 to 6 words>
IMAGE_ALT: <alt text for a featured image, at most 120 characters, written in {lang_name}>
IMAGE_PROMPT: <one sentence in English describing a good featured image>

Main keyword: {main_kw}
Topic: {topic}

Article:
{article[:6000]}"""
    raw = call_openrouter_full(prompt, 600)["text"]
    f = {k.upper(): v.strip() for k, v in re.findall(r"^\s*([A-Za-z_]+)\s*:\s*(.+?)\s*$", raw, flags=re.M)}

    title = _clip(f.get("TITLE") or _first_h1(article) or topic, 60)
    desc = _clip(f.get("DESCRIPTION", ""), 155)
    slug = slugify(f.get("SLUG", "")) or slugify(main_kw) or slugify(topic) or "post"
    faqs = extract_faq(article)

    today = date.today().isoformat()
    art = {
        "@type": "Article",
        "headline": title,
        "description": desc,
        "inLanguage": lang_code,
        "datePublished": today,
        "dateModified": today,
        "keywords": ", ".join(keywords),
    }
    if author.strip():
        art["author"] = {"@type": "Person", "name": author.strip()}
    if url.strip():
        art["mainEntityOfPage"] = url.strip()
    graph = [art]
    if faqs:
        graph.append({
            "@type": "FAQPage",
            "mainEntity": [
                {"@type": "Question", "name": x["question"], "acceptedAnswer": {"@type": "Answer", "text": x["answer"]}}
                for x in faqs
            ],
        })
    jsonld = {"@context": "https://schema.org", "@graph": graph}
    return {
        "meta_title": title,
        "meta_description": desc,
        "slug": slug,
        "image_alt": _clip(f.get("IMAGE_ALT", ""), 120),
        "image_prompt": f.get("IMAGE_PROMPT", ""),
        "faq": faqs,
        "schema_json": json.dumps(jsonld, ensure_ascii=False, indent=2),
    }


# ---------------- topic cluster ----------------
def cluster_plan(topic: str, keywords: list, language: str = "English", count: int = 8) -> dict:
    lang_name, _ = _lang(language)
    prompt = f"""You are an SEO content strategist. Plan a topic cluster for the main topic below.
Reply in exactly this format and nothing else:
PILLAR: <pillar article title> | <primary keyword>
1. <supporting article title> | <target keyword> | <intent>
(continue the numbered list until you have {count} lines)

Intent must be one of: informational, commercial, transactional.
Each supporting article must target a different keyword and answer a different question.
Write titles and keywords in {lang_name}.
Main topic: {topic}
Known keywords: {', '.join(keywords) if keywords else 'none'}"""
    text = call_openrouter_full(prompt, 1500)["text"]

    pillar = {"title": topic, "keyword": keywords[0] if keywords else topic}
    m = re.search(r"^\s*PILLAR\s*:\s*(.+?)\s*\|\s*(.+?)\s*$", text, flags=re.M | re.I)
    if m:
        pillar = {"title": _plain(m.group(1)), "keyword": _plain(m.group(2))}

    ideas = []
    for line in text.splitlines():
        m = re.match(r"^\s*\d+[.)]\s*(.+?)\s*\|\s*(.+?)\s*(?:\|\s*(.+?))?\s*$", line)
        if m:
            ideas.append({
                "title": _plain(m.group(1)),
                "keyword": _plain(m.group(2)),
                "intent": (m.group(3) or "informational").strip().lower(),
            })
    if not ideas:
        raise Exception("The planner returned an unexpected format. Please try again.")
    return {"pillar": pillar, "ideas": ideas[:12]}