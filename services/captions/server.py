"""Internal-only YouTube metadata/caption service. It never downloads video/audio."""
from __future__ import annotations

import hmac
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_SECONDS = max(60, min(int(os.getenv("VIDEO_STUDY_MAX_SECONDS", "3600")), 7200))
BUSY = threading.BoundedSemaphore(2)


class CaptionError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def video_id_from_input(value):
    if VIDEO_ID.fullmatch(value):
        return value
    if not re.match(r"https?://", value, re.I):
        return None
    parsed = urllib.parse.urlparse(value)
    if parsed.username or parsed.password or parsed.port not in (None, 80, 443):
        raise CaptionError("请输入有效的 YouTube 视频链接", 400)
    host = (parsed.hostname or "").lower()
    if host == "youtu.be":
        candidate = parsed.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"):
        parts = parsed.path.strip("/").split("/")
        candidate = urllib.parse.parse_qs(parsed.query).get("v", [""])[0] if parsed.path == "/watch" else parts[1] if len(parts) == 2 and parts[0] in ("shorts", "embed", "live") else ""
    else:
        raise CaptionError("仅支持 YouTube 视频链接", 400)
    if not VIDEO_ID.fullmatch(candidate):
        raise CaptionError("链接中没有有效的视频 ID", 400)
    return candidate


def run_ytdlp(target, flat=False):
    args = [sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-warnings", "--skip-download", "--no-playlist", "--dump-single-json", "--socket-timeout", "12", "--retries", "1", "--extractor-retries", "1", "--js-runtimes", "node", "--no-remote-components"]
    if flat:
        args += ["--flat-playlist", "--playlist-end", "5"]
    args += ["--", target]
    env = os.environ.copy()
    proxy = env.get("CAPTIONS_PROXY", "")
    if proxy:
        env.update(HTTP_PROXY=proxy, HTTPS_PROXY=proxy, ALL_PROXY=proxy)
    try:
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            result = subprocess.run(args, stdout=output, stderr=errors, timeout=35 if flat else 90, env=env, check=False)
            if output.tell() > 8_000_000:
                raise CaptionError("视频元信息过大，请选择其他视频")
            output.seek(0)
            if result.returncode:
                errors.seek(0)
                detail = errors.read(32_000).decode("utf-8", errors="replace").lower()
                if any(word in detail for word in ("private video", "sign in", "unavailable", "members-only", "not available")):
                    raise CaptionError("视频不可用、需要登录或当前网络无法访问，请更换视频或手动导入字幕", 422)
                raise CaptionError("YouTube 请求失败，请检查服务器网络或稍后重试")
            return json.load(output)
    except subprocess.TimeoutExpired:
        raise CaptionError("获取视频信息超时，请检查服务器网络或稍后重试", 504)
    except (OSError, json.JSONDecodeError):
        raise CaptionError("字幕下载工具不可用或返回内容无效")


def format_duration(seconds):
    seconds = max(0, int(seconds or 0))
    if seconds >= 3600:
        return f"{seconds // 3600:02}:{seconds // 60 % 60:02}:{seconds % 60:02}"
    return f"{seconds // 60:02}:{seconds % 60:02}"


def candidate(info):
    video_id = str(info.get("id", ""))
    if not VIDEO_ID.fullmatch(video_id):
        return None
    return {"id": video_id, "title": str(info.get("title") or video_id)[:400], "channel": str(info.get("channel") or info.get("uploader") or "")[:300], "duration": format_duration(info.get("duration")), "url": f"https://www.youtube.com/watch?v={video_id}", "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"}


def search(query):
    query = str(query).strip()
    if not query or len(query) > 300:
        raise CaptionError("请输入不超过 300 个字符的视频标题或链接", 400)
    video_id = video_id_from_input(query)
    info = run_ytdlp(f"https://www.youtube.com/watch?v={video_id}" if video_id else f"ytsearch5:{query}", flat=not video_id)
    entries = [info] if video_id else (info.get("entries") or [])[:5]
    return {"candidates": [item for raw in entries if isinstance(raw, dict) for item in [candidate(raw)] if item]}


def valid_caption_url(url):
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and not parsed.username and not parsed.password and parsed.port in (None, 443) and host in ("www.youtube.com", "youtube.com", "www.youtube-nocookie.com") and parsed.path == "/api/timedtext"


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not valid_caption_url(newurl):
            raise CaptionError("字幕服务返回了不允许的下载地址")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download_json3(url):
    if not valid_caption_url(url):
        raise CaptionError("字幕下载地址无效")
    proxy = os.getenv("CAPTIONS_PROXY", "")
    handlers = [SafeRedirect()]
    if proxy:
        handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    opener = urllib.request.build_opener(*handlers)
    try:
        with opener.open(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=25) as response:
            content = response.read(3_000_001)
        if len(content) > 3_000_000:
            raise CaptionError("字幕文件过大，请选择较短的视频", 422)
        return json.loads(content)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        raise CaptionError("字幕下载失败，请稍后重试或手动导入 SRT / VTT")


def json3_cues(payload):
    cues = []
    for event in payload.get("events", []):
        if not isinstance(event, dict) or not event.get("segs"):
            continue
        text = "".join(str(segment.get("utf8", "")) for segment in event["segs"] if isinstance(segment, dict)).strip()
        if not text:
            continue
        start = max(0, int(event.get("tStartMs", 0)))
        cues.append({"startMs": start, "endMs": start + max(1, int(event.get("dDurationMs", 2000))), "text": text})
    return cues


def captions(video_id):
    if not isinstance(video_id, str) or not VIDEO_ID.fullmatch(video_id):
        raise CaptionError("无效的视频 ID", 400)
    info = run_ytdlp(f"https://www.youtube.com/watch?v={video_id}")
    if info.get("is_live") or int(info.get("duration") or 0) > MAX_SECONDS:
        raise CaptionError(f"请选择非直播且不超过 {MAX_SECONDS // 60} 分钟的视频", 422)
    for collection in (info.get("subtitles") or {}, info.get("automatic_captions") or {}):
        languages = sorted((key for key in collection if key == "en" or key.startswith("en-")), key=lambda key: (key != "en", key))
        for language in languages:
            track = next((track for track in collection[language] if track.get("ext") == "json3"), None)
            if track:
                cues = json3_cues(download_json3(track.get("url", "")))
                if cues:
                    return {"video": candidate(info), "cues": cues, "language": language}
    raise CaptionError("该视频没有可用的英文字幕或英文自动字幕，请选择其他视频或导入 SRT / VTT", 422)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not log request bodies, proxy credentials, or subtitle URLs.
        sys.stderr.write(f"captions-service {self.command} {self.path.split('?')[0]}\n")

    def send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        token = os.getenv("CAPTIONS_SERVICE_TOKEN", "")
        if not token or not hmac.compare_digest(self.headers.get("X-Caption-Token", ""), token):
            self.send_json(403, {"error": "字幕服务认证失败"})
            return
        if not BUSY.acquire(blocking=False):
            self.send_json(429, {"error": "字幕服务繁忙，请稍后重试"})
            return
        try:
            self.connection.settimeout(15)
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 4096:
                raise CaptionError("请求内容过大或为空", 400)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise CaptionError("请求格式错误", 400)
            if self.path == "/search":
                self.send_json(200, search(body.get("query", "")))
            elif self.path == "/captions":
                self.send_json(200, captions(body.get("videoId")))
            else:
                self.send_json(404, {"error": "Not found"})
        except CaptionError as error:
            self.send_json(error.status, {"error": str(error)})
        except (ValueError, TypeError, OSError):
            self.send_json(400, {"error": "无效请求或网络连接中断"})
        except Exception:
            self.send_json(500, {"error": "字幕服务暂时不可用"})
        finally:
            BUSY.release()


if __name__ == "__main__":
    if len(os.getenv("CAPTIONS_SERVICE_TOKEN", "")) < 24:
        raise SystemExit("CAPTIONS_SERVICE_TOKEN must contain at least 24 characters")
    ThreadingHTTPServer((os.getenv("CAPTIONS_BIND", "0.0.0.0"), int(os.getenv("PORT", "8080"))), Handler).serve_forever()
