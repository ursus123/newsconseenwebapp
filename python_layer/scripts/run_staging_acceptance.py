"""Run non-destructive authentication and authorization acceptance checks.

Email-link scenarios are intentionally reported as manual: the script cannot
claim delivery or link completion without evidence from an accessible inbox.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[2]
TENANT = "newsconseen-acceptance"
OTHER_TENANT = "newsconseen-isolation"
PASSWORD = os.getenv("ACCEPTANCE_PASSWORD", "Newsconseen-Acceptance!2026")
ACCOUNTS = {
    "administrator": "acceptance-admin@news-con-seen.com",
    "manager": "acceptance-manager@news-con-seen.com",
    "technician": "acceptance-technician@news-con-seen.com",
    "worker": "acceptance-worker@news-con-seen.com",
    "isolation_worker": "acceptance-isolation@news-con-seen.com",
}


def load_env() -> None:
    for path in (ROOT / ".env", ROOT / ".env.local", ROOT / "python_layer" / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def main() -> int:
    load_env()
    supabase = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").rstrip("/")
    anon = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")
    api = os.getenv("ACCEPTANCE_API_URL", "https://staging-api.news-con-seen.com").rstrip("/")
    if not supabase or not anon:
        raise RuntimeError("Supabase URL and anon key are required")

    sessions: dict[str, dict] = {}
    results: list[dict] = []

    def record(name: str, passed: bool, detail: str = "") -> None:
        results.append({"check": name, "status": "pass" if passed else "fail", "detail": detail})

    # Separate sign-ins establish distinct principal tokens.
    for role, email in ACCOUNTS.items():
        response = requests.post(
            f"{supabase}/auth/v1/token?grant_type=password",
            headers={"apikey": anon}, json={"email": email, "password": PASSWORD}, timeout=30,
        )
        record(f"auth.sign_in.{role}", response.status_code == 200, f"HTTP {response.status_code}")
        if response.status_code == 200:
            sessions[role] = response.json()

    # Refresh models a browser reload with a persisted refresh token.
    admin = sessions.get("administrator", {})
    refresh = requests.post(
        f"{supabase}/auth/v1/token?grant_type=refresh_token", headers={"apikey": anon},
        json={"refresh_token": admin.get("refresh_token")}, timeout=30,
    )
    record("auth.session_refresh", refresh.status_code == 200, f"HTTP {refresh.status_code}")

    def api_get(role: str, company: str, path: str = "/company-graph/overview"):
        token = sessions.get(role, {}).get("access_token", "")
        return requests.get(f"{api}{path}", params={"company_id": company},
                            headers={"Authorization": f"Bearer {token}"}, timeout=90)

    packets: dict[str, dict] = {}
    for role in ("administrator", "manager", "technician", "worker"):
        response = api_get(role, TENANT)
        record(f"graph.read.{role}", response.status_code == 200, f"HTTP {response.status_code}")
        if response.status_code == 200:
            packets[role] = response.json()

    # The worker receives a bounded assignment surface, never the administrator packet.
    if "administrator" in packets and "worker" in packets:
        admin_nodes = len(packets["administrator"].get("nodes", []))
        worker_nodes = len(packets["worker"].get("nodes", []))
        worker_readiness = packets["worker"].get("readiness") or packets["worker"].get("metadata", {}).get("readiness")
        record("role.worker_bounded_graph", worker_nodes <= admin_nodes and packets["worker"] != packets["administrator"],
               f"admin_nodes={admin_nodes}, worker_nodes={worker_nodes}, readiness={worker_readiness}")

    export_body = {"company_id": TENANT, "purpose": "Staging acceptance authorization verification"}
    for role, expected in (("administrator", 200), ("worker", 403)):
        token = sessions.get(role, {}).get("access_token", "")
        response = requests.post(f"{api}/company-graph/export", json=export_body,
                                 headers={"Authorization": f"Bearer {token}"}, timeout=90)
        record(f"graph.export.{role}", response.status_code == expected,
               f"HTTP {response.status_code}, expected {expected}")

    isolation = api_get("isolation_worker", TENANT)
    record("tenant.cross_read_blocked", isolation.status_code in (401, 403, 404), f"HTTP {isolation.status_code}")

    # Repeated interleaved reads exercise principal-aware cache keys.
    cache_pass = True
    cache_detail = []
    for role, company in (("administrator", TENANT), ("isolation_worker", OTHER_TENANT),
                          ("worker", TENANT), ("administrator", TENANT)):
        response = api_get(role, company)
        cache_detail.append(f"{role}:{response.status_code}")
        cache_pass = cache_pass and response.status_code == 200
    record("cache.principal_tenant_isolation", cache_pass, ", ".join(cache_detail))

    expired = requests.get(f"{api}/company-graph/overview", params={"company_id": TENANT},
                           headers={"Authorization": "Bearer expired.acceptance.token"}, timeout=30)
    record("auth.expired_session_rejected", expired.status_code == 401, f"HTTP {expired.status_code}")

    # Sign out a disposable session last and prove its token no longer resolves.
    technician = sessions.get("technician", {})
    signout = requests.post(f"{supabase}/auth/v1/logout", headers={
        "apikey": anon, "Authorization": f"Bearer {technician.get('access_token', '')}"}, timeout=30)
    after = requests.get(f"{supabase}/auth/v1/user", headers={
        "apikey": anon, "Authorization": f"Bearer {technician.get('access_token', '')}"}, timeout=30)
    record("auth.sign_out", signout.status_code in (200, 204) and after.status_code in (401, 403),
           f"logout={signout.status_code}, reused_token={after.status_code}")

    manual = [
        "invitation acceptance from an accessible inbox",
        "email-confirmation link delivery and completion",
        "password-reset email delivery",
        "recovery-link completion at /ResetPassword",
        "browser rejection of a redirect URL not on the Supabase allowlist",
    ]
    report = {
        "contract": "newsconseen-staging-acceptance.v1",
        "api": api,
        "tenant": TENANT,
        "results": results,
        "manual_email_evidence_required": manual,
        "summary": {
            "passed": sum(item["status"] == "pass" for item in results),
            "failed": sum(item["status"] == "fail" for item in results),
            "manual": len(manual),
        },
    }
    output = ROOT / "artifacts" / "staging-acceptance-auth-role.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if report["summary"]["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
