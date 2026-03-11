# ---- Build stage ----
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod -R a+rX /app

# ---- Development target (hot-reload) ----
FROM base AS development
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ---- Production target ----
FROM base AS production

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN mkdir -p /app/storage && chown -R appuser:appgroup /app/storage

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "3"]
