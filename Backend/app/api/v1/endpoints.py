import base64
from typing import Literal

import markdown
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.v1.publishers import router as publishers_router, strip_title
from app.api.v1.seo import router as seo_router
from app.services.humanizer import generate_raw_blog, humanize_ai_text

router = APIRouter()
router.include_router(publishers_router)  # adds Dev.to, Hashnode, Ghost, Blogger, Medium, LinkedIn
router.include_router(seo_router)  # adds /research, /seo-pack, /cluster-plan


class BlogInput(BaseModel):
    topic: str
    keywords: list[str] = []
    audience: str = "general"
    article_type: str = "How-to guide"
    tone: str = "Friendly"
    language: str = "English"
    word_count: int = Field(1200, ge=200, le=4000)
    research: str = ""          # facts and sources from /research
    author: str = ""
    internal_links: list[str] = []  # "Title - https://..." lines


class CMSPublishRequest(BaseModel):
    site_url: str
    username: str
    app_password: str
    title: str
    content: str
    status: Literal["draft", "publish"] = "draft"
    slug: str = ""
    excerpt: str = ""


AUDIENCES = {
    "general": "a general reader; use simple, clear language",
    "tech-savvy": "a tech-savvy reader; include technical depth and concrete examples",
    "business-executive": "a busy business executive; be concise and focus on results and ROI",
}
LANGUAGES = {
    "English": "English",
    "اردو": "Urdu, written in Urdu script",
    "Roman Urdu": "Roman Urdu (Urdu written with English letters)",
}


def build_brief(d: BlogInput) -> str:
    lines = [
        d.topic.strip(),
        "",
        "Writing requirements:",
        f"- Article type: {d.article_type}",
        f"- Audience: {AUDIENCES.get(d.audience, d.audience)}",
        f"- Tone: {d.tone}",
        f"- Language: {LANGUAGES.get(d.language, d.language)}",
        f"- Length: about {d.word_count} words",
        "- Format: Markdown, with a clear title and ## headings for each section",
    ]
    if d.keywords:
        lines.append(f"- Main keyword: {d.keywords[0]} (use it in the first paragraph and in a heading)")
    return "\n".join(lines)


@router.post("/generate")
def create_blog(data: BlogInput):
    try:
        raw_draft = generate_raw_blog(
            build_brief(data), data.keywords, data.word_count,
            data.research, data.author, data.internal_links,
        )
        humanized_result = humanize_ai_text(raw_draft)
        return {
            "success": True,
            "original_ai_draft": raw_draft,
            "final_humanized_blog": humanized_result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/publish-wordpress")
def send_to_wordpress(data: CMSPublishRequest):
    api_url = f"{data.site_url.strip().rstrip('/')}/wp-json/wp/v2/posts"
    token = base64.b64encode(f"{data.username}:{data.app_password}".encode()).decode()
    headers = {"Authorization": f"Basic {token}", "Content-Type": "application/json"}

    payload = {
        "title": data.title,
        "content": markdown.markdown(strip_title(data.content), extensions=["extra", "sane_lists"]),
        "status": data.status,
    }
    if data.slug.strip():
        payload["slug"] = data.slug.strip()
    if data.excerpt.strip():
        payload["excerpt"] = data.excerpt.strip()

    try:
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Could not reach the WordPress site: {e}")

    if response.status_code in (200, 201):
        return {"success": True, "link": response.json().get("link", "")}

    try:
        wp_message = response.json().get("message", response.text[:300])
    except ValueError:
        wp_message = response.text[:300]
    raise HTTPException(status_code=response.status_code, detail=f"WordPress said: {wp_message}")