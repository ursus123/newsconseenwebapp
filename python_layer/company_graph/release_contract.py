"""Executable release traceability for Company Graph Phase 9."""

STAGE_29_COVERAGE = {
    "tenant_isolation": ["test_graph_overview_requires_verified_tenant", "test_same_tenant_admin_and_worker_receive_isolated_cached_graphs"],
    "cache_isolation": ["test_worker_cache_cannot_seed_admin_response", "test_cache_is_copy_safe_and_generation_invalidates_tenant"],
    "field_redaction": ["test_api_and_idjwi_packets_do_not_contain_unauthorized_values", "export and Idjwi serializers retain only classified exposable attributes"],
    "operational_unit_authorization": ["test_worker_cannot_select_arbitrary_operational_unit", "test_operational_unit_membership_authorizes_scope_and_manager_permissions"],
    "role_differences": ["test_role_surface_matrix_is_enforced_by_backend"],
    "pagination_and_truncation": ["test_continuation_token_is_bound_to_tenant_authorization_and_scope", "test_graph_packet_reports_source_completeness_truncation_and_actions"],
    "temporal_relationships": ["test_temporal_assertion_overlay_explains_confirmation_and_supersession_fields"],
    "confirmations_and_rejections": ["test_relationship_confirmation_requires_approval_and_rejects_conflict", "test_rejected_inference_is_suppressed_but_history_remains_for_idjwi"],
    "unsupported_predicates": ["test_relationship_edit_rejects_ungoverned_predicate_before_writing"],
    "partial_source_failure": ["test_graph_search_preserves_results_when_one_source_fails", "test_every_unavailable_source_has_actionable_failure_metadata"],
    "export_governance": ["test_governed_export_rebuilds_authorized_packet_and_ignores_hidden_requests", "test_worker_cannot_export_even_with_modified_browser_request"],
    "stale_neighborhood_requests": ["latest graph request coordinator suppresses a stale neighborhood response"],
    "explicit_idjwi_intents": ["test_explicit_intent_wins_and_explain_company_never_becomes_gap_detection"],
    "advisor_execution_truth": ["test_requested_toggle_is_not_proof_of_advisor_contribution", "test_response_and_audit_receive_the_same_identity"],
    "evidence_citations": ["test_edge_claim_is_traceable_to_nodes_edge_and_evidence"],
    "page_idjwi_count_consistency": ["Idjwi receives the exact semantic packet displayed by Company Graph"],
    "accessibility": ["accessible Company Graph representations", "AccessibleInteractionDialog"],
    "performance": ["benchmark-authorized-endpoints-final.json", "benchmark-large-dense-4-users.json"],
}

OPERATOR_ACCEPTANCE_SCENARIOS = (
    {"id": 1, "name": "Explain the organization", "roles": ("admin", "manager", "technician"), "intent": "explain_company_graph", "evidence_required": True},
    {"id": 2, "name": "Explain an operational unit", "roles": ("admin", "manager", "technician"), "intent": "explain_operational_unit", "evidence_required": True},
    {"id": 3, "name": "Explain a node", "roles": ("admin", "manager", "worker", "technician"), "intent": "explain_node", "evidence_required": True},
    {"id": 4, "name": "Explain an edge", "roles": ("admin", "manager", "worker", "technician"), "intent": "explain_relationship", "evidence_required": True},
    {"id": 5, "name": "Find disconnected records", "roles": ("admin", "manager", "technician"), "intent": "find_graph_gaps", "evidence_required": True},
    {"id": 6, "name": "Confirm a proposed relationship", "roles": ("admin",), "endpoint": "/company-graph/relationship/confirm", "audit_required": True},
    {"id": 7, "name": "Reject an incorrect inference", "roles": ("admin",), "endpoint": "/company-graph/relationship/reject", "audit_required": True},
    {"id": 8, "name": "Inspect a historical relationship", "roles": ("admin", "manager", "technician"), "endpoint": "/company-graph/edge/explain", "evidence_required": True},
    {"id": 9, "name": "Handle an unavailable source", "roles": ("admin", "manager", "technician"), "intent": "explain_graph_change", "operator_action_required": True},
    {"id": 10, "name": "Distinguish empty data from failure", "roles": ("admin", "manager", "technician"), "endpoint": "/company-graph/overview", "operator_action_required": True},
    {"id": 11, "name": "Verify advisor contribution", "roles": ("admin", "manager", "technician"), "intent": "explain_node", "advisor_truth_required": True},
    {"id": 12, "name": "Export an authorized graph", "roles": ("admin",), "endpoint": "/company-graph/export", "audit_required": True},
    {"id": 13, "name": "Block an unauthorized export", "roles": ("worker",), "endpoint": "/company-graph/export", "expected_status": 403},
    {"id": 14, "name": "Add a relationship and refresh immediately", "roles": ("admin",), "endpoint": "/company-graph/relationship/confirm", "refresh_required": True},
    {"id": 15, "name": "Observe disruption and approve an alternative", "roles": ("admin", "manager"), "endpoint": "/company-graph/external-observations", "evidence_required": True},
)

ADMINISTRATOR_WORKSPACE_ACCEPTANCE_SCENARIOS = (
    "Open Company Graph and see the graph immediately",
    "Collapse and restore each section",
    "Expand the graph",
    "Expand the complete workspace",
    "Search and center a record",
    "Select and explain a node",
    "Select and explain an edge",
    "Review relationship evidence",
    "Confirm a relationship",
    "Reject an incorrect proposal",
    "Inspect a graph-quality finding",
    "Create repair work",
    "Open Idjwi and retain graph context",
    "Switch layouts without losing the mental map",
    "Verify authorized export",
    "Refresh and preserve safe preferences",
    "Complete the workflow using keyboard-accessible equivalents",
)

RELEASE_ENVIRONMENTS = {
    "local": ("frontend", "python_backend", "supabase_alignment", "migrations", "performance"),
    "staging": ("web_domain", "api_domain", "synthetic_multi_role_tenant", "monitoring", "migration_rollback"),
    "surfaces": ("desktop_layout", "mobile_manager", "mobile_worker"),
}
