"""
reliability.py
---------------
Retry and circuit-breaker utilities for python_layer.

Used to protect calls to external APIs (Base44, OFAC, World Bank, GDELT, etc.)
from transient failures without cascading timeouts.

Usage:
    from reliability import retry, circuit_breaker, with_timeout

    # Retry up to 3 times with exponential backoff
    @retry(max_attempts=3, backoff_base=1.5)
    def fetch_from_base44(url):
        return requests.get(url, timeout=10).json()

    # Circuit breaker — opens after 5 consecutive failures, resets after 60s
    @circuit_breaker(name="ofac_sdn", failure_threshold=5, reset_timeout=60)
    def screen_sanctions(name):
        ...

    # Combine both
    @retry(max_attempts=2)
    @circuit_breaker(name="gdelt")
    def get_news(entity):
        ...
"""

from __future__ import annotations

import functools
import logging
import time
import threading
from typing import Callable, Type

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Retry decorator
# ---------------------------------------------------------------------------

def retry(
    max_attempts: int = 3,
    backoff_base: float = 2.0,
    backoff_max: float = 30.0,
    exceptions: tuple[Type[Exception], ...] = (Exception,),
    on_retry: Callable | None = None,
):
    """
    Decorator: retry a function up to max_attempts times with exponential backoff.

    Parameters
    ----------
    max_attempts   Max number of attempts (1 = no retry).
    backoff_base   Seconds to wait after first failure; doubles each attempt.
    backoff_max    Cap on wait time between retries.
    exceptions     Tuple of exception types to catch. Others propagate immediately.
    on_retry       Optional callable(attempt, exc, wait) called before each retry.
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            last_exc: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    if attempt == max_attempts:
                        break
                    wait = min(backoff_base * (2 ** (attempt - 1)), backoff_max)
                    if on_retry:
                        on_retry(attempt, exc, wait)
                    logger.debug(
                        "retry: %s attempt %d/%d failed (%s), waiting %.1fs",
                        fn.__name__, attempt, max_attempts, exc, wait
                    )
                    time.sleep(wait)
            raise last_exc  # type: ignore[misc]
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

_CIRCUIT_STATES: dict[str, "_CircuitState"] = {}
_CIRCUIT_LOCK = threading.Lock()


class _CircuitState:
    """Thread-safe state machine for a named circuit breaker."""

    CLOSED   = "closed"    # normal — requests pass through
    OPEN     = "open"      # failing — requests blocked immediately
    HALF_OPEN = "half_open" # testing — one request allowed through

    def __init__(self, name: str, failure_threshold: int, reset_timeout: float):
        self.name              = name
        self.failure_threshold = failure_threshold
        self.reset_timeout     = reset_timeout
        self._state            = self.CLOSED
        self._failure_count    = 0
        self._opened_at: float | None = None
        self._lock             = threading.Lock()

    @property
    def state(self) -> str:
        with self._lock:
            if self._state == self.OPEN:
                elapsed = time.monotonic() - (self._opened_at or 0)
                if elapsed >= self.reset_timeout:
                    self._state = self.HALF_OPEN
                    logger.info("circuit_breaker[%s]: HALF-OPEN (testing)", self.name)
            return self._state

    def record_success(self):
        with self._lock:
            self._failure_count = 0
            self._state         = self.CLOSED
            self._opened_at     = None

    def record_failure(self):
        with self._lock:
            self._failure_count += 1
            if self._failure_count >= self.failure_threshold:
                self._state     = self.OPEN
                self._opened_at = time.monotonic()
                logger.warning(
                    "circuit_breaker[%s]: OPEN after %d failures",
                    self.name, self._failure_count
                )

    def to_dict(self) -> dict:
        return {
            "name":            self.name,
            "state":           self.state,
            "failure_count":   self._failure_count,
            "failure_threshold": self.failure_threshold,
            "opened_at":       self._opened_at,
        }


class CircuitOpenError(Exception):
    """Raised when a circuit breaker is open and a call is blocked."""
    pass


def circuit_breaker(
    name: str,
    failure_threshold: int = 5,
    reset_timeout: float = 60.0,
):
    """
    Decorator: circuit breaker pattern for external API calls.

    Opens after `failure_threshold` consecutive failures.
    After `reset_timeout` seconds, transitions to HALF-OPEN to test recovery.
    On success in HALF-OPEN state, closes the circuit again.

    Parameters
    ----------
    name               Unique name for this circuit (used in logs + state dict).
    failure_threshold  Consecutive failures before opening.
    reset_timeout      Seconds to wait before attempting recovery.
    """
    def decorator(fn: Callable) -> Callable:
        with _CIRCUIT_LOCK:
            if name not in _CIRCUIT_STATES:
                _CIRCUIT_STATES[name] = _CircuitState(
                    name, failure_threshold, reset_timeout
                )
        state = _CIRCUIT_STATES[name]

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            current = state.state
            if current == _CircuitState.OPEN:
                raise CircuitOpenError(
                    f"Circuit '{name}' is OPEN — call blocked to prevent cascading failures"
                )
            try:
                result = fn(*args, **kwargs)
                state.record_success()
                return result
            except CircuitOpenError:
                raise
            except Exception as exc:
                state.record_failure()
                raise

        return wrapper
    return decorator


def get_circuit_states() -> dict[str, dict]:
    """Return a snapshot of all registered circuit breaker states."""
    return {name: s.to_dict() for name, s in _CIRCUIT_STATES.items()}


# ---------------------------------------------------------------------------
# Timeout wrapper (for sync code only — not async)
# ---------------------------------------------------------------------------

def with_timeout(fn: Callable, seconds: float, *args, **kwargs):
    """
    Run `fn(*args, **kwargs)` with a wall-clock timeout.
    Raises TimeoutError if the function takes longer than `seconds`.

    Note: uses threading — safe for I/O-bound calls.
    Works in sync FastAPI endpoints (not in async def).
    """
    result = [None]
    error  = [None]

    def _run():
        try:
            result[0] = fn(*args, **kwargs)
        except Exception as exc:
            error[0] = exc

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=seconds)

    if t.is_alive():
        raise TimeoutError(
            f"{fn.__name__} timed out after {seconds}s"
        )
    if error[0] is not None:
        raise error[0]
    return result[0]
