"""Server-side canonical write allowlists.

These fields mirror the confirmed public schema. Browser payloads may contain
UI-only fields; those never reach PostgREST.
"""

CORE_WRITABLE_FIELDS = {
    "person": {"first_name","last_name","preferred_name","person_type","person_subtype","primary_role","engagement_model","status","availability_status","start_date","end_date","phone","email","address","city","region","country","latitude","longitude","notes","internal_notes","photo_url","company_id","created_by"},
    "enterprise": {"enterprise_name","enterprise_type","enterprise_subtype","sic_sector_id","sic_sector_name","enterprise_tier","parent_enterprise_id","status","operating_status","phone","email","website","address","city","region","country","latitude","longitude","brand_name","brand_logo_url","brand_primary_color","brand_secondary_color","brand_accent_color","brand_tagline","brand_hide_newsconseen","brand_favicon_url","brand_support_email","notes","internal_notes","company_id","created_by"},
    "product": {"product_name","name","item_name","item_type","item_subtype","item_class","item_brand","item_variant","unit_of_measure","stock_quantity","reorder_level","expiry_date","price","cost","sku","barcode","description","internal_notes","image_url","enterprise_id","company_id","created_by"},
    "task": {"title","description","task_type","status","priority","due_date","scheduled_date","scheduled_time","completed_at","assigned_to_email","assigned_to_name","enterprise_id","enterprise","related_person","related_person_id","outcome","outcome_notes","notes","internal_notes","company_id","created_by"},
    "transaction": {"reference_number","description","transaction_type","status","payment_status","amount","amount_paid","net_amount","currency","date","due_date","enterprise_id","enterprise","person_id","person_name","primary_person","product_id","product_name","line_items","notes","internal_notes","company_id","created_by"},
    "relationship": {"relationship_type","person_id","person_name","person","secondary_person_id","secondary_person","enterprise_id","enterprise_name","enterprise","secondary_enterprise_id","secondary_enterprise","item_id","item_name","service_id","service_name","role","status","start_date","end_date","notes","internal_notes","company_id","created_by"},
    "address": {"address_line1","address_line2","city","region","state_region","country","postal_code","latitude","longitude","address_type","entity_ref_type","entity_ref_id","is_primary","notes","internal_notes","company_id","created_by"},
    "service": {"name","service_name","description","service_type","service_subtype","price","unit_of_measure","duration_minutes","is_active","enterprise_id","company_id","created_by"},
}

EXTENDED_WRITABLE_FIELDS = {
    "document": {"title","file_name","file_url","document_type","entity_ref_type","entity_ref_id","issue_date","expiry_date","status","notes","company_id","created_by"},
    "schedule": {"name","title","schedule_type","frequency","day_of_week","day_of_month","start_time","end_time","start_date","end_date","is_active","entity_ref_type","entity_ref_id","notes","company_id","created_by"},
    "signal": {"name","signal_type","numeric_value","text_value","unit","source","entity_ref_type","entity_ref_id","is_anomaly","recorded_at","notes","company_id","created_by"},
    "channel": {"name","channel_name","channel_type","target_identifier","is_active","notes","company_id","created_by"},
    "territory": {"name","territory_name","territory_type","boundary_geojson","parent_territory_id","area_km2","notes","company_id","created_by"},
    "animal": {"name","animal_type","species","breed","sex","date_of_birth","weight_kg","status","enterprise_id","plot_id","product_id","notes","company_id","created_by"},
    "plot": {"name","plot_type","land_use","crop_type","area_ha","latitude","longitude","status","parent_plot_id","enterprise_id","notes","company_id","created_by"},
    "observation": {"observation_type","subject_type","subject_id","numeric_value","text_value","unit_of_measure","is_anomaly","observed_at","notes","company_id","created_by"},
    "insight": {"title","body","insight_type","severity","entity_ref_type","entity_ref_id","is_actioned","is_dismissed","actioned_at","actioned_by","company_id","created_by"},
    "recommendation": {"title","body","recommendation_type","priority","entity_ref_type","entity_ref_id","is_actioned","is_dismissed","action_taken","actioned_at","actioned_by","company_id","created_by"},
    "decision": {"decision","context","decision_type","outcome","outcome_notes","decided_by","decided_at","entity_ref_type","entity_ref_id","company_id","created_by"},
    "risk": {"title","description","risk_type","severity","likelihood","impact","status","mitigation_notes","entity_ref_type","entity_ref_id","company_id","created_by"},
    "opportunity": {"title","description","opportunity_type","estimated_value","confidence","status","entity_ref_type","entity_ref_id","company_id","created_by"},
    "metric_definition": {"name","description","metric_type","unit","formula","entity_type","threshold_warning","threshold_critical","is_active","company_id","created_by"},
    "master_data_option": {"entity_type","field_name","value","label","parent_value","sector_id","sector_name","sort_order","is_system_default","is_active","company_id","created_by"},
}

WRITABLE_FIELDS = {**CORE_WRITABLE_FIELDS, **EXTENDED_WRITABLE_FIELDS}

REQUIRED_FIELDS = {
    "person": ("first_name", "last_name"), "enterprise": ("enterprise_name",),
    "product": ("product_name",), "task": ("title",), "relationship": ("relationship_type",),
    "document": ("title",), "schedule": ("name",), "signal": ("signal_type",),
    "channel": ("name",), "territory": ("name",), "plot": ("name",),
    "observation": ("observation_type",), "insight": ("title",),
    "recommendation": ("title",), "decision": ("decision",), "risk": ("title",),
    "opportunity": ("title",), "metric_definition": ("name",),
    "master_data_option": ("entity_type", "field_name", "value", "label"),
}


def sanitize_create_payload(entity: str, payload: dict, actor_id: str) -> dict:
    if entity not in WRITABLE_FIELDS:
        raise ValueError(f"Entity '{entity}' is not enabled for governed writes")
    clean = {key: value for key, value in (payload or {}).items() if key in WRITABLE_FIELDS[entity]}
    clean["created_by"] = actor_id
    missing = [field for field in REQUIRED_FIELDS.get(entity, ()) if clean.get(field) in (None, "")]
    # Product frontend aliases are accepted by the Supabase adapter.
    if entity == "product" and "product_name" in missing and (clean.get("name") or clean.get("item_name")):
        missing.remove("product_name")
    if missing:
        raise ValueError("Missing required fields: " + ", ".join(missing))
    return clean
