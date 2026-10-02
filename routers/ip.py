import time

from fastapi import APIRouter, Request

from utils import get_http_client, is_public_ip

router = APIRouter(prefix="/ip", tags=["IP"])

_GEO_TTL = 600.0
_GEO_MAX = 1024
_GEO_CACHE: dict[str, tuple[float, dict]] = {}


def client_ip_from_request(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


async def lookup_geo(ip: str) -> dict:
    now = time.monotonic()
    cached = _GEO_CACHE.get(ip)
    if cached is not None and now - cached[0] < _GEO_TTL:
        return cached[1]
    if not is_public_ip(ip):
        return {}
    client = await get_http_client()
    try:
        response = await client.get(
            f"http://ip-api.com/json/{ip}",
            headers={"Accept": "application/json"},
            timeout=5.0,
        )
        data = response.json()
    except Exception:
        return {}
    if not isinstance(data, dict) or data.get("status") != "success":
        return {}
    data.pop("query", None)
    data.pop("status", None)
    if len(_GEO_CACHE) >= _GEO_MAX:
        _GEO_CACHE.clear()
    _GEO_CACHE[ip] = (now, data)
    return data


@router.get("/")
async def get_client_ip(request: Request):
    ip = client_ip_from_request(request)
    geo = await lookup_geo(ip)
    return {"ip": ip, **geo}
