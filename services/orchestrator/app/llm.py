"""Gọi model do nhà cung cấp cloud vận hành qua API OpenAI-compatible.

OpenCorp không tải hoặc chạy model AI local. Đổi nhà cung cấp bằng base URL,
API key và model trong biến môi trường, không phải sửa code nghiệp vụ.
Chuỗi chịu lỗi (kế hoạch §3.5): provider chính (retry 1 lần) → provider dự phòng.
"""

import os

import httpx

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")  # vd: https://api.openai.com/v1
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")

# Provider dự phòng — tự chuyển sang khi provider chính lỗi/timeout.
LLM_FALLBACK_BASE_URL = os.environ.get("LLM_FALLBACK_BASE_URL", "")
LLM_FALLBACK_API_KEY = os.environ.get("LLM_FALLBACK_API_KEY", "")
LLM_FALLBACK_MODEL = os.environ.get("LLM_FALLBACK_MODEL", "")


async def chat(system: str, user: str, timeout: float = 30.0) -> str:
    if not LLM_BASE_URL or not LLM_API_KEY:
        raise RuntimeError("Thiếu LLM_BASE_URL hoặc LLM_API_KEY của nhà cung cấp cloud")
    try:
        return await _chat(LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, system, user, timeout)
    except (httpx.HTTPError, KeyError):
        pass  # retry 1 lần trên provider chính
    try:
        return await _chat(LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, system, user, timeout)
    except (httpx.HTTPError, KeyError):
        if not (LLM_FALLBACK_BASE_URL and LLM_FALLBACK_API_KEY):
            raise
    return await _chat(
        LLM_FALLBACK_BASE_URL, LLM_FALLBACK_API_KEY,
        LLM_FALLBACK_MODEL or LLM_MODEL, system, user, timeout,
    )


async def _chat(base_url: str, api_key: str, model: str, system: str, user: str, timeout: float) -> str:
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
