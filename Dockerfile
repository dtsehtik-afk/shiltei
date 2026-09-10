# ─── Build Stage (Frontend) ────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app
COPY package.json .
RUN npm install
COPY public/ ./public/
COPY src/ ./src/
COPY vite.config.js .
RUN npm run build

# ─── Production Stage (Backend + Static) ──────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend
COPY pricing_v4_auth.py .

# Frontend build output
COPY --from=frontend-builder /app/dist ./static

# Serve static files from FastAPI
RUN pip install aiofiles

# Add static file serving to startup
ENV SECRET_KEY=change-me-in-production
ENV PORT=8000

EXPOSE 8000

CMD ["uvicorn", "pricing_v4_auth:app", "--host", "0.0.0.0", "--port", "8000"]
