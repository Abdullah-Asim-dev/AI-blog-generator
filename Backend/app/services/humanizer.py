import requests
from app.config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _words(text: str) -> int:
    return len(text.split())


def call_openrouter_full(prompt: str, max_tokens: int = 4000, web: bool = False) -> dict:
    """One OpenRouter call. Returns {"text": ..., "sources": [{"title", "url"}]}.
    With web=True the model can search the web, and the pages it used come back as sources."""
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Blog Generator",
    }
    data = {
        "model": settings.MODEL_NAME,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if web:
        data["plugins"] = [{"id": "web", "max_results": 6}]

    try:
        response = requests.post(OPENROUTER_URL, headers=headers, json=data, timeout=150 if web else 120)
    except requests.RequestException as e:
        raise Exception(f"Could not reach OpenRouter: {e}")

    try:
        result = response.json()
    except ValueError:
        raise Exception(f"OpenRouter sent a non-JSON reply (HTTP {response.status_code}): {response.text[:200]!r}")

    if response.status_code != 200:
        raise Exception(f"OpenRouter error {response.status_code} (model: {settings.MODEL_NAME}): {result}")

    try:
        message = result["choices"][0]["message"]
        text = message.get("content")
    except (KeyError, IndexError, TypeError, AttributeError):
        raise Exception(f"Unexpected OpenRouter reply: {str(result)[:200]}")

    if not text or not text.strip():
        raise Exception("OpenRouter returned an empty answer. Try again or change the model.")

    sources, seen = [], set()
    for a in message.get("annotations") or []:
        info = a.get("url_citation") if isinstance(a, dict) else None
        url = (info or {}).get("url")
        if url and url not in seen:
            seen.add(url)
            sources.append({"title": (info.get("title") or url).strip(), "url": url})
    return {"text": text.strip(), "sources": sources}


def call_openrouter(prompt: str, max_tokens: int = 4000) -> str:
    return call_openrouter_full(prompt, max_tokens)["text"]


STRUCTURE_RULES = """Structure rules (important for search engines and AI answer engines):
1. Right after the # title, start with a direct answer to the main question in 2-3 sentences. No introduction before it.
2. Use question-style ## headings where they fit naturally (for example "What is ...?").
3. Include one Markdown table or a bullet list that summarises or compares key points, if it fits the topic.
4. For any fact taken from the research notes, name the source inline, for example (Source: example.com).
5. Finish with a "Frequently Asked Questions" section (## heading, translated into the article language): 4 or 5 questions
   as ### headings that end with a question mark, each followed by a 2-3 sentence answer.
6. If research notes were used, add a final "## Sources" section that lists the URLs you used as a Markdown list."""


def generate_raw_blog(topic: str, keywords: list, word_count: int = 1200,
                      research: str = "", author: str = "", internal_links: list | None = None) -> str:
    """Phase 1: AI draft. `topic` already carries tone, language and audience from endpoints.py.
    Models usually write less than asked, so we ask for ~20% extra and, if the draft is still
    too short, make up to 2 'expand' passes."""
    keywords_str = ", ".join(keywords) if keywords else "none"
    ask = int(word_count * 1.2)
    max_tokens = min(12000, word_count * 4 + 800)

    if research.strip():
        research_block = f"\nResearch notes (the ONLY source of facts, numbers and names you may use):\n{research.strip()}\n"
    else:
        research_block = ("\nNo research notes were provided: do NOT invent statistics, studies, quotes or numbers. "
                          "Keep claims general and honest.\n")
    links = [l.strip() for l in (internal_links or []) if l.strip()][:15]
    links_block = ""
    if links:
        links_block = ("\nOur other posts. Link to up to 3 relevant ones naturally with Markdown links, "
                       "and use only these URLs:\n" + "\n".join(f"- {l}" for l in links) + "\n")

    prompt = f"""Write a comprehensive SEO blog post using this brief:

{topic}

Target keywords: {keywords_str}
{research_block}{links_block}
Rules:
- Follow the writing requirements in the brief exactly (language, tone, audience, type).
- LENGTH IS IMPORTANT: write at least {ask} words. Cover every section in depth with explanations,
  concrete examples and practical steps. Do not stop early or summarise.
- Output only the article in Markdown: one # title, then ## headings for each section.
- Use the main keyword naturally in the first paragraph and in at least one heading. Never stuff keywords.
- Do not add notes or comments outside the article.

{STRUCTURE_RULES}"""
    text = call_openrouter(prompt, max_tokens)

    for _ in range(2):
        if _words(text) >= word_count * 0.9:
            break
        expand = f"""The article below is about {_words(text)} words. Expand it to at least {ask} words.
Add depth to the existing sections: more explanation, real-world examples and practical steps.
Keep the same language, tone, facts and Markdown headings (# and ##). Keep the direct answer at the top,
the FAQ section and the Sources section. Do NOT add new statistics or sources.
Output the full expanded article only, with no notes.

Article:
{text}"""
        text = call_openrouter(expand, max_tokens)
    return text


def humanize_ai_text(ai_text: str) -> str:
    """Phase 2: make the draft read more naturally."""
    target = _words(ai_text)
    humanize_prompt = f"""You are an expert human editor. Rewrite the following AI-generated blog post.
Make the final output a 50/50 mix of structured points and natural, conversational human flow.

Rules:
1. Completely remove robotic AI catchphrases (e.g., 'Furthermore', 'In conclusion', 'Delve into', 'In today's fast-paced world', 'Testament to').
2. Break long paragraphs into short, punchy sentences.
3. Use active voice and an engaging, personal tone (like a human expert writing to a friend).
4. Add 2-3 natural rhetorical questions (not inside the FAQ answers).
5. Keep the SAME language as the original (do not translate), the same Markdown headings (# and ##) and the same facts.
6. Do NOT change tables, URLs, numbers, Markdown links, the ### FAQ question headings, or the Sources section.
7. Keep the direct answer at the top.
8. Do NOT shorten it: the result must be at least {target} words.
9. Output only the rewritten article, with no notes.

Original AI Text:
{ai_text}
"""
    try:
        result = call_openrouter(humanize_prompt, min(12000, target * 4 + 800))
    except Exception:
        return ai_text
    return result if _words(result) >= target * 0.85 else ai_text