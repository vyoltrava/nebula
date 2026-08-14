import re
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

router = APIRouter(tags=["link-preview"])

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

PRIVATE_RE = re.compile(r"^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0|172\.(1[6-9]|2\d|3[01])\.)")

_cache = {}


def _meta(soup, names):
    for n in names:
        tag = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n})
        if tag and tag.get("content"):
            return tag["content"].strip()
    return None


@router.get("/unfurl")
async def unfurl(url: str = Query(max_length=2048)):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc:
        raise HTTPException(400, "bad url")
    if PRIVATE_RE.match(p.netloc.split(":")[0]):
        raise HTTPException(400, "bad url")

    if url in _cache:
        return JSONResponse(_cache[url], headers={"Cache-Control": "public, max-age=3600"})

    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True,
                                     headers={"User-Agent": UA}) as client:
            r = await client.get(url)
            r.raise_for_status()
    except Exception:
        raise HTTPException(502, "fetch failed")

    soup = BeautifulSoup(r.text[:500_000], "html.parser")

    title = _meta(soup, ["og:title", "twitter:title"]) \
        or (soup.title.get_text().strip() if soup.title else "") or p.netloc
    desc = _meta(soup, ["og:description", "twitter:description", "description"]) or ""
    image = _meta(soup, ["og:image", "twitter:image"])

    data = {
        "url": url,
        "site": (_meta(soup, ["og:site_name"]) or p.netloc.replace("www.", "", 1))[:80],
        "title": title[:200],
        "description": desc[:300],
        "image": urljoin(url, image) if image else None,
    }
    if len(_cache) > 500:
        _cache.clear()
    _cache[url] = data
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=3600"})