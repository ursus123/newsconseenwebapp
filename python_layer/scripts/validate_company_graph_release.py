"""Read-only Company Graph environment release gate.

Run from python_layer:
  python scripts/validate_company_graph_release.py --environment local
  python scripts/validate_company_graph_release.py --environment staging --strict
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import dotenv_values


def _project_ref(value: str | None) -> str | None:
    if not value:
        return None
    host = urlparse(value).hostname or ""
    return host.split(".", 1)[0] or None


def _probe(url: str, path: str, timeout: int = 15) -> dict:
    try:
        response = requests.get(f"{url.rstrip('/')}{path}", timeout=timeout)
        return {"status": "passed" if response.ok else "failed", "http_status": response.status_code}
    except requests.RequestException as error:
        return {"status": "failed", "error_type": type(error).__name__}


def _health(url: str, timeout: int = 15) -> tuple[dict, dict]:
    try:
        response = requests.get(f"{url.rstrip('/')}/health", timeout=timeout)
        payload = response.json() if response.ok else {}
        return (
            {"status": "passed" if response.ok else "failed", "http_status": response.status_code},
            payload if isinstance(payload, dict) else {},
        )
    except (requests.RequestException, ValueError) as error:
        return ({"status": "failed", "error_type": type(error).__name__}, {})


def _check(condition: bool, *, blocked: bool = False, detail: str | None = None) -> dict:
    return {"status": "passed" if condition else ("blocked" if blocked else "failed"), **({"detail": detail} if detail else {})}


def validate(environment: str) -> dict:
    layer = Path(__file__).resolve().parents[1]
    root = layer.parent
    frontend = dotenv_values(root / ".env")
    backend = dotenv_values(layer / ".env")
    frontend_ref = _project_ref(frontend.get("VITE_SUPABASE_URL"))
    backend_ref = _project_ref(backend.get("SUPABASE_URL"))
    checks = {
        "supabase_identity_alignment": _check(bool(frontend_ref and frontend_ref == backend_ref)),
        "migration_sequence": _check(
            (root / "src/migrations/014_canonical_user_person_task_identity.sql").exists(),
        ),
        "authorized_performance_report": _check(
            (layer / "benchmark-authorized-endpoints-final.json").exists(),
        ),
        "desktop_surface_registered": _check("Desktop" in (root / "src/desktop/desktopApps.js").read_text(encoding="utf-8")),
        "mobile_surface_present": _check((root / "src/pages/Mobile.jsx").exists()),
    }
    if environment == "local":
        frontend_url = os.getenv("NEWSCONSEEN_LOCAL_WEB_URL", "http://127.0.0.1:5173")
        backend_url = os.getenv("NEWSCONSEEN_LOCAL_API_URL", "http://127.0.0.1:8001")
        checks["local_frontend"] = _probe(frontend_url, "/CompanyGraphHome")
        backend_check, health = _health(backend_url)
        checks["local_python_backend"] = backend_check
        checks["backup_and_restore_readiness"] = _check(
            bool(health.get("backup_configured") and health.get("last_backup_at")),
            blocked=True,
            detail="A configured backup and a completed backup/restore drill are required",
        )
        checks["monitoring"] = _check(
            bool(os.getenv("SENTRY_DSN") or frontend.get("VITE_SENTRY_DSN") or backend.get("SENTRY_DSN")),
            blocked=True,
            detail="Error capture is not configured",
        )
    else:
        web_url = os.getenv("NEWSCONSEEN_STAGING_WEB_URL", "")
        api_url = os.getenv("NEWSCONSEEN_STAGING_API_URL", "")
        checks["staging_web_domain"] = _probe(web_url, "/CompanyGraphHome") if web_url else _check(False, blocked=True, detail="NEWSCONSEEN_STAGING_WEB_URL is not configured")
        checks["staging_api_domain"] = _probe(api_url, "/health") if api_url else _check(False, blocked=True, detail="NEWSCONSEEN_STAGING_API_URL is not configured")
        checks["synthetic_multi_role_tenant"] = _check(
            bool(os.getenv("NEWSCONSEEN_STAGING_ADMIN_TOKEN") and os.getenv("NEWSCONSEEN_STAGING_MANAGER_TOKEN") and os.getenv("NEWSCONSEEN_STAGING_WORKER_TOKEN") and os.getenv("NEWSCONSEEN_STAGING_TECHNICIAN_TOKEN")),
            blocked=True,
            detail="Four staging acceptance identities are required",
        )
        checks["monitoring"] = _check(
            bool(os.getenv("SENTRY_DSN") or frontend.get("VITE_SENTRY_DSN") or backend.get("SENTRY_DSN")),
            blocked=True,
            detail="Staging error capture must be configured",
        )
    checks["desktop_device_acceptance"] = _check(
        os.getenv("NEWSCONSEEN_DESKTOP_ACCEPTED") == "true",
        blocked=True,
        detail="Set only after the desktop acceptance checklist passes",
    )
    checks["mobile_manager_device_acceptance"] = _check(
        os.getenv("NEWSCONSEEN_MOBILE_MANAGER_ACCEPTED") == "true",
        blocked=True,
        detail="Set only after the mobile-manager device checklist passes",
    )
    checks["mobile_worker_device_acceptance"] = _check(
        os.getenv("NEWSCONSEEN_MOBILE_WORKER_ACCEPTED") == "true",
        blocked=True,
        detail="Set only after the mobile-worker device checklist passes",
    )
    statuses = [item["status"] for item in checks.values()]
    return {
        "contract": "company-graph-release-validation.v1",
        "environment": environment,
        "checks": checks,
        "summary": {
            "passed": statuses.count("passed"),
            "failed": statuses.count("failed"),
            "blocked": statuses.count("blocked"),
        },
        "release_ready": all(status == "passed" for status in statuses),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--environment", choices=("local", "staging"), required=True)
    parser.add_argument("--output")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = validate(args.environment)
    rendered = json.dumps(report, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    if args.strict and not report["release_ready"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
