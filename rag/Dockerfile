# Lightweight runtime: embedding inference runs remotely through Cloudflare
# Workers AI, so this image no longer needs PyTorch, Transformers,
# Sentence Transformers, or a baked-in Hugging Face model cache.
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

COPY requirements.txt .
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt

# Copy only the application code; ingestion utilities and tests remain outside
# the production image unless the application imports them at runtime.
COPY app/ ./app/

EXPOSE 10000

# Honour Render's injected PORT while keeping one worker to avoid multiplying
# process memory on the 512 MiB free instance.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --log-level info"]
