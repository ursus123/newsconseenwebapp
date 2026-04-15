"""
enrichment/compliance/news_mentions.py
-----------------------------------------
Phase C — Entity news mention count and sentiment via GDELT Project.

Source : GDELT DOC 2.0 API — https://api.gdeltproject.org/api/v2/doc/doc
         Free, no API key required. Academic/commercial use permitted.

What it does:
  Search the GDELT global news corpus for mentions of an entity name
  in the past 30 days, return the count and average tone.

Tone interpretation (GDELT's AvgTone field):
  < -3   negative    (adversarial coverage, scandals, legal issues)
  -3–+3  neutral     (routine mentions)
  > +3   positive    (awards, growth, partnerships)

Cache: per normalized entity name, 24 hours.
Rate:  0.5 s between calls; call only for enterprises (not persons).
"""

import json
import logging
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_BASE_URL    = "https://api.gdeltproject.org/api/v2/doc/doc"
_CACHE_TTL   = 86_400   # 24 hours
_MAX_RECORDS = 10       # enough to measure presence without hammering GDELT
_RATE_SLEEP  = 0.5      # seconds between calls

# {normalized_name: {"count": int, "sentiment": str, "loaded_at": float}}
_cache: dict = {}

_last_call: list = [0.0]   # mutable singleton for rate limiter


def _normalize_entity(name: str) -> str:
    """Lowercase, collapse whitespace, strip trailing punctuation."""
    return re.sub(r"\s+", " ", name.strip().lower()).strip(".,;:")


def _rate_limit() -> None:
    elapsed = time.time() - _last_call[0]
    if elapsed < _RATE_SLEEP:
        time.sleep(_RATE_SLEEP - elapsed)
    _last_call[0] = time.time()


def _sentiment_label(avg_tone: float) -> str:
    if avg_tone < -3:   return "negative"
    if avg_tone > 3:    return "positive"
    return "neutral"


def _fetch_gdelt(name: str) -> Optional[dict]:
    """
    Query GDELT for mentions of `name` in last 30 days.
    Returns {"count": int, "sentiment": str, "avg_tone": float} or None.
    """
    _rate_limit()
    try:
        params = urllib.parse.urlencode({
            "query":       f'"{name}"',
            "mode":        "artlist",
            "maxrecords":  _MAX_RECORDS,
            "timespan":    "30d",
            "format":      "json",
        })
        url = f"{_BASE_URL}?{params}"
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())

        articles = data.get("articles", [])
        count    = len(articles)
        if count == 0:
            return {"count": 0, "sentiment": "neutral", "avg_tone": 0.0}

        # GDELT ArticleList entries have a "tone" field (float as string)
        tones = []
        for art in articles:
            tone_raw = art.get("tone")
            if tone_raw is not None:
                try:
                    tones.append(float(tone_raw))
                except (ValueError, TypeError):
                    pass

        avg_tone = round(sum(tones) / len(tones), 3) if tones else 0.0
        return {
            "count":     count,
            "sentiment": _sentiment_label(avg_tone),
            "avg_tone":  avg_tone,
        }

    except Exception as exc:
        logger.debug("news_mentions: GDELT call failed for '%s' — %s", name, exc)
        return None


def get_news_mentions(entity_name: str) -> dict:
    """
    Return news mention data for an entity name.

    Returns
    -------
    {
        news_mention_count : int    (0 if no mentions or GDELT unavailable)
        news_sentiment     : str    positive | neutral | negative
        news_avg_tone      : float  raw GDELT tone score
    }
    Empty dict if entity_name is too short to be meaningful.
    """
    if not entity_name or len(entity_name.strip()) < 4:
        return {}

    # Skip generic short names that would produce meaningless results
    norm = _normalize_entity(entity_name)
    if len(norm) < 4:
        return {}

    now = time.time()
    cached = _cache.get(norm)
    if cached and (now - cached["loaded_at"]) < _CACHE_TTL:
        return {
            "news_mention_count": cached["count"],
            "news_sentiment":     cached["sentiment"],
            "news_avg_tone":      cached.get("avg_tone", 0.0),
        }

    result = _fetch_gdelt(norm)
    if result is not None:
        _cache[norm] = {**result, "loaded_at": now}
        return {
            "news_mention_count": result["count"],
            "news_sentiment":     result["sentiment"],
            "news_avg_tone":      result["avg_tone"],
        }

    return {}
