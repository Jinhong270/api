import asyncio
import ipaddress

import httpx

_http_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


def is_public_ip(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value.strip())
    except ValueError:
        return False
    return not (
        address.is_private
        or address.is_loopback
        or address.is_reserved
        or address.is_link_local
        or address.is_multicast
        or address.is_unspecified
    )


async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    client = _http_client
    if client is not None and not client.is_closed:
        return client
    async with _client_lock:
        client = _http_client
        if client is None or client.is_closed:
            client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=5.0),
                limits=httpx.Limits(
                    max_connections=100,
                    max_keepalive_connections=20,
                    keepalive_expiry=30.0,
                ),
            )
            _http_client = client
        return client


async def close_http_client() -> None:
    global _http_client
    async with _client_lock:
        client = _http_client
        _http_client = None
    if client is not None and not client.is_closed:
        await client.aclose()
