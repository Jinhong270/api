import re
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from utils import get_http_client

router = APIRouter(prefix="/bilibili", tags=["Bilibili"])

BILIBILI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com/",
}

API_BASE = "https://api.bilibili.com"
_BVID_RE = re.compile(r"^BV[0-9A-Za-z]{10}$")
_CACHE_TTL = {"hot": 30.0, "view": 20.0, "search": 15.0}
_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_MAX = 256


class SearchRequest(BaseModel):
    keyword: str = Field(min_length=1, max_length=200)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=50)


def _check_bvid(bvid: str) -> None:
    if _BVID_RE.fullmatch(bvid) is None:
        raise HTTPException(status_code=400, detail="invalid bvid")


def _cache_get(key: str, ttl: float) -> dict | None:
    cached = _CACHE.get(key)
    if cached is None:
        return None
    if time.monotonic() - cached[0] >= ttl:
        _CACHE.pop(key, None)
        return None
    return cached[1]


def _cache_put(key: str, value: dict) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        _CACHE.clear()
    _CACHE[key] = (time.monotonic(), value)


async def _request(url: str, params: dict | None = None) -> dict:
    client = await get_http_client()
    try:
        response = await client.get(url, params=params, headers=BILIBILI_HEADERS)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="upstream timeout")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="upstream error")
    try:
        data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="upstream error")
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="upstream error")
    return data


async def _cached_request(kind: str, url: str, params: dict) -> dict:
    key = kind + "?" + urlencode(sorted((str(name), str(value)) for name, value in params.items()))
    cached = _cache_get(key, _CACHE_TTL[kind])
    if cached is not None:
        return cached
    data = await _request(url, params)
    if data.get("code") == 0:
        _cache_put(key, data)
    return data


async def _video_info(**params) -> dict:
    return await _cached_request("view", f"{API_BASE}/x/web-interface/view", params)


async def _play_url(bvid: str, cid: int, fnval: int) -> dict:
    return await _request(
        f"{API_BASE}/x/player/playurl",
        {"bvid": bvid, "cid": cid, "qn": 80, "fnval": fnval},
    )


async def _download(id_params: dict, fnval: int) -> dict:
    info = await _video_info(**id_params)
    data = info.get("data") or {}
    cid = data.get("cid")
    bvid = data.get("bvid") or id_params.get("bvid")
    if not cid or not bvid or info.get("code") not in (0, None):
        return info
    return await _play_url(bvid, cid, fnval)


@router.get("/hot")
async def get_hot(ps: int = Query(50, ge=1, le=100)):
    return await _cached_request("hot", f"{API_BASE}/x/web-interface/popular", {"ps": ps})


@router.get("/video/{bvid}")
async def get_video_by_bvid(bvid: str):
    _check_bvid(bvid)
    return await _video_info(bvid=bvid)


@router.post("/video")
async def post_video_by_bvid(bvid: str):
    _check_bvid(bvid)
    return await _video_info(bvid=bvid)


@router.get("/video/download/{bvid}")
async def get_video_download(bvid: str):
    _check_bvid(bvid)
    return await _download({"bvid": bvid}, 0)


@router.post("/video/download")
async def post_video_download(bvid: str):
    _check_bvid(bvid)
    return await _download({"bvid": bvid}, 0)


@router.get("/video/download/1080/{bvid}")
async def get_video_download_1080(bvid: str):
    _check_bvid(bvid)
    return await _download({"bvid": bvid}, 16)


@router.post("/video/download/1080")
async def post_video_download_1080(bvid: str):
    _check_bvid(bvid)
    return await _download({"bvid": bvid}, 16)


@router.get("/video/aid/{aid}")
async def get_video_by_aid(aid: int = Path(..., ge=1)):
    return await _video_info(aid=aid)


@router.post("/video/aid")
async def post_video_by_aid(aid: int = Query(..., ge=1)):
    return await _video_info(aid=aid)


@router.get("/video/download/aid/{aid}")
async def get_video_download_by_aid(aid: int = Path(..., ge=1)):
    return await _download({"aid": aid}, 0)


@router.post("/video/download/aid")
async def post_video_download_by_aid(aid: int = Query(..., ge=1)):
    return await _download({"aid": aid}, 0)


@router.get("/video/download/aid/1080/{aid}")
async def get_video_download_aid_1080(aid: int = Path(..., ge=1)):
    return await _download({"aid": aid}, 16)


@router.post("/video/download/aid/1080")
async def post_video_download_aid_1080(aid: int = Query(..., ge=1)):
    return await _download({"aid": aid}, 16)


@router.get("/search/{keyword}")
async def search_video(
    keyword: str = Path(..., min_length=1, max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
):
    params = {
        "search_type": "video",
        "keyword": keyword,
        "page": page,
        "page_size": page_size,
    }
    return await _cached_request("search", f"{API_BASE}/x/web-interface/search/type", params)


@router.post("/search")
async def post_search_video(request: SearchRequest):
    params = {
        "search_type": "video",
        "keyword": request.keyword,
        "page": request.page,
        "page_size": request.page_size,
    }
    return await _cached_request("search", f"{API_BASE}/x/web-interface/search/type", params)
