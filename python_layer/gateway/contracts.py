"""
Gateway contracts for Newsconseen's operating assistant.

This borrows four product patterns without adding four separate systems:
- Ruflo: decompose a goal into staged work.
- Open Design: produce previewable artifacts.
- QField: capture field work offline and sync later.
- OpenClaw: route channel messages through sessions, permissions, and tools.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class GatewayMessage(BaseModel):
    company_id: str
    user_email: Optional[str] = None
    user_role: Optional[str] = None
    channel: str = Field(default="web")
    session_id: Optional[str] = None
    message: str
    context: Dict[str, Any] = Field(default_factory=dict)
    dry_run: bool = True


class GatewayResponse(BaseModel):
    session_id: str
    channel: str
    intent: str
    answer: str
    confidence: float = 0.7
    plan: List[Dict[str, Any]] = Field(default_factory=list)
    artifacts: List[Dict[str, Any]] = Field(default_factory=list)
    proposed_actions: List[Dict[str, Any]] = Field(default_factory=list)
    approval_required: bool = True
    routed_to: List[str] = Field(default_factory=list)
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    data_quality: Dict[str, Any] = Field(default_factory=dict)


class FieldCaptureSync(BaseModel):
    company_id: str
    app_id: str
    user_email: Optional[str] = None
    device_id: Optional[str] = None
    records: List[Dict[str, Any]] = Field(default_factory=list)


class ArtifactRequest(BaseModel):
    company_id: str
    artifact_type: str
    title: str
    prompt: Optional[str] = ""
    source_context: Dict[str, Any] = Field(default_factory=dict)
