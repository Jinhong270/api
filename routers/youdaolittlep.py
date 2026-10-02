import asyncio
import hashlib
import json
import os
import re
import time
import uuid
from typing import Any, AsyncGenerator, Optional, Union

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from utils import get_http_client

router = APIRouter(prefix="/youdaolittlep/v1", tags=["有道小P"])

FIXED_KEY = os.getenv("DICTPEN_FIXED_KEY")
KEY_ID = os.getenv("DICTPEN_KEY_ID")
DEVICE_SN = os.getenv("DICTPEN_SN")
BASE_URL = "https://dictpen-server.youdao.com"
AI_TOKEN = os.getenv("AI_TOKEN")
TIMEOUT = 120
TTS_TIMEOUT = 30
MAX_TEXT_LEN = 100
_MODEL_CREATED = int(time.time())
_CHINESE_RE = re.compile(r"[\u4e00-\u9fff]")
_ENGLISH_RE = re.compile(r"[A-Za-z]+")
_SENTENCE_RE = re.compile(r"(?<=[。！？\n])")
_last_mystic = 0
_mystic_lock = asyncio.Lock()

MODEL_TO_VOICE = {
    "youxiaoshi-tts": "youxiaoshi",
    "youxiaojin-tts": "youxiaojin",
}


class ChatMessage(BaseModel):
    role: str
    content: Union[str, list[Any]]


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "doubao-1.5-pro-32k"
    messages: list[ChatMessage]
    stream: Optional[bool] = False
    max_tokens: Optional[int] = None


class ChatCompletionChoiceMessage(BaseModel):
    role: str = "assistant"
    content: str


class ChatCompletionChoice(BaseModel):
    index: int = 0
    message: ChatCompletionChoiceMessage
    finish_reason: str = "stop"


class ChatCompletionUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str = "doubao-1.5-pro-32k"
    choices: list[ChatCompletionChoice]
    usage: ChatCompletionUsage = Field(default_factory=ChatCompletionUsage)
    system_fingerprint: Optional[str] = "fp_dictpen"


class ModelObject(BaseModel):
    id: str
    object: str = "model"
    created: int
    owned_by: str = "youdao"


class ModelsResponse(BaseModel):
    object: str = "list"
    data: list[ModelObject]


class BalanceInfo(BaseModel):
    currency: str = "CNY"
    total_balance: str = "27065590.06"
    granted_balance: str = "0.00"
    topped_up_balance: str = "27065590.06"


class BalanceResponse(BaseModel):
    is_available: bool = True
    balance_infos: list[BalanceInfo] = Field(default_factory=lambda: [BalanceInfo()])


class SpeechRequest(BaseModel):
    model: str
    input: str
    voice: Optional[str] = None


def verify_ai_token(authorization: Optional[str] = Header(None)):
    if not AI_TOKEN:
        raise HTTPException(status_code=401, detail="Authentication Fails")
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication Fails")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != AI_TOKEN:
        raise HTTPException(status_code=401, detail="Authentication Fails")


def _require_device_config() -> None:
    if not FIXED_KEY or not KEY_ID or not DEVICE_SN:
        raise HTTPException(status_code=500, detail="服务器内部错误")


async def _next_mystic_time() -> str:
    global _last_mystic
    async with _mystic_lock:
        now = int(time.time() * 1000)
        if now <= _last_mystic:
            now = _last_mystic + 1
        _last_mystic = now
        return str(now)


def _generate_sign(device_sn: str, key_id: str, mystic_time: str) -> str:
    payload = f"deviceSn={device_sn}&keyid={key_id}&mysticTime={mystic_time}&key={FIXED_KEY}"
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


def _extract_text_from_content(content: Union[str, list[Any]]) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
        return " ".join(parts)
    return ""


def _estimate_tokens(text: str) -> int:
    chinese_chars = len(_CHINESE_RE.findall(text))
    words = _ENGLISH_RE.findall(text)
    word_chars = sum(len(word) for word in words)
    other_chars = len(text) - chinese_chars - word_chars
    return int(chinese_chars + len(words) * 1.3 + max(other_chars, 0) * 0.5)


def _build_message_contents(question: str) -> str:
    content_obj = [{"text": {"content": question}, "type": "text"}]
    return json.dumps(content_obj, ensure_ascii=False)


def _build_conversation_prompt(messages: list[ChatMessage]) -> str:
    lines = []
    for message in messages:
        content = _extract_text_from_content(message.content)
        lines.append(f"{message.role.capitalize()}: {content}")
    return "\n".join(lines)


async def _yield_youdao_events(question: str) -> AsyncGenerator[tuple[Optional[str], Optional[str]], None]:
    _require_device_config()
    mystic_time = await _next_mystic_time()
    sign = _generate_sign(DEVICE_SN, KEY_ID, mystic_time)
    data = {
        "osAppVersion": "2.13.0",
        "product": "dictpen",
        "appVersion": "4.13.1",
        "client": "y09",
        "deviceSn": DEVICE_SN,
        "mid": "Linux5.10.160",
        "screen": "640x172",
        "model": "YDPA7-1",
        "imei": DEVICE_SN,
        "deviceSku": "OVERHEAD_Y09_SKU_CHN_PRO",
        "keyid": KEY_ID,
        "mysticTime": mystic_time,
        "sign": sign,
        "pointParam": "deviceSn,keyid,mysticTime",
        "deviceId": DEVICE_SN,
        "messageContents": _build_message_contents(question),
        "messageInfo": '{"subscribe":"strategy","sensitiveScope":"message","responseStyle":"offical"}',
        "messageScene": "dayiPracticeAsk",
        "messageSource": "yd_gpt_dictpen",
    }
    client = await get_http_client()
    async with client.stream(
        "POST",
        f"{BASE_URL}/teacherp/chat/ask/sse",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=TIMEOUT,
    ) as response:
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="服务器内部错误")
        async for line in response.aiter_lines():
            if not line or line.startswith(("event:", "id:", "retry:")):
                continue
            if not line.startswith("data:"):
                continue
            data_line = line[len("data:"):].strip()
            if data_line == "[DONE]":
                break
            try:
                obj = json.loads(data_line)
            except json.JSONDecodeError:
                continue
            if obj.get("code") != 0:
                continue
            data_block = obj.get("data", {})
            for item in data_block.get("list", []):
                chat_info = item.get("chat")
                if chat_info:
                    chat_id = chat_info.get("chatId")
                    if chat_id:
                        yield (None, chat_id)
                text_info = item.get("text")
                if text_info and text_info.get("type") == "text":
                    content = text_info.get("content", "")
                    if content:
                        yield (content, None)


async def _fetch_youdao_answer_non_stream(question: str) -> tuple[str, Optional[str]]:
    parts: list[str] = []
    chat_id = None
    try:
        async for content_part, cid in _yield_youdao_events(question):
            if cid and not chat_id:
                chat_id = cid
            if content_part:
                parts.append(content_part)
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="上游服务超时")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="上游服务错误")
    except Exception:
        raise HTTPException(status_code=500, detail="服务器内部错误")
    answer = "".join(parts)
    if not answer:
        raise HTTPException(status_code=500, detail="服务器内部错误")
    return answer, chat_id


def _chunk(created: int, request_id: str, payload: dict) -> str:
    body = {
        "id": f"chatcmpl-{request_id}",
        "object": "chat.completion.chunk",
        "created": created,
        "model": "doubao-1.5-pro-32k",
        "system_fingerprint": "fp_dictpen",
    }
    body.update(payload)
    return f"data: {json.dumps(body, ensure_ascii=False)}\n\n"


async def _stream_youdao_to_openai(question: str) -> AsyncGenerator[str, None]:
    request_id = uuid.uuid4().hex[:12]
    created = int(time.time())
    parts: list[str] = []
    yield _chunk(
        created,
        request_id,
        {"choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}, "logprobs": None, "finish_reason": None}]},
    )
    try:
        async for content_part, _cid in _yield_youdao_events(question):
            if content_part:
                parts.append(content_part)
                yield _chunk(
                    created,
                    request_id,
                    {"choices": [{"index": 0, "delta": {"content": content_part}, "logprobs": None, "finish_reason": None}]},
                )
    except Exception:
        yield _chunk(
            created,
            request_id,
            {
                "choices": [{"index": 0, "delta": {}, "finish_reason": "error"}],
                "error": {"message": "服务器内部错误"},
            },
        )
        yield "data: [DONE]\n\n"
        return
    answer = "".join(parts)
    prompt_tokens = _estimate_tokens(question)
    completion_tokens = _estimate_tokens(answer)
    yield _chunk(
        created,
        request_id,
        {
            "choices": [{"index": 0, "delta": {}, "logprobs": None, "finish_reason": "stop"}],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
                "prompt_tokens_details": {"cached_tokens": 0},
                "prompt_cache_hit_tokens": 0,
                "prompt_cache_miss_tokens": prompt_tokens,
            },
        },
    )
    yield "data: [DONE]\n\n"


def _split_text(text: str, max_len: int = MAX_TEXT_LEN) -> list[str]:
    sentences = _SENTENCE_RE.split(text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if not sentence:
            continue
        if len(current) + len(sentence) <= max_len:
            current += sentence
            continue
        if current:
            chunks.append(current)
        current = sentence
    if current:
        chunks.append(current)
    final: list[str] = []
    for chunk in chunks:
        if len(chunk) <= max_len:
            if chunk.strip():
                final.append(chunk)
            continue
        for index in range(0, len(chunk), max_len):
            piece = chunk[index:index + max_len]
            if piece.strip():
                final.append(piece)
    return final


async def _tts_request(text: str, voice: str) -> bytes:
    _require_device_config()
    mystic_time = await _next_mystic_time()
    sign = _generate_sign(DEVICE_SN, KEY_ID, mystic_time)
    data = {
        "osAppVersion": "2.13.0",
        "appVersion": "4.13.1",
        "client": "y09",
        "deviceSku": "OVERHEAD_Y09_SKU_CHN_PRO",
        "deviceSn": DEVICE_SN,
        "format": "mp3",
        "imei": DEVICE_SN,
        "keyid": KEY_ID,
        "mid": "Linux5.10.160",
        "model": "YDPA7-1",
        "product": "dictpen",
        "q": text,
        "screen": "640x172",
        "voiceName": voice,
        "volume": "1",
        "mysticTime": mystic_time,
        "sign": sign,
        "pointParam": "deviceSn,keyid,mysticTime",
    }
    client = await get_http_client()
    response = await client.post(f"{BASE_URL}/zhiyun/tts", data=data, timeout=TTS_TIMEOUT)
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="服务器内部错误")
    if not response.headers.get("Content-Type", "").startswith("audio/"):
        raise HTTPException(status_code=500, detail="服务器内部错误")
    return response.content


async def _combine_audio_chunks(text: str, voice: str) -> bytes:
    chunks = _split_text(text)
    if not chunks:
        raise HTTPException(status_code=500, detail="服务器内部错误")
    parts: list[bytes] = []
    for chunk in chunks:
        parts.append(await _tts_request(chunk, voice))
    return b"".join(parts)


@router.get("/user/balance", response_model=BalanceResponse)
async def get_user_balance(valid: bool = Depends(verify_ai_token)):
    return BalanceResponse()


@router.get("/models", response_model=ModelsResponse)
async def list_models(valid: bool = Depends(verify_ai_token)):
    return ModelsResponse(
        data=[
            ModelObject(id="doubao-1.5-pro-32k", created=_MODEL_CREATED),
            ModelObject(id="youxiaoshi-tts", created=_MODEL_CREATED),
            ModelObject(id="youxiaojin-tts", created=_MODEL_CREATED),
        ]
    )


@router.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest, valid: bool = Depends(verify_ai_token)):
    if not request.messages:
        raise HTTPException(status_code=500, detail="服务器内部错误")
    full_prompt = _build_conversation_prompt(request.messages)
    if not full_prompt.strip():
        raise HTTPException(status_code=500, detail="服务器内部错误")
    _require_device_config()
    if request.stream:
        return StreamingResponse(
            _stream_youdao_to_openai(full_prompt),
            media_type="text/event-stream",
        )
    answer, chat_id = await _fetch_youdao_answer_non_stream(full_prompt)
    prompt_tokens = _estimate_tokens(full_prompt)
    completion_tokens = _estimate_tokens(answer)
    return ChatCompletionResponse(
        id=f"chatcmpl-{chat_id or 'unknown'}",
        created=int(time.time()),
        choices=[ChatCompletionChoice(message=ChatCompletionChoiceMessage(content=answer))],
        usage=ChatCompletionUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        ),
    )


@router.post("/audio/speech")
async def create_speech(request: SpeechRequest, valid: bool = Depends(verify_ai_token)):
    if not request.input.strip():
        raise HTTPException(status_code=500, detail="服务器内部错误")
    if request.model not in MODEL_TO_VOICE:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "message": "服务器内部错误",
                    "type": "invalid_request_error",
                    "param": "model",
                    "code": "model_not_found",
                }
            },
        )
    _require_device_config()
    try:
        audio_bytes = await _combine_audio_chunks(request.input, MODEL_TO_VOICE[request.model])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="服务器内部错误")
    return Response(content=audio_bytes, media_type="audio/mpeg")
