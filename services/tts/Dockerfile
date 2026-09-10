FROM python:3.12-slim

ENV HF_HOME=/models \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1001 tts

WORKDIR /srv
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py provision.py ./

RUN mkdir -p /models && chown -R tts:tts /srv /models
USER tts

# Offline at run time: missing model fails loudly instead of downloading.
ENV HF_HUB_OFFLINE=1 \
    TTS_PORT=8123

EXPOSE 8123
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${TTS_PORT:-8123}"]
