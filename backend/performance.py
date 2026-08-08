import os
import time
import uuid
import logging
import statistics
from collections import defaultdict, deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("perf")

SLOW_MS = float(os.getenv("PERF_SLOW_MS", "300"))
MAX_SAMPLES = int(os.getenv("PERF_MAX_SAMPLES", "500"))

stats = defaultdict(lambda: deque(maxlen=MAX_SAMPLES))


def _route_path(request: Request) -> str:
    route = request.scope.get("route")
    return getattr(route, "path", request.url.path)


class PerfMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Чтобы не спамило статикой Next.js
        if request.url.path.startswith(
            (
                "/_next",
                "/static",
                "/favicon.ico",
                "/robots.txt",
                "/sitemap.xml",
            )
        ):
            return await call_next(request)

        request_id = uuid.uuid4().hex[:8]
        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "[PERF] ERROR %s %s %.1fms",
                request.method,
                _route_path(request),
                ms,
            )
            raise

        ms = (time.perf_counter() - start) * 1000
        path = _route_path(request)
        key = (request.method, path)

        stats[key].append(ms)

        response.headers["X-Request-Id"] = request_id
        response.headers["X-Process-Time-Ms"] = f"{ms:.1f}"

        if ms >= SLOW_MS:
            logger.warning(
                "[PERF] SLOW %s %s %.1fms",
                request.method,
                path,
                ms,
            )
        else:
            logger.info(
                "[PERF] %s %s %.1fms",
                request.method,
                path,
                ms,
            )

        return response


def get_perf_summary():
    rows = []

    for (method, path), samples in stats.items():
        if not samples:
            continue

        arr = sorted(samples)
        count = len(arr)

        avg_ms = statistics.fmean(arr)
        max_ms = arr[-1]
        p95_ms = arr[int(0.95 * (count - 1))]

        rows.append(
            {
                "method": method,
                "path": path,
                "count": count,
                "avg_ms": round(avg_ms, 1),
                "max_ms": round(max_ms, 1),
                "p95_ms": round(p95_ms, 1),
            }
        )

    rows.sort(key=lambda x: x["avg_ms"], reverse=True)
    return rows