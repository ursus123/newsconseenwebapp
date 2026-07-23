"""Benchmark the real authorized Company Graph HTTP path.

The bearer token is read only from NEWSCONSEEN_BENCHMARK_TOKEN and is never
written to the report or command-line arguments.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

import requests


TARGETS_MS = {
    "overview": 500,
    "search": 300,
    "neighborhood_1": 250,
    "neighborhood_2": 750,
    "neighborhood_3": 2000,
    "edge_explain": 500,
}


def _request(session, url, headers, *, timeout=90):
    started = time.perf_counter()
    response = session.get(url, headers=headers, timeout=timeout)
    elapsed = (time.perf_counter() - started) * 1000
    if response.status_code >= 400:
        message = ""
        try:
            detail = response.json().get("detail", {})
            message = detail.get("code") or detail.get("message") or ""
        except Exception:
            pass
        raise RuntimeError(f"HTTP {response.status_code} {message}".strip())
    return response.json(), elapsed, len(response.content)


def _measure(session, name, url, headers, repeats):
    samples, sizes = [], []
    for _ in range(repeats):
        _, elapsed, size = _request(session, url, headers)
        samples.append(elapsed)
        sizes.append(size)
    warm = samples[1:] or samples
    ordered = sorted(warm)
    p95_index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * .95) - 1))
    return {
        "endpoint": name,
        "repetitions": repeats,
        "cold_ms": round(samples[0], 2),
        "warm_median_ms": round(statistics.median(warm), 2),
        "warm_p95_ms": round(ordered[p95_index], 2),
        "maximum_ms": round(max(samples), 2),
        "response_bytes": max(sizes),
        "target_ms": TARGETS_MS[name],
        "target_met": ordered[p95_index] <= TARGETS_MS[name],
    }


def run(base_url, company_id, token, *, repeats=20, users=4):
    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    session = requests.Session()
    company = quote(company_id, safe="")
    overview_url = f"{base_url}/company-graph/overview?company_id={company}&node_budget=240&edge_budget=360"
    overview, discovery_ms, _ = _request(session, overview_url, headers)
    nodes, edges = overview.get("nodes", []), overview.get("edges", [])
    if not nodes:
        raise RuntimeError("Authorized overview returned no nodes; seed or select a tenant with graph data")

    center = edges[0].get("source") if edges else nodes[0].get("id")
    center_type, center_id = center.split(":", 1)
    query = next((str(node.get("label", "")) for node in nodes if len(str(node.get("label", "")).strip()) >= 2), "enterprise")
    urls = {
        "overview": overview_url,
        "search": f"{base_url}/company-graph/search?company_id={company}&q={quote(query, safe='')}&limit=25",
    }
    for depth in (1, 2, 3):
        urls[f"neighborhood_{depth}"] = (
            f"{base_url}/company-graph/neighborhood/{quote(center_type, safe='')}/{quote(center_id, safe='')}"
            f"?company_id={company}&depth={depth}&node_budget=160&edge_budget=240"
        )

    neighborhood, _, _ = _request(session, urls["neighborhood_1"], headers)
    explain_edge = next(iter(neighborhood.get("edges", [])), None) or next(iter(edges), None)
    if explain_edge:
        urls["edge_explain"] = (
            f"{base_url}/company-graph/edge/explain?company_id={company}"
            f"&edge_id={quote(explain_edge['id'], safe='')}"
            f"&source={quote(explain_edge['source'], safe='')}"
            f"&target={quote(explain_edge['target'], safe='')}"
        )

    metrics = {}
    for name, url in urls.items():
        try:
            metrics[name] = _measure(session, name, url, headers, repeats)
        except Exception as error:
            raise RuntimeError(f"Endpoint '{name}' failed: {error}") from error

    def concurrent_read(_):
        with requests.Session() as concurrent_session:
            _, elapsed, _ = _request(concurrent_session, overview_url, headers)
            return elapsed

    with ThreadPoolExecutor(max_workers=users) as pool:
        concurrent_samples = list(pool.map(concurrent_read, range(users)))

    required = set(TARGETS_MS)
    measured = set(metrics)
    return {
        "contract": "company-graph-endpoint-benchmark.v1",
        "base_url": base_url,
        "company_id": company_id,
        "authorization": "bearer_token_verified_not_persisted",
        "discovery_ms": round(discovery_ms, 2),
        "selected_center": center,
        "overview_shape": {"nodes": len(nodes), "edges": len(edges)},
        "completeness": overview.get("completeness", {}).get("state"),
        "truncated": overview.get("truncation", {}).get("truncated"),
        "metrics": metrics,
        "concurrent_overview": {
            "users": users,
            "median_ms": round(statistics.median(concurrent_samples), 2),
            "p95_ms": round(max(concurrent_samples), 2),
            "latencies_ms": [round(value, 2) for value in concurrent_samples],
        },
        "coverage": {
            "required": sorted(required),
            "measured": sorted(measured),
            "missing": sorted(required - measured),
        },
        "decision": "endpoint_targets_met" if required <= measured and all(metrics[name]["target_met"] for name in required) else "investigate_endpoint_path",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8001")
    parser.add_argument("--company-id", required=True)
    parser.add_argument("--repeats", type=int, default=20)
    parser.add_argument("--users", type=int, default=4)
    parser.add_argument("--output", default="benchmark-authorized-endpoints.json")
    args = parser.parse_args()
    bearer = os.getenv("NEWSCONSEEN_BENCHMARK_TOKEN", "").strip()
    if not bearer:
        raise SystemExit("Set NEWSCONSEEN_BENCHMARK_TOKEN in this terminal; do not pass it as an argument")
    report = run(args.base_url, args.company_id, bearer, repeats=max(2, args.repeats), users=max(1, args.users))
    rendered = json.dumps(report, indent=2)
    Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
