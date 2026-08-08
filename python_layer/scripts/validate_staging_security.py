"""Validate staging TLS, browser headers, CORS, assets, and legacy traffic."""

from __future__ import annotations

import hashlib
import json
import re
import socket
import ssl
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests


ROOT = Path(__file__).resolve().parents[2]
WEB = "https://staging.news-con-seen.com"
API = "https://staging-api.news-con-seen.com"
LEGACY = re.compile(rb"base44|base44\.onrender\.com|app\.base44\.com", re.I)
# Detect credential-shaped values, not harmless documentation labels such as
# DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY shown in administrator help text.
SECRET = re.compile(rb"postgres(?:ql)?://[^\s\"']+:[^\s\"']+@", re.I)


def configured_server_secrets() -> list[bytes]:
    values = []
    for path in (ROOT / "python_layer" / ".env", ROOT / ".env.local", ROOT / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            key, value = line.split("=", 1)
            if key.strip() in {"SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "RESTORE_TEST_DATABASE_URL"}:
                value = value.strip().strip("\"'")
                if len(value) >= 20:
                    values.append(value.encode())
    return values


def result(name, passed, evidence):
    return {"scenario": name, "status": "pass" if passed else "fail", "evidence": evidence}


def certificate(host: str) -> dict:
    context = ssl.create_default_context()
    with socket.create_connection((host, 443), timeout=15) as raw:
        with context.wrap_socket(raw, server_hostname=host) as connection:
            cert = connection.getpeercert()
            return {"subject": cert.get("subject"), "issuer": cert.get("issuer"), "notAfter": cert.get("notAfter")}


def main() -> int:
    checks = []
    bodies = []
    for label, url in (("web", WEB), ("api", f"{API}/health")):
        response = requests.get(url, timeout=30, allow_redirects=True)
        headers = {key.lower(): value for key, value in response.headers.items()}
        bodies.append((response.url, response.content))
        checks.append(result(f"https.{label}", response.status_code == 200 and response.url.startswith("https://"),
                             {"status": response.status_code, "url": response.url, "certificate": certificate(urlparse(response.url).hostname)}))
        required = ["strict-transport-security", "content-security-policy", "x-content-type-options", "referrer-policy", "permissions-policy"]
        if label == "web":
            required.append("x-frame-options")
        missing = [name for name in required if not headers.get(name)]
        checks.append(result(f"headers.{label}", not missing, {"missing": missing, "present": sorted(set(required) - set(missing))}))

    html = bodies[0][1].decode("utf-8", errors="ignore")
    assets = sorted(set(re.findall(r'(?:src|href)=["\']([^"\']+\.(?:js|css)(?:\?[^"\']*)?)["\']', html)))
    for asset in assets:
        response = requests.get(urljoin(WEB, asset), timeout=30)
        bodies.append((response.url, response.content))
    legacy_hits = [url for url, body in bodies if LEGACY.search(body)]
    exact_secrets = configured_server_secrets()
    secret_hits = [url for url, body in bodies if SECRET.search(body) or any(secret in body for secret in exact_secrets)]
    checks.append(result("assets.zero_legacy_platform", not legacy_hits, {"assets_scanned": len(bodies), "hits": legacy_hits}))
    checks.append(result("assets.no_server_secrets", not secret_hits, {"assets_scanned": len(bodies), "hits": secret_hits}))
    mixed = re.findall(r'["\']http://[^"\']+', html, flags=re.I)
    checks.append(result("browser.no_mixed_content", not mixed, {"http_references": mixed[:10]}))

    trusted = requests.options(f"{API}/company-graph/overview", headers={
        "Origin": WEB, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization",
    }, timeout=30)
    hostile = requests.options(f"{API}/company-graph/overview", headers={
        "Origin": "https://attacker.invalid", "Access-Control-Request-Method": "GET",
    }, timeout=30)
    checks.append(result("cors.trusted_origin", trusted.headers.get("access-control-allow-origin") == WEB,
                         {"status": trusted.status_code, "allow_origin": trusted.headers.get("access-control-allow-origin")}))
    checks.append(result("cors.untrusted_origin_rejected", hostile.headers.get("access-control-allow-origin") is None,
                         {"status": hostile.status_code, "allow_origin": hostile.headers.get("access-control-allow-origin")}))

    report = {
        "contract": "newsconseen-browser-security.v1", "environment": "staging",
        "checks": checks,
        "summary": {"passed": sum(c["status"] == "pass" for c in checks), "failed": sum(c["status"] == "fail" for c in checks)},
        "evidence_digest": hashlib.sha256(json.dumps(checks, sort_keys=True, default=str).encode()).hexdigest(),
    }
    output = ROOT / "artifacts" / "staging-security.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))
    return 1 if report["summary"]["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
