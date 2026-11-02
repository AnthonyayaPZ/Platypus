FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /service
RUN python3 -m venv /opt/captions
COPY requirements.txt .
RUN /opt/captions/bin/pip install --no-cache-dir -r requirements.txt
COPY server.py .
ENV PATH="/opt/captions/bin:$PATH" PYTHONUNBUFFERED=1
USER node
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=5s CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)" || exit 1
CMD ["python3", "server.py"]
