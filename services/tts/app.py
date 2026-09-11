"""VieNeu-TTS FastAPI sidecar (v3turbo, fixed server-side voice).

Contract:
  POST /tts  {"text": "<vietnamese>"} -> 200 audio/mpeg | 400 TEXT_EMPTY/TEXT_TOO_LONG | 429 TTS_BUSY | 503 MODEL_NOT_READY
  GET  /health -> {"status": "ok", "mode": "v3turbo", "voice": "<VIENEU_VOICE>"}
              | 503 {"error": "MODEL_NOT_READY", "load_error": "<...>"}

Inference is serialised behind an asyncio lock (ONNX session not
concurrency-safe). A request arriving while another inference holds the lock
gets 429 TTS_BUSY (the Node client retries it) instead of queueing behind an
unbounded wait. VieNeu emits 48 kHz; output downsampled to 44.1 kHz
mono mp3 here so the whole mix chain runs at one rate.

Timeout budget: the ffmpeg subprocess timeout (TTS_FFMPEG_TIMEOUT_S, 50 s)
must stay below the Node client's total timeout (ONEVOICE_TTS_TIMEOUT_MS,
60 s) so the client — not a hung subprocess — owns the deadline.
MAX_CHARS must match the Node client's maxChars (both default 400).
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
import threading
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

MODE = os.environ.get("VIENEU_MODE", "v3turbo")
VOICE = os.environ.get("VIENEU_VOICE", "")
MAX_CHARS = int(os.environ.get("TTS_MAX_CHARS", "400"))
# Must stay below the Node client's total timeout (ONEVOICE_TTS_TIMEOUT_MS).
FFMPEG_TIMEOUT_S = int(os.environ.get("TTS_FFMPEG_TIMEOUT_S", "50"))

_engine: Any = None
_ready = False
_load_error: str | None = None
_lock = asyncio.Lock()


def _load_engine() -> None:
    global _engine, _ready, _load_error
    try:
        from vieneu import Vieneu

        _engine = Vieneu(mode=MODE)
        _ready = True
    except Exception as exc:  # missing weights offline must fail loudly, not hang
        _load_error = f"{type(exc).__name__}: {exc}"


@asynccontextmanager
async def _lifespan(_: FastAPI):
    threading.Thread(target=_load_engine, daemon=True).start()
    yield


app = FastAPI(title="onevoice-tts", lifespan=_lifespan)


def _engine_to_wav(text: str, wav_path: str) -> None:
    kwargs = {"voice": VOICE} if VOICE else {}
    result = _engine.infer(text, **kwargs)
    if isinstance(result, (str, os.PathLike)) and os.path.exists(result):
        shutil.copy(result, wav_path)
    else:
        _engine.save(result, wav_path)


def _transcode_to_mp3(wav_path: str, mp3_path: str) -> None:
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", wav_path,
         "-ar", "44100", "-ac", "1", "-codec:a", "libmp3lame", "-q:a", "4", mp3_path],
        capture_output=True,
        timeout=FFMPEG_TIMEOUT_S,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "replace")[-500:])


def _synthesize_mp3(text: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="tts-") as tmp:
        wav_path = os.path.join(tmp, "out.wav")
        mp3_path = os.path.join(tmp, "out.mp3")
        _engine_to_wav(text, wav_path)
        _transcode_to_mp3(wav_path, mp3_path)
        with open(mp3_path, "rb") as fh:
            return fh.read()


@app.post("/tts")
async def tts(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = None
    text = body.get("text") if isinstance(body, dict) else None
    if not isinstance(text, str) or not text.strip():
        return JSONResponse({"error": "TEXT_EMPTY"}, status_code=400)
    if len(text) > MAX_CHARS:
        return JSONResponse({"error": "TEXT_TOO_LONG"}, status_code=400)
    if not _ready or _engine is None:
        return JSONResponse({"error": "MODEL_NOT_READY"}, status_code=503)
    if _lock.locked():
        return JSONResponse({"error": "TTS_BUSY"}, status_code=429)
    async with _lock:
        try:
            mp3 = await asyncio.to_thread(_synthesize_mp3, text)
        except Exception:
            return JSONResponse({"error": "TTS_FAILED"}, status_code=500)
    return Response(content=mp3, media_type="audio/mpeg")


@app.get("/health")
def health():
    if not _ready or _engine is None:
        body: dict[str, str] = {"error": "MODEL_NOT_READY"}
        if _load_error is not None:
            body["load_error"] = _load_error
        return JSONResponse(body, status_code=503)
    return {"status": "ok", "mode": MODE, "voice": VOICE}
