import asyncio
import os
from contextlib import asynccontextmanager, suppress

from fastapi import Depends, FastAPI, HTTPException
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.security import APIKeyQuery
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from routers import bilibili, ip, qrcode, youdaolittlep
from routers.text2img.router import periodic_cleanup, render, router as text2img_router
from utils import close_http_client

EXPECTED_TOKEN = os.environ.get("FASTAPI_DOCS_TOKEN", "")
if not EXPECTED_TOKEN:
    raise RuntimeError("Environment variable FASTAPI_DOCS_TOKEN is not set. Startup aborted.")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
api_key_query = APIKeyQuery(name="token", auto_error=False)
_openapi_cache = None


def load_api_info() -> str:
    with open(os.path.join(BASE_DIR, "info.txt"), "r", encoding="utf-8") as handle:
        return handle.read()


async def verify_api_token(token: str | None = Depends(api_key_query)):
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if token != EXPECTED_TOKEN:
        raise HTTPException(status_code=403, detail="Authentication Fails")


class CachedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope):
        response = await super().get_response(path, scope)
        if getattr(response, "status_code", None) not in (200, 304):
            return response
        name = path.replace("\\", "/").rsplit("/", 1)[-1].lower()
        if name in {"", ".", "index.html", "index.htm"} or name.endswith((".html", ".htm")):
            response.headers["Cache-Control"] = "no-cache"
        else:
            response.headers["Cache-Control"] = "public, max-age=3600"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs("data", exist_ok=True)
    os.makedirs("tmpl", exist_ok=True)
    task = asyncio.create_task(periodic_cleanup())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        await close_http_client()
        await render.terminate()


app = FastAPI(title="Docs", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


@app.get("/openapi.json", include_in_schema=False)
async def openapi_json(valid: bool = Depends(verify_api_token)):
    global _openapi_cache
    if _openapi_cache is None:
        _openapi_cache = get_openapi(
            title=app.title,
            version=app.version,
            openapi_version=app.openapi_version,
            description=app.description,
            routes=app.routes,
        )
    return _openapi_cache


@app.get("/docs", include_in_schema=False)
async def swagger_ui(token: str = Depends(api_key_query), valid: bool = Depends(verify_api_token)):
    return get_swagger_ui_html(openapi_url=f"/openapi.json?token={token}", title="Docs")


@app.get("/redoc", include_in_schema=False)
async def redoc_ui(token: str = Depends(api_key_query), valid: bool = Depends(verify_api_token)):
    return get_redoc_html(openapi_url=f"/openapi.json?token={token}", title="Redoc")


app.include_router(ip.router)
app.include_router(qrcode.router)
app.include_router(bilibili.router)
app.include_router(youdaolittlep.router)
app.include_router(text2img_router)

HELLO_TEXT = load_api_info()


@app.get("/", response_class=PlainTextResponse)
async def root():
    return HELLO_TEXT


@app.get("/status", response_class=PlainTextResponse)
async def status():
    return HELLO_TEXT


@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    return FileResponse(os.path.join(BASE_DIR, "robots.txt"))


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(os.path.join(BASE_DIR, "favicon.ico"))


app.mount("/snake", CachedStaticFiles(directory=os.path.join(BASE_DIR, "static/Snake"), html=True), name="snake")
app.mount("/2048", CachedStaticFiles(directory=os.path.join(BASE_DIR, "static/2048"), html=True), name="2048")
app.mount("/tetris", CachedStaticFiles(directory=os.path.join(BASE_DIR, "static/Tetris"), html=True), name="tetris")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
