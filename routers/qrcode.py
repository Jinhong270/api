import asyncio
import base64
from io import BytesIO

import qrcode
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel
from qrcode.exceptions import DataOverflowError

router = APIRouter(prefix="/qrcode", tags=["QR Code"])
_QR_MAX_CHARS = 7089


class QRCodeRequest(BaseModel):
    text: str


def _generate_qrcode_bytes(text: str) -> bytes:
    image = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    image.add_data(text)
    image.make(fit=True)
    rendered = image.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    rendered.save(buffer, format="PNG")
    return buffer.getvalue()


async def _qr_bytes(text: str) -> bytes:
    if len(text) > _QR_MAX_CHARS:
        raise HTTPException(status_code=400, detail="text is too long")
    try:
        return await asyncio.to_thread(_generate_qrcode_bytes, text)
    except DataOverflowError:
        raise HTTPException(status_code=400, detail="text is too long")
    except ValueError as exc:
        if "version" not in str(exc).lower():
            raise HTTPException(status_code=500, detail="failed to generate qrcode")
        raise HTTPException(status_code=400, detail="text is too long")
    except Exception:
        raise HTTPException(status_code=500, detail="failed to generate qrcode")


@router.get("", response_class=Response)
async def get_qrcode_image(text: str = Query(...)):
    return Response(content=await _qr_bytes(text), media_type="image/png")


@router.get("/base64", response_class=PlainTextResponse)
async def get_qrcode_base64(text: str = Query(...)):
    encoded = base64.b64encode(await _qr_bytes(text)).decode("ascii")
    return f"data:image/png;base64,{encoded}"


@router.post("", response_class=Response)
async def post_qrcode_image(request: QRCodeRequest):
    return Response(content=await _qr_bytes(request.text), media_type="image/png")


@router.post("/base64", response_class=PlainTextResponse)
async def post_qrcode_base64(request: QRCodeRequest):
    encoded = base64.b64encode(await _qr_bytes(request.text)).decode("ascii")
    return f"data:image/png;base64,{encoded}"
