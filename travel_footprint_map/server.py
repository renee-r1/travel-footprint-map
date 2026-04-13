#!/usr/bin/env python3
"""
本地静态文件 + /api/geocode 代理。
浏览器只请求同源接口，由本机用 urllib 访问 Nominatim/Photon，避免 Failed to fetch（跨域/直连被拦）。

用法:
  python3 server.py
  打开 http://127.0.0.1:8765/
不要用 python -m http.server（无 /api/geocode）。
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "TravelFootprintMapLocal/1.0 (local tool; https://operations.osmfoundation.org/policies/nominatim/)"


def _fetch_json(url: str, extra_headers: dict | None = None) -> dict | list:
    headers = {
        "User-Agent": UA,
        "Accept": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _nominatim_one(query: str) -> tuple[float, float] | None:
    params = urllib.parse.urlencode({"q": query, "format": "json", "limit": "1"})
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    try:
        data = _fetch_json(url, {"Accept-Language": "zh-CN,en"})
        if isinstance(data, list) and data:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            return lat, lon
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError, TypeError, IndexError):
        pass
    return None


def _photon_one(query: str) -> tuple[float, float] | None:
    params = urllib.parse.urlencode({"q": query, "limit": "1", "lang": "zh"})
    url = f"https://photon.komoot.io/api/?{params}"
    try:
        data = _fetch_json(url)
        feats = (data.get("features") or []) if isinstance(data, dict) else []
        if feats:
            lng, lat = feats[0]["geometry"]["coordinates"]
            return float(lat), float(lng)
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError, TypeError, IndexError):
        pass
    return None


def _query_variants(q: str) -> list[str]:
    q = q.strip()
    out: list[str] = [q]
    # 单字地名等容易搜不到，补充国家/英文帮助 OSM 命中
    if "," not in q and "，" not in q:
        out.extend([f"{q}, China", f"{q}, 中国", f"{q}, People's Republic of China"])
    seen: set[str] = set()
    uniq: list[str] = []
    for x in out:
        if x and x not in seen:
            seen.add(x)
            uniq.append(x)
    return uniq


def geocode_query(q: str) -> tuple[float, float]:
    q = q.strip()
    if not q:
        raise ValueError("empty query")

    for variant in _query_variants(q):
        hit = _nominatim_one(variant)
        if hit:
            return hit
    for variant in _query_variants(q):
        hit = _photon_one(variant)
        if hit:
            return hit

    raise LookupError(f"未找到城市：{q}")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/geocode":
            qs = urllib.parse.parse_qs(parsed.query)
            raw = (qs.get("q") or [""])[0]
            q = urllib.parse.unquote(raw) if raw else ""
            try:
                lat, lng = geocode_query(q)
                body = json.dumps({"lat": lat, "lng": lng}, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
            except LookupError as e:
                body = json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8")
                self.send_response(404)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(body)
            except ValueError:
                body = json.dumps({"error": "缺少参数 q"}, ensure_ascii=False).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:  # noqa: BLE001
                msg = str(e) or "geocode failed"
                body = json.dumps({"error": msg}, ensure_ascii=False).encode("utf-8")
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(body)
            return
        super().do_GET()


def main() -> None:
    port = int(os.environ.get("PORT", "8765"))
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving http://127.0.0.1:{port}/  (geocode: /api/geocode?q=城市)")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
