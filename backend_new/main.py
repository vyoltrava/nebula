# ============================================================
# main.py - FastAPI application entry point.
# Route handlers live in app/routers/*.py and are mounted below.
# ============================================================

from fastapi import FastAPI  # noqa: F401
from app.deps import *  # noqa: F401,F403  (shared imports + helpers)
from app.routers import auth, users, posts, admin, chats, support, suggestions, realtime, misc

app = FastAPI(title="Nebula API")
app.include_router(lp_router, prefix="/api")

@app.on_event("startup")
def print_routes():
    print("=== ЗАРЕГИСТРИРОВАННЫЕ РОУТЫ ===")
    for route in app.routes:
        if hasattr(route, "path"):
            methods = getattr(route, "methods", set())
            print(f"{methods} {route.path}")
    print("=================================")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms", "X-Request-Id"],
)


app.state.limiter = limiter



# 🆕 Логируем все необработанные исключения
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"❌ Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

app.add_middleware(PerfMiddleware)


@app.middleware("http")
async def ip_block_middleware(request: Request, call_next):
    ip = get_client_ip(request)

    # Пропускаем служебные и healthcheck
    if ip in ("127.0.0.1", "testclient") or request.url.path == "/health":
        return await call_next(request)

    # Отдельная сессия только для проверки IP-блоков
    with Session(engine) as session:
        block = is_ip_blocked(session, ip)
        if block:
            return JSONResponse(
                status_code=403,
                content={"detail": f"Ваш IP заблокирован. Причина: {block.reason or 'не указана'}"}
            )

    return await call_next(request)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Слишком много запросов. Подождите немного."},
    )


app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.on_event("startup")
def startup():
    from app.startup import run_app_startup
    run_app_startup()


# ============================================================
# ROUTERS CONNECTION
# ============================================================
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(posts.router)
app.include_router(admin.router)
app.include_router(chats.router)
app.include_router(support.router)
app.include_router(suggestions.router)
app.include_router(realtime.router)
app.include_router(misc.router)
