from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import seo_tools

router = APIRouter()


class ResearchRequest(BaseModel):
    topic: str
    keywords: list[str] = []
    language: str = "English"


class SeoPackRequest(BaseModel):
    article: str
    topic: str
    keywords: list[str] = []
    author: str = ""
    language: str = "English"
    url: str = ""


class ClusterRequest(BaseModel):
    topic: str
    keywords: list[str] = []
    language: str = "English"
    count: int = Field(8, ge=3, le=12)


@router.post("/research")
def research(d: ResearchRequest):
    try:
        return {"success": True, **seo_tools.research(d.topic, d.keywords, d.language)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/seo-pack")
def seo_pack(d: SeoPackRequest):
    if not d.article.strip():
        raise HTTPException(status_code=422, detail="There is no article text to analyse.")
    try:
        return {"success": True, **seo_tools.seo_pack(d.article, d.topic, d.keywords, d.author, d.language, d.url)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cluster-plan")
def cluster_plan(d: ClusterRequest):
    try:
        return {"success": True, **seo_tools.cluster_plan(d.topic, d.keywords, d.language, d.count)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))