"""Dependency-free Apify Actor: fetch only approved public HTTPS pages, no links."""
import http.client
import ipaddress
import json
import os
import re
import socket
import ssl
import time
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

MAX_BYTES = 1_000_000


def public_addresses(host):
    addresses = list(dict.fromkeys(item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)))
    if not addresses or any(not ipaddress.ip_address(addr).is_global
                            or ipaddress.ip_address(addr).is_multicast for addr in addresses):
        raise ValueError("Non-public destination")
    return addresses


class PublicHTTPS(http.client.HTTPSConnection):
    def connect(self):
        # Pin the validated address; a second DNS lookup could resolve privately.
        address = public_addresses(self.host)[0]
        raw = socket.create_connection((address, 443), timeout=self.timeout)
        try:
            self.sock = ssl.create_default_context().wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def approved_url(url, hosts):
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname not in hosts or parsed.username
            or parsed.password or parsed.port not in (None, 443)):
        raise ValueError("Unapproved URL")
    return parsed


def fetch_page(url, hosts):
    original = url
    # Redirects may only remain on the original approved host.
    host = approved_url(url, hosts).hostname
    for _ in range(4):
        parsed = approved_url(url, {host})
        connection = PublicHTTPS(parsed.hostname, timeout=8)
        try:
            path = parsed.path or "/"
            if parsed.query:
                path += "?" + parsed.query
            connection.request("GET", path, headers={
                "User-Agent": "ConvergeEvidence/1.0", "Accept": "text/html,text/plain",
                "Accept-Encoding": "identity",
            })
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                url = urljoin(url, response.getheader("Location", ""))
                continue
            if response.status != 200 or response.getheader("Content-Encoding", "identity") != "identity":
                raise ValueError("Source unavailable")
            if not response.getheader("Content-Type", "").split(";")[0] in ("text/html", "text/plain"):
                raise ValueError("Unsupported content")
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError("Source too large")
            # A redirect can change product identity even on the same host.
            # Return the actual URL so Convex rejects it unless explicitly approved.
            return url if url != original else original, body.decode("utf-8", errors="replace")
        finally:
            connection.close()
    raise ValueError("Too many redirects")


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "template"):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "template"):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def excerpts(body):
    parser = VisibleText()
    parser.feed(body)
    text = re.sub(r"\s+", " ", " ".join(parser.parts)).strip()
    # shortcut: first 20,000 visible characters only; add source-specific extraction if useful facts are omitted.
    return [text[i:i + 4000] for i in range(0, min(len(text), 20000), 4000)]


def api(path, payload=None):
    token = os.environ["APIFY_TOKEN"]
    body = None if payload is None else json.dumps(payload).encode()
    request = Request("https://api.apify.com/v2/" + path, data=body, headers={
        "Authorization": "Bearer " + token, "Content-Type": "application/json",
    })
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def main():
    store = os.environ["ACTOR_DEFAULT_KEY_VALUE_STORE_ID"]
    dataset = os.environ["ACTOR_DEFAULT_DATASET_ID"]
    config = api(f"key-value-stores/{store}/records/INPUT")
    if set(config) != {"urls", "allowedHosts"}:
        raise ValueError("Invalid input")
    urls, hosts = config["urls"], config["allowedHosts"]
    if not isinstance(urls, list) or not 1 <= len(urls) <= 8 or not isinstance(hosts, list):
        raise ValueError("Invalid source count")
    if len(hosts) > 8 or any(not isinstance(host, str) for host in hosts):
        raise ValueError("Invalid hosts")
    rows = []
    started = time.monotonic()
    for url in urls:
        if time.monotonic() - started > 45:
            break
        try:
            resolved, body = fetch_page(url, set(hosts))
            # Exact URL matching preserves variant identity across redirects.
            if resolved != url:
                continue
            rows.extend({"url": url, "excerpt": text, "retrievedAt": int(time.time() * 1000)}
                        for text in excerpts(body))
        except (OSError, ValueError, http.client.HTTPException):
            # No URL, response body, key or source text is written to logs.
            continue
    if rows:
        api(f"datasets/{dataset}/items", rows[:40])


if __name__ == "__main__":
    main()
