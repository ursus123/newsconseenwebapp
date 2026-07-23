"""Proof-derived visible Idjwi and advisor response identity."""


def build_response_identity(*, request, advisor_selection: dict, result: dict) -> dict:
    requested_mode = str(request.advisor_mode or ("automatic" if request.advisor_enabled else "core")).lower()
    advisor_requested = requested_mode != "core" or bool(request.advisor_enabled)
    advisor_required = requested_mode == "required"
    selected_models = list(advisor_selection.get("comparison_models") or [])
    if advisor_selection.get("model_id") and advisor_selection.get("model_id") not in selected_models:
        selected_models.insert(0, advisor_selection["model_id"])

    execution_succeeded = not result.get("error") and result.get("mode") == "advisor"
    contributions = result.get("advisor_contributions") or []
    proven_models = [
        str(item.get("model_id") or item.get("model") or "").strip()
        for item in contributions if isinstance(item, dict)
    ]
    proven_models = [model for model in proven_models if model]
    if execution_succeeded and not proven_models and advisor_selection.get("model_id"):
        proven_models = [str(advisor_selection["model_id"])]
    advisor_consulted = bool(execution_succeeded and proven_models)
    multiple_consulted = len(set(proven_models)) > 1
    advisor_available = bool(selected_models)
    advisor_unavailable = bool(advisor_requested and not advisor_available)
    core_fallback = bool(
        advisor_requested and not advisor_consulted
        and (advisor_selection.get("source") == "fallback" or result.get("error"))
    )
    required_unavailable = bool(advisor_required and not advisor_consulted)

    if required_unavailable:
        state = "advisor required but unavailable"
    elif multiple_consulted:
        state = "multiple advisors consulted"
    elif advisor_consulted:
        state = "advisor consulted"
    elif core_fallback:
        state = "Core fallback used"
    elif advisor_unavailable:
        state = "advisor unavailable"
    elif advisor_requested:
        state = "advisor requested"
    elif advisor_available:
        state = "advisor available"
    else:
        state = "Idjwi Core"

    return {
        "visible_identity": "Idjwi",
        "response_state": state,
        "idjwi_core": True,
        "advisor_available": advisor_available,
        "advisor_requested": advisor_requested,
        "advisor_consulted": advisor_consulted,
        "multiple_advisors_consulted": multiple_consulted,
        "advisor_unavailable": advisor_unavailable,
        "core_fallback_used": core_fallback,
        "advisor_required_but_unavailable": required_unavailable,
        "consulted_advisors": sorted(set(proven_models)),
        "selection_mode": advisor_selection.get("mode") or "core",
    }
