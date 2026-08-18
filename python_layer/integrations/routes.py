from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

import requests
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from copilot.engine import CopilotEngine
from onboarding.auth import verify_tenant_access


router = APIRouter(prefix="/integrations", tags=["Governed integrations"])
_MAX_REMOTE_FILE_BYTES = 25 * 1024 * 1024


class IntegrationRequest(BaseModel):
    company_id: str
    prompt: str = ""
    file_urls: list[str] = Field(default_factory=list)
    response_json_schema: Optional[dict] = None
    json_schema: Optional[dict] = None
    file_url: Optional[str] = None
    model: Optional[str] = None
    payload: dict = Field(default_factory=dict)


def _authorize(authorization: Optional[str], company_id: str) -> dict:
    return verify_tenant_access(authorization, company_id)


def _download(url: str) -> tuple[bytes, str]:
    if not url.startswith("https://"):
        raise HTTPException(422, detail={"message": "Only HTTPS document URLs are accepted."})
    response = requests.get(url, timeout=30, stream=True)
    response.raise_for_status()
    content = response.content
    if len(content) > _MAX_REMOTE_FILE_BYTES:
        raise HTTPException(413, detail={"message": "Document exceeds the 25 MB extraction limit."})
    filename = Path(url.split("?", 1)[0]).name or "document.pdf"
    return content, filename


def _json_result(text: str) -> Any:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.I | re.S)
    try:
        return json.loads(cleaned)
    except Exception:
        return {"text": text}


@router.post("/document-extract")
def document_extract(request: IntegrationRequest, authorization: Optional[str] = Header(None)):
    _authorize(authorization, request.company_id)
    if not request.file_url:
        raise HTTPException(422, detail={"message": "file_url is required."})
    file_bytes, filename = _download(request.file_url)
    from ingestion.extractors import document
    try:
        extracted = document.extract(file_bytes, filename)
    except ValueError as exc:
        raise HTTPException(422, detail={"message": str(exc)}) from exc
    return {
        "status": "success",
        "output": extracted.get("rows", []),
        "columns": extracted.get("columns", []),
        "row_count": extracted.get("row_count", 0),
        "source": "python_document_extraction",
    }


@router.post("/idjwi-invoke")
def idjwi_invoke(request: IntegrationRequest, authorization: Optional[str] = Header(None)):
    user = _authorize(authorization, request.company_id)
    context: dict[str, Any] = {
        "product_surface": "governed_integration",
        "requested_json_schema": request.response_json_schema or request.json_schema,
        "requesting_user_id": user.get("id"),
    }
    if request.file_urls:
        extracted_documents = []
        from ingestion.extractors import document
        for file_url in request.file_urls[:5]:
            file_bytes, filename = _download(file_url)
            extracted = document.extract(file_bytes, filename)
            extracted_documents.extend(extracted.get("rows", [])[:200])
        context["extracted_documents"] = extracted_documents
    engine = CopilotEngine(company_id=request.company_id, model=request.model)
    result = engine.ask(
        request.prompt,
        context=context,
        advisor_enabled=True,
    )
    answer = result.get("answer", "")
    parsed = _json_result(answer) if (request.response_json_schema or request.json_schema) else answer
    if isinstance(parsed, dict):
        return {
            **parsed,
            "idjwi": {
                "advisor_consulted": bool(result.get("advisor_consulted") or result.get("advisor_used")),
                "model": result.get("model"),
                "audit": result.get("trust"),
            },
        }
    return {"text": str(parsed), "idjwi": {"advisor_consulted": bool(result.get("advisor_consulted"))}}


@router.post("/send-email")
def send_email(request: IntegrationRequest, authorization: Optional[str] = Header(None)):
    _authorize(authorization, request.company_id)
    raise HTTPException(409, detail={
        "message": "Email must be proposed through an Idjwi governed action and approved before delivery.",
        "action": "create_approval_request",
    })


@router.post("/function/{function_name}")
def invoke_function(function_name: str, request: IntegrationRequest, authorization: Optional[str] = Header(None)):
    _authorize(authorization, request.company_id)
    if function_name == "getAnalyticsEngagement":
        return {"status": "unavailable", "reason": "Google Analytics connector is not configured."}
    raise HTTPException(404, detail={"message": f"Unknown governed function: {function_name}"})
