import pytest
from fastapi import HTTPException

from onboarding.auth import verify_supabase_user


def test_missing_session_has_structured_error():
    with pytest.raises(HTTPException) as captured:
        verify_supabase_user(None)
    assert captured.value.status_code == 401
    assert captured.value.detail["code"] == "session_missing"
    assert captured.value.detail["category"] == "authorization"
    assert captured.value.detail["action"] == "sign_in"
