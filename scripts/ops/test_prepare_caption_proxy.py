import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location("caption_profile", Path(__file__).with_name("prepare-caption-proxy.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CaptionProxyProfileTests(unittest.TestCase):
    def test_profile_cannot_inherit_system_routing_or_public_listeners(self):
        original = {"proxies": [{"name": "example", "type": "http", "server": "example.com", "port": 443,
                                 "password": "private", "skip-cert-verify": True}],
                    "tun": {"enable": True, "auto-route": True}, "dns": {"enable": True},
                    "allow-lan": True, "external-controller": "0.0.0.0:9090", "redir-port": 7892,
                    "proxy-providers": {"subscription": {"url": "https://private.invalid"}}}
        result = module.caption_profile(original)
        self.assertEqual(result["bind-address"], "127.0.0.1")
        self.assertFalse(result["allow-lan"])
        self.assertFalse(result["tun"]["enable"])
        self.assertFalse(result["dns"]["enable"])
        self.assertFalse(result["proxies"][0]["skip-cert-verify"])
        self.assertEqual(result["proxies"][0]["password"], "private")
        for key in ("external-controller", "proxy-providers", "redir-port", "tproxy-port", "listeners"):
            self.assertNotIn(key, result)
        self.assertTrue(original["proxies"][0]["skip-cert-verify"])

    def test_missing_and_duplicate_nodes_are_rejected(self):
        for source in ({}, {"proxies": [{"name": "same"}, {"name": "same"}]}):
            with self.assertRaises(ValueError):
                module.caption_profile(source)


if __name__ == "__main__":
    unittest.main()
