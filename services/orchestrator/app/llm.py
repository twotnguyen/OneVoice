"""Gọi LLM qua API chuẩn OpenAI-compatible (base URL + API key).

Đa số nhà cung cấp expose endpoint /chat/completions theo chuẩn này
(OpenAI, OpenRouter, Groq, DeepSeek, Together, v.v.) — chỉ cần đổi
biến môi trường, không phải sửa code khi đổi nhà cung cấp.

Nếu không đặt LLM_API_KEY, tự rơi về Ollama local (offline, dùng làm phao demo).
"""

import os

import httpx

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")  # vd: https://api.openai.com/v1
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")


async def chat(system: str, user: str, timeout: float = 120.0) -> str:
    if LLM_API_KEY:
        return await _chat_openai_compatible(system, user, timeout)
    return await _chat_ollama(system, user, timeout)


async def _chat_openai_compatible(system: str, user: str, timeout: float) -> str:
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            f"{LLM_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {LLM_API_KEY}"},
            json={
                "model": LLM_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def _chat_ollama(system: str, user: str, timeout: float) -> str:
    """Phương án dự phòng offline — dùng khi demo mất mạng hoặc chưa có API key."""
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "stream": False,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
        )
        r.raise_for_status()
        return r.json()["message"]["content"]
