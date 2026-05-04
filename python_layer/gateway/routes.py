from __future__ import annotations

from fastapi import APIRouter, Query

from gateway.contracts import ArtifactRequest, FieldCaptureSync, GatewayMessage
from gateway.engine import (
    ARTIFACT_TEMPLATES,
    FIELD_CAPTURE_PROFILES,
    answer_gateway_message,
    build_artifact_preview,
    sync_field_capture,
)

router = APIRouter(prefix="/gateway", tags=["Assistant Gateway"])


@router.get("/status")
def gateway_status():
    return {
        "status": "available",
        "patterns": {
            "ruflo": "goal decomposition and staged agent work",
            "open_design": "previewable artifacts, reports, charts, and forms",
            "qfield": "offline field capture contracts",
            "openclaw": "channel, session, permission, and tool routing",
        },
        "channels": ["web", "mobile", "whatsapp", "slack", "teams", "email", "sms"],
    }


@router.post("/message")
def gateway_message(req: GatewayMessage):
    """
    Unified entry point for Copilot across web, mobile, WhatsApp, Slack,
    Teams, email, and future channels.

    This endpoint does not execute dangerous writes directly. It decomposes
    the request, routes it, and returns proposed actions/artifacts for approval.
    """
    return answer_gateway_message(req).dict()


@router.get("/artifact-templates")
def artifact_templates():
    return {"templates": ARTIFACT_TEMPLATES}


@router.post("/artifacts/preview")
def artifact_preview(req: ArtifactRequest):
    return build_artifact_preview(req)


@router.get("/field/profiles")
def field_profiles(app_id: str | None = Query(None)):
    if app_id:
        return {"app_id": app_id, "profile": FIELD_CAPTURE_PROFILES.get(app_id, {})}
    return {"profiles": FIELD_CAPTURE_PROFILES}


@router.post("/field/sync")
def field_sync(req: FieldCaptureSync):
    """
    Offline field capture sync endpoint.

    The first version validates/queues records and returns the ontology writes
    each app is expected to produce. Execution should happen through dataService
    or a backend write executor after validation/approval.
    """
    return sync_field_capture(req)
