"""One-time model + voice prefetch into HF_HOME (needs Internet, run once).

Usage:
  docker compose --profile tts run --rm tts python provision.py

Warms the Hugging Face cache by instantiating the engine and running a
short inference, so the sidecar later serves with HF_HUB_OFFLINE=1.
"""

from __future__ import annotations

import os
import tempfile

MODE = os.environ.get("VIENEU_MODE", "v3turbo")
VOICE = os.environ.get("VIENEU_VOICE", "")
HF_HOME = os.environ.get("HF_HOME", "/models")


def main() -> None:
    os.makedirs(HF_HOME, exist_ok=True)
    from vieneu import Vieneu

    engine = Vieneu(mode=MODE)
    kwargs = {"voice": VOICE} if VOICE else {}
    result = engine.infer("Xin chào", **kwargs)
    with tempfile.TemporaryDirectory(prefix="provision-") as tmp:
        wav_path = os.path.join(tmp, "warmup.wav")
        if isinstance(result, (str, os.PathLike)) and os.path.exists(result):
            print(f"engine returned file directly: {result}")
        else:
            engine.save(result, wav_path)
            print(f"warmup wav: {wav_path} ({os.path.getsize(wav_path)} bytes)")
    total = sum(
        os.path.getsize(os.path.join(root, name))
        for root, _, names in os.walk(HF_HOME)
        for name in names
    )
    print(f"mode={MODE} voice={VOICE or '(default)'} cache={HF_HOME} bytes={total}")


if __name__ == "__main__":
    main()
