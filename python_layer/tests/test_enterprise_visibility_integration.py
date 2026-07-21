"""Opt-in real Supabase read-after-write test.

Run only in a disposable/test tenant:
  RUN_SUPABASE_WRITE_TESTS=1
  SUPABASE_TEST_ACCESS_TOKEN=<short-lived user token>
  SUPABASE_TEST_COMPANY_ID=<tenant id>
"""
import os
import uuid

import pytest

from data_sources import supabase_source


@pytest.mark.skipif(os.getenv("RUN_SUPABASE_WRITE_TESTS") != "1", reason="real Supabase writes are opt-in")
def test_real_enterprise_is_immediately_visible_to_idjwi_context(client):
    token = os.environ["SUPABASE_TEST_ACCESS_TOKEN"]
    company_id = os.environ["SUPABASE_TEST_COMPANY_ID"]
    name = f"Idjwi visibility test {uuid.uuid4()}"
    record_id = None
    try:
        created = client.post(
            "/tenant-context/entities/enterprise",
            headers={"Authorization": f"Bearer {token}"},
            json={"company_id": company_id, "enterprise_name": name, "enterprise_type": "commercial", "enterprise_tier": "unit"},
        )
        assert created.status_code == 201, created.text
        receipt = created.json()
        record_id = receipt["record"]["id"]
        assert receipt["visibility"]["read_after_write_verified"] is True

        context = client.get(
            f"/copilot/context?company_id={company_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert context.status_code == 200, context.text
        assert any(item.get("id") == record_id for item in context.json()["enterprises"])
    finally:
        if record_id:
            # Exact, test-created record only.
            supabase_source.delete_record("enterprises", record_id)
