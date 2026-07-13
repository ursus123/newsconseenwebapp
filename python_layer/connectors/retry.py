# ==============================================================
# Shared HTTP retry helper for connector write paths.
# Ports the exponential-backoff pattern already proven in
# etl/base.py's _fetch_with_retry (read-side) to the write side —
# BaseConnector._upsert_record and writeback.py's push handlers had
# no retry at all before this: a single timeout or transient 5xx
# meant an immediate, permanent failure.
# ==============================================================

import logging
import time

import requests

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF = 2.0  # seconds — doubles on each retry
_RETRYABLE_STATUSES = {408, 425, 429, 500, 502, 503, 504}


def request_with_retry(method: str, url: str, **kwargs) -> requests.Response:
    """
    requests.request(method, url, **kwargs) with exponential backoff on
    timeouts, connection errors, and 429/5xx responses. 4xx (other than 429)
    fails immediately — retrying a bad request never helps. Raises the final
    exception/HTTPError once retries are exhausted.
    """
    last_exc: Exception | None = None
    wait = RETRY_BACKOFF

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.request(method, url, **kwargs)
            if resp.status_code in _RETRYABLE_STATUSES and attempt < MAX_RETRIES:
                logger.warning(
                    "request_with_retry: %s %s -> %d, retry %d/%d in %.1fs",
                    method, url, resp.status_code, attempt, MAX_RETRIES, wait,
                )
                time.sleep(wait)
                wait *= 2
                continue
            resp.raise_for_status()
            return resp
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_exc = e
            if attempt < MAX_RETRIES:
                logger.warning(
                    "request_with_retry: %s %s failed (%s), retry %d/%d in %.1fs",
                    method, url, e, attempt, MAX_RETRIES, wait,
                )
                time.sleep(wait)
                wait *= 2
                continue
            raise

    raise last_exc
