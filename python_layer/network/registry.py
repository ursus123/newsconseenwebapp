# ==============================================================
# Newsconseen Phase 3C — Network Registry
# ==============================================================
# Maps a network_company_id to the child company_ids it
# is authorised to see.
#
# Supports three membership methods (all active simultaneously):
#
#   Method A — Supabase NetworkMembership entity
#     Operator manually maps children in the UI
#     Most common for franchise / HQ deployments
#
#   Method B — Join code self-registration
#     Network admin generates a join code
#     Child operator enters the join code in their settings
#     Child is added to the network automatically
#     Best for NGO / donor networks at scale
#
#   Method C — Environment variable config
#     NETWORK_MEMBERS_<network_id>=child1,child2,child3
#     Admin-controlled, no UI needed
#     Best for government / regulator deployments
#
# Resolution order: Method A + C are merged (union)
# Method B writes to Method A (Supabase entity)
# ==============================================================

import hashlib
import logging
import os
import secrets
import string
from datetime import datetime, timezone
from typing import Optional

from data_sources import supabase_source

logger = logging.getLogger(__name__)


class NetworkRegistry:
    """
    Resolves which child company_ids a network can see.
    Merges all three membership sources into a single authorised set.
    """

    def __init__(self, network_company_id: str):
        self.network_id = network_company_id

    def get_members(self) -> list[dict]:
        """
        Return all active member companies for this network.
        Each member dict: {company_id, name, enterprise_type, joined_at, source}
        """
        members = {}

        # Method A — Supabase NetworkMembership entity
        for m in self._load_from_canonical_store():
            members[m["company_id"]] = m

        # Method C — environment variable override
        # (Method B writes to Supabase so is already in Method A)
        for m in self._load_from_env():
            if m["company_id"] not in members:
                members[m["company_id"]] = m

        active = [m for m in members.values() if m.get("is_active", True)]
        logger.info(
            "NetworkRegistry: %d active members for network=%s",
            len(active), self.network_id,
        )
        return active

    def get_company_ids(self) -> list[str]:
        """Return just the list of authorised child company_ids."""
        return [m["company_id"] for m in self.get_members()]

    def is_member(self, company_id: str) -> bool:
        """Check if a company_id is an authorised member of this network."""
        return company_id in self.get_company_ids()

    def add_member(
        self,
        company_id:      str,
        name:            str,
        enterprise_type: str = "commercial",
    ) -> bool:
        """
        Add a company to this network (writes to Supabase).
        Called when a child operator redeems a join code.
        """
        try:
            existing = supabase_source.list_records(
                "network_membership", company_id=self.network_id,
                filters={"network_company_id": self.network_id, "child_company_id": company_id},
                limit=1,
            )
            payload = {
                    "company_id": self.network_id,
                    "network_company_id":  self.network_id,
                    "child_company_id":    company_id,
                    "child_name":          name,
                    "child_enterprise_type": enterprise_type,
                    "joined_at":           datetime.now(timezone.utc).isoformat(),
                    "is_active":           True,
                    "source":              "join_code",
            }
            if existing:
                supabase_source.update_record(
                    "network_membership", existing[0]["id"], payload,
                    company_id=self.network_id,
                )
            else:
                supabase_source.create_record(
                    "network_membership", payload, company_id=self.network_id
                )
            logger.info(
                "NetworkRegistry.add_member: added %s to network %s",
                company_id, self.network_id,
            )
            return True

        except Exception as e:
            logger.error("NetworkRegistry.add_member: %s", e)
            return False

    def remove_member(self, company_id: str) -> bool:
        """Deactivate a member (soft delete)."""
        try:
            records = supabase_source.list_records(
                "network_membership", company_id=self.network_id,
                filters={"network_company_id": self.network_id, "child_company_id": company_id},
                limit=10,
            )

            for record in records:
                record_id = record.get("id")
                if record_id:
                    supabase_source.update_record(
                        "network_membership", record_id, {"is_active": False},
                        company_id=self.network_id,
                    )

            logger.info(
                "NetworkRegistry.remove_member: removed %s from network %s",
                company_id, self.network_id,
            )
            return True

        except Exception as e:
            logger.error("NetworkRegistry.remove_member: %s", e)
            return False

    # ----------------------------------------------------------
    # Join code — Method B
    # ----------------------------------------------------------

    @staticmethod
    def generate_join_code(network_company_id: str) -> str:
        """
        Generate a short alphanumeric join code for a network.
        Format: NSW-XXXXX (NSW = Newsconseen, XXXXX = 5 random chars)
        The code encodes the network_id via a deterministic hash prefix
        so it can be validated without a database lookup.
        """
        chars    = string.ascii_uppercase + string.digits
        random_  = "".join(secrets.choice(chars) for _ in range(5))
        checksum = hashlib.sha256(network_company_id.encode()).hexdigest()[:3].upper()
        return f"NSW-{checksum}-{random_}"

    @staticmethod
    def decode_join_code(join_code: str) -> Optional[str]:
        """
        Validate a join code and return the network_company_id it belongs to.
        Returns None if the code is invalid.
        Called when a child operator submits a join code.
        """
        # In production: look up join_code in a JoinCode entity in Supabase
        # that maps code → network_company_id + expiry
        # For now: store and look up via python_layer endpoint
        try:
            records = supabase_source.list_records(
                "network_join_code", filters={"code": join_code, "is_active": True},
                limit=1,
            )

            if not records:
                return None

            record = records[0]

            # Check expiry
            expires_at = record.get("expires_at")
            if expires_at:
                expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if expiry < datetime.now(timezone.utc):
                    return None

            return record.get("network_company_id")

        except Exception as e:
            logger.error("NetworkRegistry.decode_join_code: %s", e)
            return None

    # ----------------------------------------------------------
    # Membership loaders
    # ----------------------------------------------------------

    def _load_from_canonical_store(self) -> list[dict]:
        """Load network members from canonical Supabase records."""
        try:
            records = supabase_source.list_records(
                "network_membership", company_id=self.network_id,
                filters={"network_company_id": self.network_id, "is_active": True},
                limit=500,
            )

            return [
                {
                    "company_id":       r.get("child_company_id"),
                    "name":             r.get("child_name", r.get("child_company_id")),
                    "enterprise_type":  r.get("child_enterprise_type", "commercial"),
                    "joined_at":        r.get("joined_at"),
                    "is_active":        r.get("is_active", True),
                    "source":           "canonical",
                }
                for r in records
                if r.get("child_company_id")
            ]

        except Exception as e:
            logger.debug("NetworkRegistry._load_from_canonical_store: %s", e)
            return []

    def _load_from_env(self) -> list[dict]:
        """
        Load network members from environment variable.
        Format: NETWORK_MEMBERS_<NETWORK_ID>=child1,child2,child3
        Network ID is uppercased and non-alphanumeric chars replaced with _.
        """
        safe_id  = "".join(c if c.isalnum() else "_" for c in self.network_id).upper()
        env_key  = f"NETWORK_MEMBERS_{safe_id}"
        env_val  = os.getenv(env_key, "")

        if not env_val:
            return []

        members = []
        for company_id in env_val.split(","):
            company_id = company_id.strip()
            if company_id:
                members.append({
                    "company_id":      company_id,
                    "name":            company_id,
                    "enterprise_type": "commercial",
                    "joined_at":       None,
                    "is_active":       True,
                    "source":          "env",
                })

        logger.info(
            "NetworkRegistry: loaded %d members from env var %s",
            len(members), env_key,
        )
        return members
