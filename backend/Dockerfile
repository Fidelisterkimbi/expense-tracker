FROM python:3.12-slim

RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

ENV PROMETHEUS_MULTIPROC_DIR=/tmp/prometheus-multiproc

CMD ["sh", "-c", "mkdir -p \"$PROMETHEUS_MULTIPROC_DIR\" && rm -f \"$PROMETHEUS_MULTIPROC_DIR\"/*.db && python init_db.py && exec gunicorn -c gunicorn.conf.py app:app"]
