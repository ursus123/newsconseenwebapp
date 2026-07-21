from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation


TERMINAL_STATUSES = {"completed", "cancelled", "closed", "archived", "void", "voided", "ended"}


def _date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            return None


def _number(value):
    try:
        return Decimal(str(value or 0))
    except InvalidOperation:
        return Decimal(0)


def deterministic_metrics(entity: str, rows: list[dict], *, today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    statuses = Counter(str(row.get("status") or "unspecified").lower() for row in rows)
    result = {"total": len(rows), "by_status": dict(statuses)}

    if entity == "task":
        active = [row for row in rows if str(row.get("status") or "").lower() not in TERMINAL_STATUSES]
        result.update({
            "open": len(active),
            "overdue": sum(bool(_date(row.get("due_date")) and _date(row.get("due_date")) < today) for row in active),
            "due_next_7_days": sum(bool(_date(row.get("due_date")) and today <= _date(row.get("due_date")) <= today + timedelta(days=7)) for row in active),
            "unassigned": sum(not row.get("assigned_to_name") for row in active),
        })
    elif entity == "transaction":
        result.update({
            "total_amount": float(sum((_number(row.get("amount")) for row in rows), Decimal(0))),
            "total_paid": float(sum((_number(row.get("amount_paid")) for row in rows), Decimal(0))),
            "unpaid": sum(str(row.get("payment_status") or "").lower() in {"unpaid", "partial"} for row in rows),
        })
    elif entity == "product":
        result.update({
            "low_stock": sum(_number(row.get("stock_quantity")) <= _number(row.get("reorder_level")) for row in rows),
            "expiring_next_30_days": sum(bool(_date(row.get("expiry_date")) and today <= _date(row.get("expiry_date")) <= today + timedelta(days=30)) for row in rows),
        })
    elif entity == "person":
        result["by_type"] = dict(Counter(str(row.get("person_type") or "unspecified") for row in rows))
        result["active"] = statuses.get("active", 0)
    elif entity == "enterprise":
        result["active"] = statuses.get("active", 0)
        result["by_tier"] = dict(Counter(str(row.get("enterprise_tier") or "unspecified") for row in rows))
    return result
