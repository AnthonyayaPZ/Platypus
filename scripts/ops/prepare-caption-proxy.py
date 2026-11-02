"""Create a private, explicit-proxy-only profile from an operator's local profile.

Requires PyYAML on the server. Never prints subscription URLs or node credentials.
No TUN, DNS listener, controller, provider download or system routing is enabled.
"""
import argparse
import copy
import os
from pathlib import Path

import yaml


def caption_profile(source):
    if not isinstance(source, dict):
        raise ValueError("The operator profile must be a mapping")
    proxies = copy.deepcopy(source.get("proxies", []))
    if not proxies or not all(isinstance(proxy, dict) and proxy.get("name") for proxy in proxies):
        raise ValueError("The operator profile must contain inline named proxies")
    for proxy in proxies:
        # Do not inherit insecure TLS settings from an unrelated application.
        proxy["skip-cert-verify"] = False
    names = [proxy["name"] for proxy in proxies]
    if len(set(names)) != len(names) or "CAPTIONS-EGRESS" in names:
        raise ValueError("Proxy names must be unique")
    return {
        "mixed-port": 17890,
        "bind-address": "127.0.0.1",
        "allow-lan": False,
        "mode": "rule",
        "log-level": "silent",
        "ipv6": False,
        "tun": {"enable": False},
        "dns": {"enable": False},
        "sniffer": {"enable": False},
        "profile": {"store-selected": False, "store-fake-ip": False},
        "proxies": proxies,
        "proxy-groups": [{"name": "CAPTIONS-EGRESS", "type": "url-test", "proxies": names,
                          "url": "https://www.gstatic.com/generate_204", "interval": 1800,
                          "tolerance": 100, "lazy": True}],
        "rules": ["MATCH,CAPTIONS-EGRESS"],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    try:
        profile = caption_profile(yaml.safe_load(args.source.read_text()))
    except yaml.YAMLError:
        raise SystemExit("Invalid operator YAML; input details omitted to protect credentials") from None
    except ValueError as error:
        raise SystemExit(str(error)) from None
    # Refuse to overwrite an existing private profile; operators back it up first.
    fd = os.open(args.destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        yaml.safe_dump(profile, output, allow_unicode=True, sort_keys=False)
    print(f"Created loopback-only profile with {len(profile['proxies'])} existing nodes; credentials not displayed")
