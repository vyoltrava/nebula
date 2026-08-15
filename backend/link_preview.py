from fastapi import APIRouter, HTTPException
import requests
from bs4 import BeautifulSoup
import time
import ipaddress
from urllib.parse import urlparse

router = APIRouter()

_cache = {}
_CACHE_TTL = 3600      # час храним превью
_CACHE_MAX = 300

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
}

def _is_safe_url(url: str) -> bool:
    """Защита от SSRF: только http(s), без внутренних адресов"""
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https"):
            return False
        host = p.hostname
        if not host or host == "localhost" or host.endswith(".local"):
            return False
        try:
            ip = ipaddress.ip_address(host)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        except ValueError:
            pass  # это доменное имя — ок
        return True
    except Exception:
        return False

@router.get("/link-preview")
def link_preview(url: str):
    url = url.strip()
    if not _is_safe_url(url):
        raise HTTPException(400, "Bad url")

    # Кэш
    now = time.time()
    hit = _cache.get(url)
    if hit and now - hit[0] < _CACHE_TTL:
        return hit[1]

    data = {
        "url": url, "title": None, "description": None,
        "image": None, "site_name": None, "favicon": None,
    }
    netloc = urlparse(url).netloc
    try:
        r = requests.get(url, headers=HEADERS, timeout=6, allow_redirects=True)
        r.raise_for_status()
        ct = r.headers.get("content-type", "")
        if "text/html" in ct or "application/xhtml" in ct:
            soup = BeautifulSoup(r.text, "html.parser")

            def og(prop):
                tag = soup.find("meta", property=f"og:{prop}") \
                      or soup.find("meta", attrs={"name": f"og:{prop}"})
                return tag.get("content") if tag and tag.get("content") else None

            data["title"] = og("title") or (soup.title.get_text(strip=True) if soup.title else None)
            desc = og("description")
            if not desc:
                m = soup.find("meta", attrs={"name": "description"})
                desc = m.get("content") if m and m.get("content") else None
            data["description"] = desc[:300] if desc else None
            if data["title"]:
                data["title"] = data["title"][:200]
            data["image"] = og("image")
            data["site_name"] = og("site_name") or netloc
            # относительный путь картинки → абсолютный
            if data["image"] and data["image"].startswith("/"):
                data["image"] = f"{urlparse(url).scheme}://{netloc}{data['image']}"
        else:
            data["site_name"] = netloc
    except Exception:
        # Сайт недоступен/блокирует — показываем минимальную карточку
        data["site_name"] = netloc

    data["favicon"] = f"https://www.google.com/s2/favicons?domain={netloc}&sz=64"

    if len(_cache) > _CACHE_MAX:
        _cache.clear()
    _cache[url] = (now, data)
    return data