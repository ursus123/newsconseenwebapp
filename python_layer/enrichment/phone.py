"""
enrichment/phone.py
--------------------
Phone number validation using the `phonenumbers` Python library.
No external API call — fully offline.

Adds: phone_valid, phone_e164, phone_country, phone_carrier,
      phone_line_type, phone_description.
"""

import logging

logger = logging.getLogger(__name__)

try:
    import phonenumbers
    from phonenumbers import carrier as ph_carrier
    from phonenumbers import geocoder as ph_geocoder
    from phonenumbers import PhoneNumberType
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False
    logger.warning("enrichment/phone: 'phonenumbers' not installed — skipping phone enrichment")

_LINE_TYPE_MAP = {}
if _AVAILABLE:
    _LINE_TYPE_MAP = {
        PhoneNumberType.MOBILE:              "mobile",
        PhoneNumberType.FIXED_LINE:          "fixed_line",
        PhoneNumberType.FIXED_LINE_OR_MOBILE:"mobile",
        PhoneNumberType.TOLL_FREE:           "toll_free",
        PhoneNumberType.PREMIUM_RATE:        "premium",
        PhoneNumberType.VOIP:                "voip",
        PhoneNumberType.PERSONAL_NUMBER:     "personal",
        PhoneNumberType.PAGER:               "pager",
        PhoneNumberType.UAN:                 "uan",
        PhoneNumberType.SHARED_COST:         "shared_cost",
    }


def validate_phone(phone_str: str, default_region: str = None) -> dict:
    """
    Parse and validate a phone number string.
    Accepts formats: +254712345678, 0712345678, 254712345678.
    Returns enrichment dict.
    """
    if not _AVAILABLE:
        return {"enrichment_status": "skipped", "reason": "phonenumbers_missing"}

    raw = str(phone_str or "").strip()
    if not raw or len(raw) < 6:
        return {"phone_valid": False, "enrichment_status": "skipped", "reason": "too_short"}

    # Normalise: add + if purely numeric and looks international
    if raw.isdigit() and len(raw) >= 10:
        raw = "+" + raw
    elif not raw.startswith("+") and raw.startswith("0") and len(raw) >= 9:
        # Local format — can't parse without region, skip + prefix
        pass

    try:
        parsed    = phonenumbers.parse(raw, default_region)
        is_valid  = phonenumbers.is_valid_number(parsed)
        is_poss   = phonenumbers.is_possible_number(parsed)
        country   = phonenumbers.region_code_for_number(parsed) or ""
        carrier_n = ph_carrier.name_for_number(parsed, "en") or ""
        desc      = ph_geocoder.description_for_number(parsed, "en") or ""
        num_type  = phonenumbers.number_type(parsed)
        line_type = _LINE_TYPE_MAP.get(num_type, "unknown")

        e164 = None
        if is_valid:
            e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)

        return {
            "phone_valid":       is_valid,
            "phone_possible":    is_poss,
            "phone_e164":        e164,
            "phone_country":     country,
            "phone_carrier":     carrier_n,
            "phone_description": desc,
            "phone_line_type":   line_type,
            "enrichment_status": "enriched" if is_valid else "invalid",
        }
    except Exception as e:
        logger.debug("validate_phone(%s): %s", phone_str, e)
        return {"phone_valid": False, "enrichment_status": "parse_error", "reason": str(e)[:120]}
