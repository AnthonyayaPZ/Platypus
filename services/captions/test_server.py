import unittest
import json
import threading
import urllib.error
import urllib.request
import subprocess
import os
import tempfile
from pathlib import Path
from unittest.mock import patch
import server


class CaptionServiceTests(unittest.TestCase):
    def test_cookie_file_is_private_youtube_only_and_never_modified(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.txt"
            content = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSID\tprivate-test-value\n"
            source.write_text(content, encoding="utf-8")
            source.chmod(0o600)
            seen = []

            def run(args, stdout, stderr, **kwargs):
                copy = Path(args[args.index("--cookies") + 1])
                seen.append(copy)
                self.assertNotEqual(copy, source)
                self.assertIn("private-test-value", copy.read_text())
                self.assertNotIn("private-test-value", " ".join(args))
                stdout.write(b'{}')
                return subprocess.CompletedProcess(args, 0)

            with patch.dict(server.os.environ, {"CAPTIONS_COOKIES_FILE": str(source.resolve())}), patch.object(server.subprocess, "run", side_effect=run):
                server.run_ytdlp("abcdefghijk")
            self.assertEqual(source.read_text(), content)
            self.assertFalse(seen[0].exists())

    def test_invalid_or_other_site_cookies_are_rejected_without_secret_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.txt"
            for content in ("private-malformed-value", "# Netscape HTTP Cookie File\n.bank.example\tTRUE\t/\tTRUE\t2147483647\tSID\tprivate-value\n"):
                source.write_text(content, encoding="utf-8")
                source.chmod(0o600)
                with patch.dict(server.os.environ, {"CAPTIONS_COOKIES_FILE": str(source.resolve())}):
                    with self.assertRaises(server.CaptionError) as error:
                        server.caption_cookies()
                    self.assertNotIn("private", str(error.exception))
                    self.assertEqual(error.exception.status, 503)
            if os.name == "posix":
                source.chmod(0o644)
                with patch.dict(server.os.environ, {"CAPTIONS_COOKIES_FILE": str(source.resolve())}):
                    with self.assertRaises(server.CaptionError):
                        server.caption_cookies()

    def test_service_proxy_overrides_inherited_host_proxy_without_cli_secrets(self):
        def run(args, stdout, stderr, **kwargs):
            self.assertNotIn("http://user:private@127.0.0.1:17890", args)
            self.assertEqual(kwargs["env"]["https_proxy"], "http://user:private@127.0.0.1:17890")
            self.assertNotIn("HTTPS_PROXY", kwargs["env"])
            self.assertEqual(kwargs["env"]["NO_PROXY"], "localhost,127.0.0.1,::1")
            stdout.write(b'{"id":"abcdefghijk"}')
            return subprocess.CompletedProcess(args, 0)

        with patch.dict(server.os.environ, {"CAPTIONS_PROXY": "http://user:private@127.0.0.1:17890", "https_proxy": "http://wrong:7890", "HTTPS_PROXY": "http://wrong:7890", "NO_PROXY": "*"}), patch.object(server.subprocess, "run", side_effect=run):
            self.assertEqual(server.run_ytdlp("abcdefghijk")["id"], "abcdefghijk")

    def test_no_service_proxy_does_not_inherit_host_proxy(self):
        def run(args, stdout, stderr, **kwargs):
            self.assertNotIn("https_proxy", kwargs["env"])
            self.assertNotIn("HTTPS_PROXY", kwargs["env"])
            stdout.write(b'{}')
            return subprocess.CompletedProcess(args, 0)

        with patch.dict(server.os.environ, {"CAPTIONS_PROXY": "", "https_proxy": "http://wrong:7890"}), patch.object(server.subprocess, "run", side_effect=run):
            server.run_ytdlp("abcdefghijk")

    def test_invalid_proxy_is_reported_without_leaking_credentials(self):
        for proxy in ("socks5://user:private@localhost:1", "http://user:private@localhost:no-port", "file:///private", "http://localhost:80/?token=private"):
            with patch.dict(server.os.environ, {"CAPTIONS_PROXY": proxy}):
                with self.assertRaises(server.CaptionError) as error:
                    server.caption_proxy()
                self.assertNotIn("private", str(error.exception))
                self.assertEqual(error.exception.status, 503)

    def test_failures_distinguish_network_login_and_rate_limit(self):
        cases = [("Sign in to confirm you're not a bot", 422, "登录验证"),
                 ("HTTP Error 429: Too many requests", 429, "过于频繁"),
                 ("ProxyError: connection refused", 503, "代理无法连接"),
                 ("Connection reset by peer", 502, "网络请求失败"),
                 ("Private video", 422, "账号权限")]
        for detail, status, message in cases:
            error = server.ytdlp_error(detail.lower(), True)
            self.assertEqual(error.status, status)
            self.assertIn(message, str(error))

    def test_subtitle_access_denial_and_rate_limit_remain_distinct(self):
        url = "https://www.youtube.com/api/timedtext?v=abcdefghijk"
        for status, expected_status in ((403, 422), (429, 429)):
            with patch.object(server.urllib.request.OpenerDirector, "open", side_effect=urllib.error.HTTPError(url, status, "private signed request", {}, None)):
                with self.assertRaises(server.CaptionError) as error:
                    server.download_json3(url)
                self.assertEqual(error.exception.status, expected_status)
                self.assertNotIn("private signed request", str(error.exception))

    def test_ytdlp_error_never_exposes_raw_diagnostics(self):
        def run(args, stdout, stderr, **kwargs):
            stderr.write(b"ERROR: ProxyError connection refused https://user:private@internal/")
            return subprocess.CompletedProcess(args, 1)

        with patch.dict(server.os.environ, {"CAPTIONS_PROXY": "http://localhost:17890"}), patch.object(server.subprocess, "run", side_effect=run):
            with self.assertRaises(server.CaptionError) as error:
                server.run_ytdlp("abcdefghijk")
            self.assertEqual(error.exception.status, 503)
            self.assertNotIn("private", str(error.exception))

    def test_internal_http_requires_token_and_returns_caption_contract(self):
        token = "test-internal-token-1234567890"
        http = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{http.server_address[1]}/captions"
        try:
            with patch.dict(server.os.environ, {"CAPTIONS_SERVICE_TOKEN": token}), patch.object(server, "captions", return_value={"video": {"id": "abcdefghijk"}, "cues": [], "language": "en"}):
                data = json.dumps({"videoId": "abcdefghijk"}).encode()
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}))
                self.assertEqual(error.exception.code, 403)
                request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "X-Caption-Token": token})
                with urllib.request.urlopen(request) as response:
                    result = json.load(response)
                self.assertEqual(result["video"]["id"], "abcdefghijk")
                self.assertEqual(result["language"], "en")
        finally:
            http.shutdown()
            http.server_close()
            thread.join(timeout=2)

    def test_only_youtube_video_urls_are_accepted(self):
        self.assertEqual(server.video_id_from_input("https://youtu.be/abcdefghijk?t=10"), "abcdefghijk")
        self.assertEqual(server.video_id_from_input("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk")
        self.assertIsNone(server.video_id_from_input("a video title"))
        for value in ("http://127.0.0.1:8080/private", "https://youtube.com.evil.example/watch?v=abcdefghijk", "https://www.youtube.com/playlist?list=abc"):
            with self.assertRaises(server.CaptionError):
                server.video_id_from_input(value)

    def test_caption_urls_cannot_target_arbitrary_hosts(self):
        self.assertTrue(server.valid_caption_url("https://www.youtube.com/api/timedtext?v=abcdefghijk"))
        self.assertFalse(server.valid_caption_url("https://127.0.0.1/api/timedtext"))
        self.assertFalse(server.valid_caption_url("http://www.youtube.com/api/timedtext"))
        self.assertFalse(server.valid_caption_url("https://www.youtube.com@evil.example/api/timedtext"))

    def test_human_english_subtitles_are_preferred_over_automatic(self):
        with patch.object(server, "run_ytdlp", return_value={"id": "abcdefghijk", "duration": 60, "subtitles": {"en": [{"ext": "json3", "url": "manual"}]}, "automatic_captions": {"en": [{"ext": "json3", "url": "automatic"}]}}), patch.object(server, "download_json3", return_value={"events": [{"tStartMs": 1000, "dDurationMs": 2000, "segs": [{"utf8": "Hello "}, {"utf8": "world."}]}]}) as download:
            result = server.captions("abcdefghijk")
            self.assertEqual(download.call_args.args, ("manual",))
            self.assertIn("cookie_jar", download.call_args.kwargs)
            self.assertEqual(result["cues"][0], {"startMs": 1000, "endMs": 3000, "text": "Hello world."})

    def test_missing_subtitles_report_an_explicit_failure(self):
        with patch.object(server, "run_ytdlp", return_value={"id": "abcdefghijk", "duration": 60}):
            with self.assertRaises(server.CaptionError):
                server.captions("abcdefghijk")


if __name__ == "__main__":
    unittest.main()
