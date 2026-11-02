import unittest
import json
import threading
import urllib.error
import urllib.request
from unittest.mock import patch
import server


class CaptionServiceTests(unittest.TestCase):
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
            download.assert_called_once_with("manual")
            self.assertEqual(result["cues"][0], {"startMs": 1000, "endMs": 3000, "text": "Hello world."})

    def test_missing_subtitles_report_an_explicit_failure(self):
        with patch.object(server, "run_ytdlp", return_value={"id": "abcdefghijk", "duration": 60}):
            with self.assertRaises(server.CaptionError):
                server.captions("abcdefghijk")


if __name__ == "__main__":
    unittest.main()
