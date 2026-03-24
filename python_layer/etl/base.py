import logging
import time

import pandas as pd
import requests

from config import HEADERS

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Request configuration
# ----------------------------------------------------------
REQUEST_TIMEOUT = 30        # seconds before a single request gives up
MAX_RETRIES = 3             # total attempts before raising
RETRY_BACKOFF = 2.0         # seconds — doubles on each retry (exponential)

# ----------------------------------------------------------
# Pagination configuration
# Base44 uses 'limit' and 'skip' query params.
# We fetch pages until a page comes back with fewer records
# than the page size, which signals the last page.
# ----------------------------------------------------------
PAGE_SIZE = 500


def fetch_json_to_df(url: str, params: dict | None = None) -> pd.DataFrame:
    """
    Fetch all records from a Base44 entity URL and return as a DataFrame.

    Handles:
        - Timeouts          (REQUEST_TIMEOUT seconds per request)
        - Retries           (MAX_RETRIES attempts with exponential backoff)
        - Pagination        (fetches all pages until exhausted)
        - Empty responses   (returns empty DataFrame with no columns)
        - Logging           (records count on success, error on failure)

    Args:
        url:    Base44 entity endpoint URL from config.settings
        params: Optional extra query params merged with pagination params

    Returns:
        DataFrame of all records. Empty DataFrame if none found.
    """
    all_records: list[dict] = []
    skip = 0

    while True:
        page_params = {"limit": PAGE_SIZE, "skip": skip}
        if params:
            page_params.update(params)

        page = _fetch_with_retry(url, page_params)

        if not page:
            break

        all_records.extend(page)

        if len(page) < PAGE_SIZE:
            break

        skip += PAGE_SIZE

    if not all_records:
        logger.warning("fetch_json_to_df: no records returned from %s", url)
        return pd.DataFrame()

    df = pd.DataFrame(all_records)
    logger.info(
        "fetch_json_to_df: fetched %d records (%d columns) from %s",
        len(df), len(df.columns), url,
    )
    return df


def _fetch_with_retry(url: str, params: dict) -> list[dict]:
    """
    GET a single page from url with retry + exponential backoff.

    Returns a list of record dicts.
    Raises the last exception if all retries are exhausted.
    """
    last_exc: Exception | None = None
    wait = RETRY_BACKOFF

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(
                url,
                headers=HEADERS,
                params=params,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()

            # Base44 may return a list directly or wrap in {"data": [...]}
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                for key in ("data", "results", "items", "records"):
                    if key in data and isinstance(data[key], list):
                        return data[key]
                # Single object response — wrap in list
                return [data]

            return []

        except requests.exceptions.Timeout:
            last_exc = TimeoutError(
                f"Base44 request timed out after {REQUEST_TIMEOUT}s "
                f"(attempt {attempt}/{MAX_RETRIES}): {url}"
            )
            logger.warning(str(last_exc))

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else "unknown"

            # 429 rate limited — always retry with backoff
            # 5xx server errors — retry
            # 4xx client errors (except 429) — don't retry, raise immediately
            if status not in (429,) and isinstance(status, int) and status < 500:
                logger.error(
                    "Base44 client error %s for %s — not retrying", status, url
                )
                raise

            last_exc = e
            logger.warning(
                "Base44 HTTP %s on attempt %d/%d for %s",
                status, attempt, MAX_RETRIES, url,
            )

        except requests.exceptions.RequestException as e:
            last_exc = e
            logger.warning(
                "Base44 request error on attempt %d/%d for %s: %s",
                attempt, MAX_RETRIES, url, e,
            )

        if attempt < MAX_RETRIES:
            logger.info("Retrying in %.1fs...", wait)
            time.sleep(wait)
            wait *= 2

    logger.error(
        "fetch_json_to_df: all %d attempts failed for %s", MAX_RETRIES, url
    )
    raise last_exc
