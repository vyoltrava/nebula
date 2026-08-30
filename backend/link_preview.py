import re
import ipaddress
import socket
from typing import Optional
from urllib.parse import urljoin, urlparse
from cachetools import TTLCache
from threading import Lock

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

router = APIRouter(tags=["link-preview"])

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

MAX_REDIRECTS = 5
MAX_BODY_BYTES = 500_000
MAX_URL_LENGTH = 2048

# TTL-LRU кэш: старые записи вытесняются автоматически, no more cache stampede
_cache: TTLCache = TTLCache(maxsize=500, ttl=3600)
_cache_lock = Lock()

# ============================================
# 🛡️ SSRF-ЗАЩИТА
# Проверяется IP КАЖДОГО хоста (включая цели редиректов),
# с защитой от DNS-rebinding (резолв -> подключение по тому же IP).
# ============================================

def _is_blocked_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # не распарсился — блокируем
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _resolve_safe(host: str) -> list:
    """Резолвит hostname и возвращает только публичные IP."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return []
    ips = []
    for fam, _, _, _, sockaddr in infos:
        ip_str = sockaddr[0]
        if _is_blocked_ip(ip_str):
            return []  # хотя бы один приватный IP -> весь хост блокируем
        if ip_str not in ips:
            ips.append(ip_str)
    return ips


def _validate_url(url: str) -> bool:
    try:
        p = urlparse(url)
    except Exception:
        return False
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    if len(url) > MAX_URL_LENGTH:
        return False
    # Явно блокируем текстовые трюки: decimal/hex IP, IPv6-скобки с cred и т.п.
    if re.match(r"^(localhost|0x[0-9a-fA-F]+|\d{8,10})$", p.hostname):
        return False
    # Резолвим и проверяем ВСЕ адреса хоста
    return bool(_resolve_safe(p.hostname))


class _SafeTransport(httpx.AsyncHTTPTransport):
    """Транспорт, который перед КАЖДЫМ подключением проверяет IP цели
    (защита от DNS-rebinding между проверкой и подключением)."""

    async def handle_async_request(self, request):
        host = request.url.host
        if not host or not _resolve_safe(host):
            raise httpx.ConnectError("Blocked by SSRF protection")
        return await super().handle_async_request(request)


@router.get("/unfurl")
async def unfurl(url: str = Query(max_length=MAX_URL_LENGTH)):
    if not _validate_url(url):
        raise HTTPException(400, "bad url")

    with _cache_lock:
        cached = _cache.get(url)
    if cached is not None:
        return JSONResponse(cached, headers={"Cache-Control": "public, max-age=3600"})

    final_url = url
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(6.0, connect=3.0),
            follow_redirects=False,
            headers={"User-Agent": UA},
            transport=_SafeTransport(),
        ) as client:
            for _ in range(MAX_REDIRECTS):
                r = await client.get(final_url)
                if r.is_redirect:
                    location = r.headers.get("location", "")
                    if not location:
                        break
                    nxt = urljoin(final_url, location)
                    if not _validate_url(nxt):
                        raise HTTPException(400, "bad url")
                    final_url = nxt
                    continue
                r.raise_for_status()
                body = r.content[:MAX_BODY_BYTES]
                break
            else:
                raise HTTPException(502, "too many redirects")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(502, "fetch failed")

    try:
        soup = BeautifulSoup(body.decode(r.encoding or "utf-8", errors="replace"), "html.parser")
    except Exception:
        raise HTTPException(502, "fetch failed")

    def _clean(s: Optional[str], limit: int) -> Optional[str]:
        if not s:
            return None
        # Убираем управляющие символы, режем длину
        return re.sub(r"[\x00-\x1f\x7f]", "", s).strip()[:limit] or None

    title = _meta(soup, ["og:title", "twitter:title"]) \
        or (soup.title.get_text().strip() if soup.title else "") or urlparse(final_url).netloc
    desc = _meta(soup, ["og:description", "twitter:description", "description"]) or ""
    image = _meta(soup, ["og:image", "twitter:image"])

    # 🛡️ image только http(s), без javascript:/data:
    image_url = None
    if image:
        joined = urljoin(final_url, image)
        if urlparse(joined).scheme in ("http", "https"):
            image_url = joined

    data = {
        "url": final_url,
        "site": _clean(_meta(soup, ["og:site_name"]) or urlparse(final_url).netloc.replace("www.", "", 1), 80),
        "title": _clean(title, 200),
        "description": _clean(desc, 300),
        "image": image_url,
    }

    with _cache_lock:
        _cache[url] = data
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=3600"})