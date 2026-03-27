# ==============================================================
# config/__init__.py
# Re-exports settings and taxonomy so existing imports work.
#
# Existing code that says:
#   from config import settings
#   from config import HEADERS
#   from config import NOMINATIM_USER_AGENT
# continues to work without change.
#
# New code should use explicit imports:
#   from config.settings import settings, HEADERS
#   from config.taxonomy import normalize_person_type, ...
# ==============================================================

from config.settings import settings, HEADERS, NOMINATIM_USER_AGENT
from config.taxonomy import (
    # Person
    PERSON_TYPES,
    PERSON_TYPE_MAP,
    PERSON_TYPE_SETS,
    PERSON_SUBTYPES,
    ACTIVE_STATUSES,
    INACTIVE_STATUSES,
    normalize_person_type,
    classify_person_type,
    get_person_type_set,
    # Enterprise
    ENTERPRISE_TYPES,
    ENTERPRISE_TYPE_MAP,
    SIC_SECTORS,
    SUBTYPE_SECTOR_MAP,
    ENTERPRISE_ACTIVE_STATUSES,
    ENTERPRISE_INACTIVE_STATUSES,
    normalize_enterprise_type,
    get_sector_for_subtype,
    # Item
    ITEM_TYPES,
    ITEM_TYPE_MAP,
    ITEM_TYPE_SETS,
    ITEM_SUBTYPES,
    PERISHABLE_SUBTYPES,
    CONTROLLED_SUBTYPES,
    EQUIPMENT_SUBTYPES,
    ITEM_ACTIVE_STATUSES,
    ITEM_INACTIVE_STATUSES,
    normalize_item_type,
    classify_item_type,
    get_item_type_set,
    is_perishable,
    is_controlled,
    is_equipment,
    # Relationship
    RELATIONSHIP_TYPES,
    RELATIONSHIP_ACTIVE_STATUSES,
    RELATIONSHIP_ENDED_STATUSES,
)

__all__ = [
    "settings", "HEADERS", "NOMINATIM_USER_AGENT",
    "PERSON_TYPES", "PERSON_TYPE_MAP", "PERSON_TYPE_SETS", "PERSON_SUBTYPES",
    "ACTIVE_STATUSES", "INACTIVE_STATUSES",
    "normalize_person_type", "classify_person_type", "get_person_type_set",
    "ENTERPRISE_TYPES", "ENTERPRISE_TYPE_MAP", "SIC_SECTORS", "SUBTYPE_SECTOR_MAP",
    "ENTERPRISE_ACTIVE_STATUSES", "ENTERPRISE_INACTIVE_STATUSES",
    "normalize_enterprise_type", "get_sector_for_subtype",
    "ITEM_TYPES", "ITEM_TYPE_MAP", "ITEM_TYPE_SETS", "ITEM_SUBTYPES",
    "PERISHABLE_SUBTYPES", "CONTROLLED_SUBTYPES", "EQUIPMENT_SUBTYPES",
    "ITEM_ACTIVE_STATUSES", "ITEM_INACTIVE_STATUSES",
    "normalize_item_type", "classify_item_type", "get_item_type_set",
    "is_perishable", "is_controlled", "is_equipment",
    "RELATIONSHIP_TYPES", "RELATIONSHIP_ACTIVE_STATUSES", "RELATIONSHIP_ENDED_STATUSES",
]
