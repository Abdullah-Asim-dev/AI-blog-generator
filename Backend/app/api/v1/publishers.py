import base64
import hashlib
import hmac
import json
import os
import re
import time
from typing import Literal

import markdown
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

Status = Literal["draft", "publish"]


# ---------- helpers ----------
def strip_title(content: str) -> str:
    """The article starts with '# Title'. Every site already shows the post title, so drop that line."""
    lines = content.lstrip().split("\n")
    if lines and re.match(r"^#\s+\S", lines[0]):
        return "\n".join(lines[1:]).lstrip()
    return content


def _message(r) -> str:
    try:
        j = r.json()
    except ValueError:
        return r.text[:300]
    if isinstance(j, dict):
        if isinstance(j.get("errors"), list) and j["errors"]:
            e = j["errors"][0]
            return e.get("message", str(e)) if isinstance(e, dict) else str(e)
        return str(j.get("error") or j.get("message") or j)[:300]
    return str(j)[:300]


def _post(who: str, url: str, **kwargs):
    try:
        return requests.post(url, timeout=30, **kwargs)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Could not reach {who}: {e}")


def _fail(who: str, r):
    raise HTTPException(status_code=r.status_code, detail=f"{who} said: {_message(r)}")


# ---------- Dev.to ----------
class DevtoRequest(BaseModel):
    api_key: str
    title: str
    content: str
    status: Status = "draft"
    tags: list[str] = []
    meta_description: str = ""


@router.post("/publish-devto")
def publish_devto(d: DevtoRequest):
    article = {
        "title": d.title,
        "body_markdown": strip_title(d.content),
        "published": d.status == "publish",
    }
    if d.meta_description.strip():
        article["description"] = d.meta_description.strip()[:160]
    tags = [re.sub(r"[^a-z0-9]", "", t.lower())[:30] for t in d.tags]
    tags = [t for t in tags if t][:4]  # Dev.to allows 4 tags, letters and numbers only
    if tags:
        article["tags"] = tags

    r = _post(
        "Dev.to",
        "https://dev.to/api/articles",
        headers={"api-key": d.api_key.strip(), "Content-Type": "application/json"},
        json={"article": article},
    )
    if r.status_code in (200, 201):
        return {"success": True, "link": r.json().get("url", "")}
    _fail("Dev.to", r)


# ---------- Hashnode ----------
class HashnodeRequest(BaseModel):
    token: str
    title: str
    content: str
    status: Status = "draft"
    publication_id: str = ""


HASHNODE_URL = "https://gql.hashnode.com"


def _gql(token: str, query: str, variables: dict | None = None) -> dict:
    r = _post(
        "Hashnode",
        HASHNODE_URL,
        headers={"Authorization": token.strip(), "Content-Type": "application/json"},
        json={"query": query, "variables": variables or {}},
    )
    if r.status_code != 200:
        _fail("Hashnode", r)
    data = r.json()
    if data.get("errors"):
        msg = data["errors"][0].get("message", "unknown error")
        code = 401 if "auth" in msg.lower() or "token" in msg.lower() else 400
        raise HTTPException(status_code=code, detail=f"Hashnode said: {msg}")
    return data["data"]


@router.post("/publish-hashnode")
def publish_hashnode(d: HashnodeRequest):
    pub_id = d.publication_id.strip()
    if not pub_id:  # find the user's first blog automatically
        data = _gql(d.token, "query { me { publications(first: 5) { edges { node { id title } } } } }")
        edges = data["me"]["publications"]["edges"]
        if not edges:
            raise HTTPException(status_code=400, detail="Hashnode said: this account has no blog yet. Create one on hashnode.com first.")
        pub_id = edges[0]["node"]["id"]

    inp = {"title": d.title, "contentMarkdown": strip_title(d.content), "publicationId": pub_id}
    if d.status == "publish":
        data = _gql(
            d.token,
            "mutation($input: PublishPostInput!) { publishPost(input: $input) { post { id url } } }",
            {"input": inp},
        )
        return {"success": True, "link": data["publishPost"]["post"]["url"]}

    _gql(
        d.token,
        "mutation($input: CreateDraftInput!) { createDraft(input: $input) { draft { id } } }",
        {"input": inp},
    )
    return {"success": True, "link": "https://hashnode.com/drafts"}


# ---------- Ghost ----------
class GhostRequest(BaseModel):
    site_url: str
    admin_key: str  # looks like  id:secret
    title: str
    content: str
    status: Status = "draft"
    slug: str = ""
    meta_description: str = ""


def _b64(raw: bytes) -> bytes:
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def _ghost_token(admin_key: str) -> str:
    try:
        key_id, secret = admin_key.strip().split(":")
        secret_bytes = bytes.fromhex(secret)
    except ValueError:
        raise HTTPException(status_code=422, detail="The Ghost Admin API key must look like  id:secret  (copy it exactly).")
    now = int(time.time())
    head = _b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": key_id}, separators=(",", ":")).encode())
    body = _b64(json.dumps({"iat": now, "exp": now + 300, "aud": "/admin/"}, separators=(",", ":")).encode())
    signing = head + b"." + body
    sig = _b64(hmac.new(secret_bytes, signing, hashlib.sha256).digest())
    return (signing + b"." + sig).decode()


@router.post("/publish-ghost")
def publish_ghost(d: GhostRequest):
    url = f"{d.site_url.strip().rstrip('/')}/ghost/api/admin/posts/?source=html"
    headers = {
        "Authorization": f"Ghost {_ghost_token(d.admin_key)}",
        "Accept-Version": "v5.0",
        "Content-Type": "application/json",
    }
    html = markdown.markdown(strip_title(d.content), extensions=["extra", "sane_lists"])
    post = {"title": d.title, "html": html, "status": "published" if d.status == "publish" else "draft"}
    if d.slug.strip():
        post["slug"] = d.slug.strip()
    if d.meta_description.strip():
        post["meta_description"] = d.meta_description.strip()
        post["custom_excerpt"] = d.meta_description.strip()[:300]
    payload = {"posts": [post]}

    r = _post("Ghost", url, headers=headers, json=payload)
    if r.status_code in (200, 201):
        return {"success": True, "link": r.json()["posts"][0].get("url", "")}
    _fail("Ghost", r)


# ---------- Blogger ----------
class BloggerRequest(BaseModel):
    access_token: str  # Google OAuth token (from the OAuth Playground), valid about 1 hour
    blog_url: str      # e.g. https://myblog.blogspot.com
    title: str
    content: str
    status: Status = "draft"


@router.post("/publish-blogger")
def publish_blogger(d: BloggerRequest):
    auth = {"Authorization": f"Bearer {d.access_token.strip()}"}
    try:
        look = requests.get(
            "https://www.googleapis.com/blogger/v3/blogs/byurl",
            params={"url": d.blog_url.strip()}, headers=auth, timeout=30,
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Blogger: {e}")
    if look.status_code == 401:
        raise HTTPException(status_code=401, detail="Blogger said: the Google token is invalid or expired. These tokens last about 1 hour, so create a fresh one in the OAuth Playground.")
    if look.status_code != 200:
        _fail("Blogger", look)
    blog_id = look.json()["id"]

    html = markdown.markdown(strip_title(d.content), extensions=["extra", "sane_lists"])
    r = _post(
        "Blogger",
        f"https://www.googleapis.com/blogger/v3/blogs/{blog_id}/posts",
        params={"isDraft": "true" if d.status == "draft" else "false"},
        headers={**auth, "Content-Type": "application/json"},
        json={"kind": "blogger#post", "title": d.title, "content": html},
    )
    if r.status_code in (200, 201):
        return {"success": True, "link": r.json().get("url") or f"https://www.blogger.com/blog/posts/{blog_id}"}
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="Blogger said: the Google token expired. Create a fresh one in the OAuth Playground.")
    _fail("Blogger", r)


# ---------- Medium (only works with a token created before 2025) ----------
class MediumRequest(BaseModel):
    integration_token: str
    title: str
    content: str
    status: Status = "draft"
    tags: list[str] = []


@router.post("/publish-medium")
def publish_medium(d: MediumRequest):
    auth = {"Authorization": f"Bearer {d.integration_token.strip()}", "Accept": "application/json"}
    try:
        me = requests.get("https://api.medium.com/v1/me", headers=auth, timeout=30)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Medium: {e}")
    if me.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Medium said: this token is not accepted. Medium no longer issues new tokens, so only tokens made before 2025 still work.")
    if me.status_code != 200:
        _fail("Medium", me)
    user_id = me.json()["data"]["id"]

    body = {
        "title": d.title,
        "contentFormat": "markdown",
        "content": strip_title(d.content),
        "publishStatus": "public" if d.status == "publish" else "draft",
    }
    tags = [t.strip()[:25] for t in d.tags if t.strip()][:3]  # Medium allows 3 tags
    if tags:
        body["tags"] = tags

    r = _post("Medium", f"https://api.medium.com/v1/users/{user_id}/posts", headers={**auth, "Content-Type": "application/json"}, json=body)
    if r.status_code in (200, 201):
        return {"success": True, "link": r.json()["data"].get("url", "")}
    _fail("Medium", r)


# ---------- LinkedIn (a short post that links to your article) ----------
LINKEDIN_VERSION = os.getenv("LINKEDIN_VERSION", "202608")  # YYYYMM, LinkedIn retires old versions


class LinkedInRequest(BaseModel):
    access_token: str
    title: str
    content: str
    article_url: str = ""
    tags: list[str] = []
    status: Status = "publish"  # LinkedIn posts always go live


def _li_escape(text: str) -> str:
    # LinkedIn's post text treats these characters as markup and can cut the post off at them
    return re.sub(r"([\\|{}@\[\]()<>#*_~])", r"\\\1", text)


def _excerpt(md: str, limit: int = 450) -> str:
    text = re.sub(r"^#{1,6}\s+.*$", "", md, flags=re.M)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_`>]+", "", text)
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    out = paras[0] if paras else ""
    if len(out) > limit:
        cut = out[:limit]
        end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
        out = cut[: end + 1] if end > 80 else cut.rsplit(" ", 1)[0] + "…"
    return out


@router.post("/publish-linkedin")
def publish_linkedin(d: LinkedInRequest):
    auth = {"Authorization": f"Bearer {d.access_token.strip()}"}
    try:
        me = requests.get("https://api.linkedin.com/v2/userinfo", headers=auth, timeout=30)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Could not reach LinkedIn: {e}")
    if me.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="LinkedIn said: the token is invalid, expired, or missing the 'openid profile' scope. Create a new one with openid, profile and w_member_social.")
    if me.status_code != 200:
        _fail("LinkedIn", me)
    author = f"urn:li:person:{me.json()['sub']}"

    excerpt = _excerpt(strip_title(d.content))
    hashtags = []
    for k in d.tags:
        tag = re.sub(r"[^A-Za-z0-9]", "", k.title())
        if tag:
            hashtags.append("#" + tag)
    parts = [d.title.strip(), excerpt, " ".join(hashtags[:3])]
    commentary = _li_escape("\n\n".join(p for p in parts if p))[:2900]

    post = {
        "author": author,
        "commentary": commentary,
        "visibility": "PUBLIC",
        "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if d.article_url.strip():
        post["content"] = {"article": {"source": d.article_url.strip(), "title": d.title[:200], "description": excerpt[:200]}}

    r = _post(
        "LinkedIn",
        "https://api.linkedin.com/rest/posts",
        headers={**auth, "LinkedIn-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json"},
        json=post,
    )
    if r.status_code in (200, 201):
        urn = r.headers.get("x-restli-id", "")
        return {"success": True, "link": f"https://www.linkedin.com/feed/update/{urn}/" if urn else ""}
    if r.status_code in (400, 426) and "version" in r.text.lower():
        raise HTTPException(status_code=r.status_code, detail=f"LinkedIn said the API version {LINKEDIN_VERSION} is not accepted. Add LINKEDIN_VERSION=<newer YYYYMM> to Backend/.env and restart.")
    _fail("LinkedIn", r)