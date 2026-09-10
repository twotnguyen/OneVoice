# OneVoice TTS sidecar (VieNeu-TTS v3 Turbo)

FastAPI wrapper turning Vietnamese text into 44.1 kHz mono mp3 bytes.
No Python enters the Node codebase — the app talks HTTP only.

## Contract

```
POST /tts   {"text": "<vietnamese>"} (cap 400 chars)
  200 -> audio/mpeg
  400 -> {"error": "TEXT_EMPTY" | "TEXT_TOO_LONG"}
  503 -> {"error": "MODEL_NOT_READY"}
GET /health -> {"status": "ok", "mode": "v3turbo", "voice": "<VIENEU_VOICE>"}
```

Voice is server-side and fixed — the request body carries no voice field.

## Env

| var | default | side |
|---|---|---|
| `VIENEU_MODE` | `v3turbo` | tts |
| `VIENEU_VOICE` | _(required in deploy)_ | tts |
| `HF_HOME` | `/models` | tts |
| `HF_HUB_OFFLINE` | `1` | tts (run time) |
| `TTS_MAX_CHARS` | `400` | tts |
| `TTS_PORT` | `8123` | tts |

## Provision + run

```bash
docker compose --profile tts build
docker compose --profile tts run --rm tts python provision.py  # one-time, needs Internet
docker compose --profile tts up -d
```

## Test

```bash
cd services/tts && python3 -m pytest test_app.py -q  # engine mocked, no model needed
```
