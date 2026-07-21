from pathlib import Path


SCHEMA = Path(__file__).resolve().parents[2] / "src" / "migrations" / "001_supabase_schema.sql"


def test_core_tenant_tables_enable_rls():
    sql = SCHEMA.read_text(encoding="utf-8").lower()
    for table in ("user_profiles", "persons", "enterprises", "tasks", "transactions"):
        assert f"alter table {table}" in sql
        start = sql.index(f"alter table {table}")
        assert "enable row level security" in sql[start:start + 100]


def test_entity_policy_uses_authoritative_profile_tenant():
    sql = SCHEMA.read_text(encoding="utf-8").lower()
    assert "select company_id from user_profiles where id = auth.uid()" in sql
    assert "using (company_id = my_company_id())" in sql
    assert "with check (company_id = my_company_id())" in sql
