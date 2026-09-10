"""pytest for the TTS sidecar contract. Engine mocked (fixed waveform)."""

import math
import struct
import wave

import pytest
from fastapi.testclient import TestClient

import app as tts_app


def _write_fixed_wav(path: str, seconds: float = 0.5, rate: int = 48000) -> None:
    frames = int(seconds * rate)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        for i in range(frames):
            sample = int(10000 * math.sin(2 * math.pi * 440 * i / rate))
            wf.writeframes(struct.pack("<h", sample))


class _FakeEngine:
    def infer(self, text, **kwargs):
        assert text and kwargs.get("voice", tts_app.VOICE) == tts_app.VOICE
        return ("waveform", 48000)  # fixed waveform, not real audio

    def save(self, result, path):
        _write_fixed_wav(path)


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(tts_app, "_engine", _FakeEngine())
    monkeypatch.setattr(tts_app, "_ready", True)
    with TestClient(tts_app.app) as client:
        yield client


def test_tts_vietnamese_returns_mp3(client):
    resp = client.post("/tts", json={"text": "Xin chào"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/mpeg"
    assert len(resp.content) > 1000


def test_tts_empty_text_rejected(client):
    for body in ({}, {"text": ""}, {"text": "   "}, {"nope": 1}):
        resp = client.post("/tts", json=body)
        assert resp.status_code == 400
        assert resp.json() == {"error": "TEXT_EMPTY"}


def test_tts_too_long_rejected(client):
    resp = client.post("/tts", json={"text": "a" * 401})
    assert resp.status_code == 400
    assert resp.json() == {"error": "TEXT_TOO_LONG"}


def test_tts_not_ready_returns_503(monkeypatch):
    monkeypatch.setattr(tts_app, "_engine", None)
    monkeypatch.setattr(tts_app, "_ready", False)
    with TestClient(tts_app.app) as client:
        resp = client.post("/tts", json={"text": "Xin chào"})
        assert resp.status_code == 503
        assert resp.json() == {"error": "MODEL_NOT_READY"}
        assert client.get("/health").status_code == 503


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "mode": tts_app.MODE, "voice": tts_app.VOICE}
