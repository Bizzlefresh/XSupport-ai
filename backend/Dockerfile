FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
# Build context is the repo root so the seed script (scripts/) is available in the image.
COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/app backend/app
RUN pip install --no-cache-dir ./backend
COPY backend backend
COPY scripts scripts
COPY data data
WORKDIR /srv/backend
# Train at build time so the model matches the installed scikit-learn exactly (pickled models are version-bound).
RUN python ../scripts/train_classifier.py
RUN useradd --create-home appuser && chown -R appuser /srv
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
