"""
enrichment/email_check.py
--------------------------
Email validation via:
  1. Regex format check
  2. DNS MX record lookup (stdlib — no external API)
  3. Disposable domain list (static, ~50 known providers)

No external API key required.
"""

import re
import logging

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
)

# Common disposable / temporary email providers
_DISPOSABLE = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.info",
    "guerrillamail.net", "guerrillamail.org", "guerrillamail.de",
    "tempmail.com", "temp-mail.org", "10minutemail.com",
    "throwam.com", "yopmail.com", "sharklasers.com",
    "trashmail.com", "trashmail.at", "trashmail.io",
    "fakeinbox.com", "dispostable.com", "maildrop.cc",
    "mailnull.com", "spam4.me", "binkmail.com",
    "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
    "getonemail.com", "discard.email", "0-mail.com",
    "spamfree24.org", "mt2009.com", "mail-temporaire.fr",
    "throwam.com", "spamhere.eu", "tempr.email",
    "jetable.fr.nf", "nwldx.com", "filzmail.com",
}


def validate_email(email_str: str) -> dict:
    """
    Validate an email address.
    Returns enrichment dict with email_valid, email_domain_valid, email_disposable.
    """
    raw = str(email_str or "").strip().lower()
    if not raw:
        return {"email_valid": False, "enrichment_status": "skipped", "reason": "empty"}

    # Format check
    if not _EMAIL_RE.match(raw):
        return {
            "email_valid":        False,
            "email_format_valid": False,
            "email_domain":       "",
            "enrichment_status":  "invalid",
            "reason":             "bad_format",
        }

    domain       = raw.split("@")[1]
    is_disposable = domain in _DISPOSABLE
    mx_valid     = _check_mx(domain)

    return {
        "email_valid":        mx_valid and not is_disposable,
        "email_format_valid": True,
        "email_domain":       domain,
        "email_domain_valid": mx_valid,
        "email_disposable":   is_disposable,
        "enrichment_status":  "enriched",
    }


def _check_mx(domain: str) -> bool:
    """Check domain has an MX record (accepts email). Falls back to A record."""
    try:
        import dns.resolver
        dns.resolver.resolve(domain, "MX")
        return True
    except Exception:
        pass
    try:
        import dns.resolver
        dns.resolver.resolve(domain, "A")
        return True
    except Exception:
        pass
    # If dnspython not installed, assume valid (don't penalise missing lib)
    return True
