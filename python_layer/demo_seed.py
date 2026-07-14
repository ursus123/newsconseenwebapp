"""
Seed five deterministic Newsconseen demo companies (clinic, farm, retail,
school, ngo).

Usage from the repository root:
    python python_layer/demo_seed.py --dry-run
    python python_layer/demo_seed.py

The script writes live ontology rows to Supabase with the service-role key.
If DATABASE_URL is configured, it also seeds Idjwi company memory into
analytics.idjwi_memory.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests


ROOT = Path(__file__).resolve().parents[1]
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://newsconseen.com/demo-companies")
CREATED_BY = "demo-company-seeder"

ENTITY_TABLES = [
    "enterprises",
    "persons",
    "products",
    "services",
    "addresses",
    "relationships",
    "tasks",
    "transactions",
    "documents",
    "schedules",
    "signals",
    "channels",
    "territories",
    "animals",
    "plots",
    "observations",
    "insights",
    "recommendations",
    "risks",
    "opportunities",
    "metric_definitions",
]

ETL_ENDPOINTS = [
    "people-summary",
    "enterprise-summary",
    "product-summary",
    "transaction-summary",
    "task-summary",
    "address-summary",
    "relationship-summary",
    "document-summary",
    "schedule-summary",
    "signal-summary",
    "channel-summary",
    "territory-summary",
    "animal-summary",
    "plot-summary",
    "observation-summary",
    "insight-summary",
    "recommendation-summary",
    "risk-summary",
    "opportunity-summary",
    "geospatial-summary",
    "kpi-summary",
    "network-summary",
    "concentration-risk",
]

TABLE_COLUMNS = {
    "persons": {
        "id", "first_name", "last_name", "preferred_name", "person_type",
        "person_subtype", "primary_role", "engagement_model", "status",
        "availability_status", "start_date", "end_date", "phone", "email",
        "address", "city", "region", "country", "latitude", "longitude",
        "notes", "photo_url", "company_id", "created_by",
    },
    "enterprises": {
        "id", "enterprise_name", "enterprise_type", "enterprise_subtype",
        "sic_sector_id", "sic_sector_name", "enterprise_tier",
        "parent_enterprise_id", "status", "operating_status", "phone",
        "email", "website", "address", "city", "region", "country",
        "latitude", "longitude", "brand_name", "brand_logo_url",
        "brand_primary_color", "brand_secondary_color", "brand_accent_color",
        "brand_tagline", "brand_hide_newsconseen", "brand_favicon_url",
        "brand_support_email", "notes", "company_id", "created_by",
    },
    "products": {
        "id", "product_name", "item_name", "item_type", "item_subtype",
        "item_class", "item_brand", "item_variant", "unit_of_measure",
        "stock_quantity", "reorder_level", "expiry_date", "price", "cost",
        "sku", "barcode", "description", "image_url", "enterprise_id",
        "company_id", "created_by",
    },
    "tasks": {
        "id", "title", "description", "task_type", "status", "priority",
        "due_date", "scheduled_time", "completed_at", "assigned_to_email",
        "assigned_to_name", "enterprise_id", "enterprise", "related_person",
        "related_person_id", "outcome", "outcome_notes", "notes",
        "company_id", "created_by",
    },
    "transactions": {
        "id", "reference_number", "description", "transaction_type", "status",
        "payment_status", "amount", "amount_paid", "net_amount", "currency",
        "date", "due_date", "enterprise_id", "enterprise", "person_id",
        "person_name", "product_id", "product_name", "line_items", "notes",
        "company_id", "created_by",
    },
    "relationships": {
        "id", "relationship_type", "person_id", "person_name", "person",
        "secondary_person_id", "secondary_person", "enterprise_id",
        "enterprise_name", "enterprise", "secondary_enterprise_id",
        "secondary_enterprise", "item_id", "item_name", "service_id",
        "service_name", "role", "status", "start_date", "end_date", "notes",
        "company_id", "created_by",
    },
    "addresses": {
        "id", "address_line1", "address_line2", "city", "region", "country",
        "postal_code", "latitude", "longitude", "address_type",
        "entity_ref_type", "entity_ref_id", "is_primary", "notes",
        "company_id", "created_by",
    },
    "services": {
        "id", "name", "service_name", "description", "service_type",
        "service_subtype", "price", "unit_of_measure", "duration_minutes",
        "is_active", "enterprise_id", "company_id", "created_by",
    },
    "documents": {
        "id", "title", "file_name", "file_url", "document_type",
        "entity_ref_type", "entity_ref_id", "issue_date", "expiry_date",
        "status", "notes", "company_id", "created_by",
    },
    "schedules": {
        "id", "name", "title", "schedule_type", "frequency", "day_of_week",
        "day_of_month", "start_time", "end_time", "start_date", "end_date",
        "is_active", "entity_ref_type", "entity_ref_id", "notes",
        "company_id", "created_by",
    },
    "signals": {
        "id", "name", "signal_type", "numeric_value", "text_value", "unit",
        "source", "entity_ref_type", "entity_ref_id", "is_anomaly",
        "recorded_at", "notes", "company_id", "created_by",
    },
    "channels": {
        "id", "name", "channel_name", "channel_type", "target_identifier",
        "is_active", "notes", "company_id", "created_by",
    },
    "territories": {
        "id", "name", "territory_name", "territory_type", "boundary_geojson",
        "parent_territory_id", "area_km2", "notes", "company_id", "created_by",
    },
    "animals": {
        "id", "name", "animal_type", "species", "breed", "sex",
        "date_of_birth", "weight_kg", "status", "enterprise_id", "plot_id",
        "product_id", "notes", "company_id", "created_by",
    },
    "plots": {
        "id", "name", "plot_type", "land_use", "crop_type", "area_ha",
        "latitude", "longitude", "status", "parent_plot_id", "enterprise_id",
        "notes", "company_id", "created_by",
    },
    "observations": {
        "id", "observation_type", "subject_type", "subject_id",
        "numeric_value", "text_value", "unit_of_measure", "is_anomaly",
        "observed_at", "notes", "company_id", "created_by",
    },
    "insights": {
        "id", "title", "body", "insight_type", "severity", "entity_ref_type",
        "entity_ref_id", "is_actioned", "is_dismissed", "actioned_at",
        "actioned_by", "company_id", "created_by",
    },
    "recommendations": {
        "id", "title", "body", "recommendation_type", "priority",
        "entity_ref_type", "entity_ref_id", "is_actioned", "is_dismissed",
        "action_taken", "actioned_at", "actioned_by", "company_id",
        "created_by",
    },
    "risks": {
        "id", "title", "description", "risk_type", "severity", "likelihood",
        "impact", "status", "mitigation_notes", "entity_ref_type",
        "entity_ref_id", "company_id", "created_by",
    },
    "opportunities": {
        "id", "title", "description", "opportunity_type", "estimated_value",
        "confidence", "status", "entity_ref_type", "entity_ref_id",
        "company_id", "created_by",
    },
    "metric_definitions": {
        "id", "name", "description", "metric_type", "unit", "formula",
        "entity_type", "threshold_warning", "threshold_critical", "is_active",
        "company_id", "created_by",
    },
}


def load_env() -> None:
    for path in (ROOT / ".env", ROOT / ".env.local", ROOT / "python_layer" / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            key = key.strip()
            if key and key not in os.environ:
                os.environ[key] = value.strip().strip("\"'")


def did(*parts: str) -> str:
    return str(uuid.uuid5(NAMESPACE, ":".join(parts)))


def today(offset: int = 0) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


def now_iso(offset_days: int = 0) -> str:
    dt = datetime.now(timezone.utc) + timedelta(days=offset_days)
    return dt.isoformat(timespec="seconds")


def company_id(slug: str) -> str:
    return did(slug, "enterprise", "hq")


def row(table: str, slug: str, key: str, **values: Any) -> dict[str, Any]:
    return {
        "id": did(slug, table, key),
        "company_id": company_id(slug),
        "created_by": CREATED_BY,
        **values,
    }


def polygon(lat: float, lon: float, delta: float = 0.025) -> dict[str, Any]:
    return {
        "type": "Polygon",
        "coordinates": [[
            [lon - delta, lat - delta],
            [lon + delta, lat - delta],
            [lon + delta, lat + delta],
            [lon - delta, lat + delta],
            [lon - delta, lat - delta],
        ]],
    }


def common_company(slug: str, name: str, subtype: str, sector_id: int, sector: str,
                   city: str, region: str, lat: float, lon: float,
                   enterprise_type: str = "commercial") -> dict[str, list[dict[str, Any]]]:
    hq_id = company_id(slug)
    records: dict[str, list[dict[str, Any]]] = defaultdict(list)
    records["enterprises"].append(row(
        "enterprises", slug, "hq",
        enterprise_name=name,
        enterprise_type=enterprise_type,
        enterprise_subtype=subtype,
        sic_sector_id=sector_id,
        sic_sector_name=sector,
        enterprise_tier="headquarters",
        status="active",
        operating_status="open",
        phone="+1-555-0100",
        email=f"{slug}@demo.newsconseen.com",
        website=f"https://demo.newsconseen.com/{slug}",
        address=f"100 {name.replace('Newsconseen Demo ', '')} Way",
        city=city,
        region=region,
        country="USA",
        latitude=lat,
        longitude=lon,
        brand_name=name,
        brand_primary_color="#0f766e",
        brand_secondary_color="#334155",
        brand_accent_color="#f59e0b",
        brand_tagline="Demo data for ontology, analytics, and Idjwi validation.",
        notes="Seeded demo headquarters. Safe to rerun.",
    ))
    records["addresses"].append(row(
        "addresses", slug, "hq-primary",
        address_line1=f"100 {name.replace('Newsconseen Demo ', '')} Way",
        city=city,
        region=region,
        country="USA",
        postal_code="00000",
        latitude=lat,
        longitude=lon,
        address_type="primary",
        entity_ref_type="enterprise",
        entity_ref_id=hq_id,
        is_primary=True,
        notes="Primary operating address for map, geospatial, and relationship tests.",
    ))
    records["channels"].extend([
        row("channels", slug, "ops-email", name="Operations Email", channel_name="Operations Email",
            channel_type="email", target_identifier=f"ops+{slug}@demo.newsconseen.com",
            is_active=True, notes="Demo inbound operations channel."),
        row("channels", slug, "alerts-sms", name="Urgent Alerts", channel_name="Urgent Alerts",
            channel_type="sms", target_identifier="+15550109",
            is_active=True, notes="Demo alert channel for high-priority tasks and risks."),
    ])
    records["territories"].append(row(
        "territories", slug, "service-area",
        name=f"{name} Service Area",
        territory_name=f"{name} Service Area",
        territory_type="service_area",
        boundary_geojson=polygon(lat, lon),
        area_km2=18.4,
        notes="Small polygon around HQ for spatial coverage and territory tests.",
    ))
    return records


def add_people(records: dict[str, list[dict[str, Any]]], slug: str, people: list[dict[str, Any]]) -> None:
    hq_name = records["enterprises"][0]["enterprise_name"]
    for p in people:
        person_id = did(slug, "persons", p["key"])
        full_name = f"{p['first_name']} {p['last_name']}"
        records["persons"].append(row("persons", slug, p["key"], **{k: v for k, v in p.items() if k != "key"}))
        records["relationships"].append(row(
            "relationships", slug, f"{p['key']}-enterprise",
            relationship_type="person_enterprise",
            person_id=person_id,
            person_name=full_name,
            person=full_name,
            enterprise_id=company_id(slug),
            enterprise_name=hq_name,
            enterprise=hq_name,
            role=p.get("primary_role") or p.get("person_subtype"),
            status="active",
            start_date=p.get("start_date") or today(-180),
            notes="Demo person linked to the demo company graph.",
        ))


def add_financials(records: dict[str, list[dict[str, Any]]], slug: str, items: list[dict[str, Any]]) -> None:
    hq_name = records["enterprises"][0]["enterprise_name"]
    for item in items:
        records["transactions"].append(row(
            "transactions", slug, item["key"],
            reference_number=item["reference_number"],
            description=item["description"],
            transaction_type=item["transaction_type"],
            status=item.get("status", "posted"),
            payment_status=item.get("payment_status", "paid"),
            amount=item["amount"],
            amount_paid=item.get("amount_paid", item["amount"]),
            net_amount=item.get("net_amount", item["amount"]),
            currency="USD",
            date=item.get("date", today(-7)),
            due_date=item.get("due_date", today(14)),
            enterprise_id=company_id(slug),
            enterprise=hq_name,
            person_id=item.get("person_id"),
            person_name=item.get("person_name"),
            product_id=item.get("product_id"),
            product_name=item.get("product_name"),
            line_items=item.get("line_items", []),
            notes=item.get("notes", "Demo transaction for dashboards and analytics."),
        ))


def add_intelligence(records: dict[str, list[dict[str, Any]]], slug: str, domain: str) -> None:
    hq_id = company_id(slug)
    records["insights"].extend([
        row("insights", slug, "operational-signal",
            title=f"{domain} operating pattern detected",
            body="Demo insight generated from seeded tasks, transactions, and signals.",
            insight_type="operational",
            severity="info",
            entity_ref_type="enterprise",
            entity_ref_id=hq_id),
        row("insights", slug, "data-quality",
            title="Demo data is rich enough for graph traversal",
            body="People, enterprises, products, services, tasks, transactions, signals, and risks are connected.",
            insight_type="data_quality",
            severity="warning",
            entity_ref_type="enterprise",
            entity_ref_id=hq_id),
    ])
    records["recommendations"].append(row(
        "recommendations", slug, "weekly-review",
        title=f"Run weekly {domain.lower()} risk review",
        body="Use the seeded risks, overdue tasks, and stock signals to test Idjwi recommended actions.",
        recommendation_type="risk_review",
        priority="high",
        entity_ref_type="enterprise",
        entity_ref_id=hq_id,
    ))
    records["metric_definitions"].extend([
        row("metric_definitions", slug, "operational-risk-score",
            name="Operational Risk Score",
            description="Weighted score from overdue tasks, critical documents, anomalies, and open risks.",
            metric_type="risk",
            unit="score",
            formula="open_high_risks*30 + overdue_tasks*10 + anomaly_signals*15 + expiring_documents*8",
            entity_type="enterprise",
            threshold_warning=50,
            threshold_critical=80,
            is_active=True),
        row("metric_definitions", slug, "relationship-coverage",
            name="Relationship Coverage",
            description="Share of active entities connected to at least one relationship.",
            metric_type="graph_health",
            unit="percent",
            formula="connected_entities / total_entities * 100",
            entity_type="relationship",
            threshold_warning=70,
            threshold_critical=50,
            is_active=True),
    ])


def build_clinic() -> dict[str, list[dict[str, Any]]]:
    slug = "clinic"
    records = common_company(
        slug, "Newsconseen Demo Clinic", "healthcare_clinic", 80,
        "Health Services", "Chicago", "IL", 41.8781, -87.6298,
    )
    records["enterprises"].extend([
        row("enterprises", slug, "pharmacy-partner", enterprise_name="Lakeview Partner Pharmacy",
            enterprise_type="commercial", enterprise_subtype="pharmacy", sic_sector_id=80,
            sic_sector_name="Health Services", enterprise_tier="unit", parent_enterprise_id=None,
            status="active", operating_status="open", city="Chicago", region="IL",
            country="USA", latitude=41.8910, longitude=-87.6355,
            notes="Demo supplier for medication inventory."),
        row("enterprises", slug, "lab-partner", enterprise_name="Northside Diagnostics Lab",
            enterprise_type="commercial", enterprise_subtype="diagnostic_lab", sic_sector_id=80,
            sic_sector_name="Health Services", enterprise_tier="unit", status="active",
            operating_status="open", city="Chicago", region="IL", country="USA",
            latitude=41.8830, longitude=-87.6200, notes="Demo referral and lab partner."),
    ])
    add_people(records, slug, [
        {"key": "amina-patel", "first_name": "Amina", "last_name": "Patel",
         "preferred_name": "Dr. Patel", "person_type": "staff", "person_subtype": "clinician",
         "primary_role": "Medical Director", "engagement_model": "employed", "status": "active",
         "availability_status": "available", "start_date": today(-900), "phone": "+1-555-0111",
         "email": "amina.patel@demo.newsconseen.com", "city": "Chicago", "region": "IL",
         "country": "USA", "latitude": 41.8790, "longitude": -87.6305,
         "notes": "Clinical lead for care quality and risk decisions."},
        {"key": "marcus-reed", "first_name": "Marcus", "last_name": "Reed",
         "person_type": "staff", "person_subtype": "nurse", "primary_role": "Clinic Nurse",
         "engagement_model": "employed", "status": "active", "availability_status": "busy",
         "start_date": today(-420), "phone": "+1-555-0112", "email": "marcus.reed@demo.newsconseen.com",
         "city": "Chicago", "region": "IL", "country": "USA", "latitude": 41.8802,
         "longitude": -87.6321, "notes": "Handles triage and follow-up tasks."},
        {"key": "lena-brooks", "first_name": "Lena", "last_name": "Brooks",
         "person_type": "client", "person_subtype": "patient", "primary_role": "Patient",
         "engagement_model": "subscribed", "status": "active", "availability_status": "available",
         "start_date": today(-100), "phone": "+1-555-0113", "email": "lena.brooks@example.com",
         "city": "Chicago", "region": "IL", "country": "USA", "latitude": 41.8722,
         "longitude": -87.6250, "notes": "Demo patient with open follow-up and billing record."},
    ])
    records["products"].extend([
        row("products", slug, "amoxicillin", product_name="Amoxicillin 500mg", item_type="physical",
            item_subtype="medication", item_class="controlled", item_brand="DemoRx",
            unit_of_measure="bottle", stock_quantity=14, reorder_level=20, expiry_date=today(45),
            price=18.50, cost=9.75, sku="CLN-AMOX-500", enterprise_id=company_id(slug),
            description="Low stock controlled medicine for inventory risk testing."),
        row("products", slug, "rapid-test", product_name="Rapid Diagnostic Test Kit", item_type="physical",
            item_subtype="diagnostic_supply", item_class="consumable", unit_of_measure="box",
            stock_quantity=120, reorder_level=40, expiry_date=today(180), price=7.25, cost=3.10,
            sku="CLN-RDT-01", enterprise_id=company_id(slug),
            description="High-volume diagnostic supply."),
    ])
    records["services"].extend([
        row("services", slug, "consult", name="Primary Care Consultation", service_name="Primary Care Consultation",
            service_type="clinical", service_subtype="consultation", price=85, unit_of_measure="visit",
            duration_minutes=30, is_active=True, enterprise_id=company_id(slug)),
        row("services", slug, "lab-review", name="Lab Result Review", service_name="Lab Result Review",
            service_type="clinical", service_subtype="diagnostic_review", price=35, unit_of_measure="review",
            duration_minutes=15, is_active=True, enterprise_id=company_id(slug)),
    ])
    records["tasks"].extend([
        row("tasks", slug, "follow-up-lena", title="Follow up abnormal lab result",
            description="Call Lena Brooks and schedule repeat test.", task_type="clinical_follow_up",
            status="open", priority="urgent", due_date=today(-1), scheduled_time="09:00",
            assigned_to_email="marcus.reed@demo.newsconseen.com", assigned_to_name="Marcus Reed",
            enterprise_id=company_id(slug), enterprise="Newsconseen Demo Clinic",
            related_person="Lena Brooks", related_person_id=did(slug, "persons", "lena-brooks")),
        row("tasks", slug, "stock-review", title="Review medication reorder threshold",
            description="Amoxicillin stock is below reorder level.", task_type="inventory_review",
            status="pending", priority="high", due_date=today(2), assigned_to_name="Amina Patel",
            enterprise_id=company_id(slug), enterprise="Newsconseen Demo Clinic"),
    ])
    add_financials(records, slug, [
        {"key": "invoice-lena", "reference_number": "CLN-INV-1001",
         "description": "Consultation and diagnostic review", "transaction_type": "invoice",
         "payment_status": "partial", "amount": 120, "amount_paid": 40, "net_amount": 120,
         "person_id": did(slug, "persons", "lena-brooks"), "person_name": "Lena Brooks"},
        {"key": "supplier-medication", "reference_number": "CLN-BILL-2201",
         "description": "Medication inventory purchase", "transaction_type": "expense",
         "payment_status": "unpaid", "amount": 640, "amount_paid": 0, "net_amount": -640,
         "due_date": today(5), "product_id": did(slug, "products", "amoxicillin"),
         "product_name": "Amoxicillin 500mg"},
    ])
    records["documents"].extend([
        row("documents", slug, "medical-license", title="Clinic Operating License",
            document_type="license", entity_ref_type="enterprise", entity_ref_id=company_id(slug),
            issue_date=today(-300), expiry_date=today(35), status="active",
            notes="Expires soon for compliance-risk testing."),
        row("documents", slug, "supplier-contract", title="Partner Pharmacy Agreement",
            document_type="contract", entity_ref_type="enterprise",
            entity_ref_id=did(slug, "enterprises", "pharmacy-partner"),
            issue_date=today(-200), expiry_date=today(200), status="active"),
    ])
    records["schedules"].append(row("schedules", slug, "daily-triage", name="Daily Triage Review",
        title="Daily Triage Review", schedule_type="clinical_ops", frequency="daily",
        start_time="08:30", end_time="09:00", start_date=today(-30), is_active=True,
        entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    records["signals"].extend([
        row("signals", slug, "fridge-temp", name="Vaccine Fridge Temperature",
            signal_type="temperature", numeric_value=9.2, unit="C", source="demo_sensor",
            entity_ref_type="enterprise", entity_ref_id=company_id(slug), is_anomaly=True,
            recorded_at=now_iso(), notes="Above expected cold-chain range."),
        row("signals", slug, "patient-wait", name="Average Wait Time",
            signal_type="wait_time", numeric_value=42, unit="minutes", source="demo_queue",
            entity_ref_type="enterprise", entity_ref_id=company_id(slug), is_anomaly=False,
            recorded_at=now_iso()),
    ])
    records["risks"].append(row("risks", slug, "cold-chain", title="Cold-chain excursion",
        description="Vaccine fridge temperature is above range and needs review.",
        risk_type="compliance", severity="high", likelihood="medium", impact="high",
        status="open", mitigation_notes="Check sensor, quarantine affected stock.",
        entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    records["opportunities"].append(row("opportunities", slug, "follow-up-program",
        title="Chronic care follow-up program", description="Convert recurring follow-ups into a managed care service.",
        opportunity_type="service_growth", estimated_value=18000, confidence=72,
        status="open", entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    add_intelligence(records, slug, "Clinic")
    return records


def build_farm() -> dict[str, list[dict[str, Any]]]:
    slug = "farm"
    records = common_company(
        slug, "Newsconseen Demo Farm", "mixed_farm", 1,
        "Agriculture", "Ames", "IA", 42.0308, -93.6319,
    )
    add_people(records, slug, [
        {"key": "noah-green", "first_name": "Noah", "last_name": "Green",
         "person_type": "staff", "person_subtype": "farm_manager", "primary_role": "Farm Manager",
         "engagement_model": "employed", "status": "active", "availability_status": "available",
         "start_date": today(-700), "phone": "+1-555-0121", "email": "noah.green@demo.newsconseen.com",
         "city": "Ames", "region": "IA", "country": "USA", "latitude": 42.0300, "longitude": -93.6330,
         "notes": "Owns field operations and livestock checks."},
        {"key": "sofia-martin", "first_name": "Sofia", "last_name": "Martin",
         "person_type": "staff", "person_subtype": "agronomist", "primary_role": "Agronomist",
         "engagement_model": "contracted", "status": "active", "availability_status": "available",
         "start_date": today(-120), "email": "sofia.martin@demo.newsconseen.com",
         "city": "Ames", "region": "IA", "country": "USA", "latitude": 42.0340, "longitude": -93.6280,
         "notes": "Advises on soil observations and crop risk."},
        {"key": "mason-coop", "first_name": "Mason", "last_name": "Cooper",
         "person_type": "contact", "person_subtype": "supplier_contact", "primary_role": "Feed Supplier",
         "engagement_model": "contracted", "status": "active", "availability_status": "available",
         "email": "mason.cooper@example.com", "city": "Ames", "region": "IA",
         "country": "USA", "notes": "Supplier contact for feed and fertilizer."},
    ])
    records["products"].extend([
        row("products", slug, "corn-seed", product_name="Hybrid Corn Seed", item_type="physical",
            item_subtype="seed", item_class="consumable", item_brand="DemoGrow",
            unit_of_measure="bag", stock_quantity=18, reorder_level=12, price=165, cost=120,
            sku="FRM-SEED-CORN", enterprise_id=company_id(slug)),
        row("products", slug, "cattle-feed", product_name="Cattle Feed Mix", item_type="physical",
            item_subtype="feed", item_class="perishable", unit_of_measure="ton",
            stock_quantity=4.5, reorder_level=5, expiry_date=today(30), price=320, cost=250,
            sku="FRM-FEED-01", enterprise_id=company_id(slug)),
    ])
    records["plots"].extend([
        row("plots", slug, "north-field", name="North Field", plot_type="field", land_use="crop",
            crop_type="corn", area_ha=12.4, latitude=42.0411, longitude=-93.6402,
            status="active", enterprise_id=company_id(slug),
            notes="Primary corn field for yield and moisture observations."),
        row("plots", slug, "east-paddock", name="East Paddock", plot_type="paddock",
            land_use="livestock", crop_type="pasture", area_ha=4.8, latitude=42.0261,
            longitude=-93.6210, status="active", enterprise_id=company_id(slug)),
    ])
    records["animals"].extend([
        row("animals", slug, "cow-104", name="Cow 104", animal_type="livestock",
            species="cattle", breed="Angus", sex="female", date_of_birth=today(-1460),
            weight_kg=522.4, status="active", enterprise_id=company_id(slug),
            plot_id=did(slug, "plots", "east-paddock"), notes="Demo livestock record."),
        row("animals", slug, "calf-218", name="Calf 218", animal_type="livestock",
            species="cattle", breed="Angus", sex="male", date_of_birth=today(-120),
            weight_kg=118.2, status="active", enterprise_id=company_id(slug),
            plot_id=did(slug, "plots", "east-paddock"), notes="Recent low-weight observation."),
    ])
    records["observations"].extend([
        row("observations", slug, "soil-moisture-north", observation_type="soil_moisture",
            subject_type="plot", subject_id=did(slug, "plots", "north-field"),
            numeric_value=17.2, unit_of_measure="percent", is_anomaly=True,
            observed_at=now_iso(), notes="Below irrigation threshold."),
        row("observations", slug, "calf-weight", observation_type="animal_weight",
            subject_type="animal", subject_id=did(slug, "animals", "calf-218"),
            numeric_value=118.2, unit_of_measure="kg", is_anomaly=False,
            observed_at=now_iso(-2), notes="Weight tracking for livestock analytics."),
    ])
    records["tasks"].extend([
        row("tasks", slug, "irrigate-north", title="Irrigate North Field",
            description="Soil moisture anomaly below crop threshold.", task_type="field_work",
            status="open", priority="urgent", due_date=today(0), assigned_to_name="Noah Green",
            enterprise_id=company_id(slug), enterprise="Newsconseen Demo Farm"),
        row("tasks", slug, "feed-reorder", title="Reorder cattle feed",
            description="Feed stock is below reorder threshold.", task_type="inventory_review",
            status="pending", priority="high", due_date=today(3), assigned_to_name="Noah Green",
            enterprise_id=company_id(slug), enterprise="Newsconseen Demo Farm"),
    ])
    add_financials(records, slug, [
        {"key": "seed-purchase", "reference_number": "FRM-BILL-0301",
         "description": "Hybrid corn seed purchase", "transaction_type": "expense",
         "payment_status": "paid", "amount": 1980, "net_amount": -1980,
         "product_id": did(slug, "products", "corn-seed"), "product_name": "Hybrid Corn Seed"},
        {"key": "produce-sale", "reference_number": "FRM-INV-7004",
         "description": "Wholesale produce delivery", "transaction_type": "invoice",
         "payment_status": "unpaid", "amount": 4150, "amount_paid": 0, "net_amount": 4150,
         "due_date": today(10)},
    ])
    records["documents"].append(row("documents", slug, "organic-cert", title="Organic Certification",
        document_type="certification", entity_ref_type="enterprise", entity_ref_id=company_id(slug),
        issue_date=today(-250), expiry_date=today(75), status="active",
        notes="Certification renewal test record."))
    records["schedules"].append(row("schedules", slug, "weekly-field-walk", name="Weekly Field Walk",
        title="Weekly Field Walk", schedule_type="field_ops", frequency="weekly",
        day_of_week=1, start_time="07:30", end_time="09:00", start_date=today(-45),
        is_active=True, entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    records["signals"].append(row("signals", slug, "rainfall", name="Rainfall Last 24h",
        signal_type="weather", numeric_value=0.3, unit="in", source="demo_weather_api",
        entity_ref_type="plot", entity_ref_id=did(slug, "plots", "north-field"),
        is_anomaly=True, recorded_at=now_iso(), notes="Low rainfall supports irrigation recommendation."))
    records["risks"].append(row("risks", slug, "drought-stress", title="Crop drought stress",
        description="Soil moisture and rainfall signals indicate risk to North Field yield.",
        risk_type="production", severity="high", likelihood="high", impact="high",
        status="open", mitigation_notes="Irrigate and recheck moisture within 24 hours.",
        entity_ref_type="plot", entity_ref_id=did(slug, "plots", "north-field")))
    records["opportunities"].append(row("opportunities", slug, "precision-irrigation",
        title="Precision irrigation savings", description="Use observations and weather signals to reduce water use.",
        opportunity_type="efficiency", estimated_value=9500, confidence=68, status="open",
        entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    add_intelligence(records, slug, "Farm")
    return records


def build_retail() -> dict[str, list[dict[str, Any]]]:
    slug = "retail"
    records = common_company(
        slug, "Newsconseen Demo Retail Shop", "retail_store", 52,
        "Retail Trade", "Austin", "TX", 30.2672, -97.7431,
    )
    records["enterprises"].extend([
        row("enterprises", slug, "supplier", enterprise_name="Hill Country Wholesale",
            enterprise_type="commercial", enterprise_subtype="supplier", sic_sector_id=51,
            sic_sector_name="Wholesale Trade", enterprise_tier="unit", status="active",
            operating_status="open", city="Austin", region="TX", country="USA",
            latitude=30.2801, longitude=-97.7502, notes="Demo inventory supplier."),
        row("enterprises", slug, "customer-account", enterprise_name="Capitol Office Co.",
            enterprise_type="commercial", enterprise_subtype="business_customer", sic_sector_id=73,
            sic_sector_name="Business Services", enterprise_tier="unit", status="active",
            operating_status="open", city="Austin", region="TX", country="USA",
            latitude=30.2710, longitude=-97.7410, notes="Demo B2B customer account."),
    ])
    add_people(records, slug, [
        {"key": "maya-chen", "first_name": "Maya", "last_name": "Chen",
         "person_type": "staff", "person_subtype": "store_manager", "primary_role": "Store Manager",
         "engagement_model": "employed", "status": "active", "availability_status": "available",
         "start_date": today(-500), "phone": "+1-555-0131", "email": "maya.chen@demo.newsconseen.com",
         "city": "Austin", "region": "TX", "country": "USA", "latitude": 30.2690, "longitude": -97.7440,
         "notes": "Owns inventory, staffing, and customer follow-up."},
        {"key": "eli-james", "first_name": "Eli", "last_name": "James",
         "person_type": "staff", "person_subtype": "sales_associate", "primary_role": "Sales Associate",
         "engagement_model": "employed", "status": "active", "availability_status": "busy",
         "start_date": today(-80), "email": "eli.james@demo.newsconseen.com",
         "city": "Austin", "region": "TX", "country": "USA"},
        {"key": "rachel-customer", "first_name": "Rachel", "last_name": "Stone",
         "person_type": "client", "person_subtype": "loyalty_customer", "primary_role": "Customer",
         "engagement_model": "subscribed", "status": "active", "availability_status": "available",
         "email": "rachel.stone@example.com", "city": "Austin", "region": "TX", "country": "USA",
         "notes": "Demo repeat customer for retention questions."},
    ])
    records["products"].extend([
        row("products", slug, "coffee-maker", product_name="Compact Coffee Maker",
            item_type="physical", item_subtype="appliance", item_class="serialized",
            item_brand="DemoHome", unit_of_measure="unit", stock_quantity=6,
            reorder_level=10, price=79.99, cost=43.50, sku="RTL-CF-100",
            enterprise_id=company_id(slug), description="Below reorder point."),
        row("products", slug, "notebook-pack", product_name="Notebook 5-Pack",
            item_type="physical", item_subtype="stationery", item_class="non_perishable",
            item_brand="DemoOffice", unit_of_measure="pack", stock_quantity=95,
            reorder_level=30, price=12.99, cost=5.20, sku="RTL-NB-005",
            enterprise_id=company_id(slug)),
        row("products", slug, "gift-card", product_name="Digital Gift Card",
            item_type="digital", item_subtype="gift_card", item_class="unrestricted",
            unit_of_measure="card", stock_quantity=999, reorder_level=0,
            price=25, cost=0, sku="RTL-GC-025", enterprise_id=company_id(slug)),
    ])
    records["services"].append(row("services", slug, "device-setup", name="Device Setup",
        service_name="Device Setup", service_type="retail_service", service_subtype="setup",
        price=29, unit_of_measure="setup", duration_minutes=20, is_active=True,
        enterprise_id=company_id(slug)))
    records["tasks"].extend([
        row("tasks", slug, "reorder-coffee", title="Reorder compact coffee makers",
            description="Inventory is below reorder level.", task_type="inventory_review",
            status="open", priority="high", due_date=today(1), assigned_to_name="Maya Chen",
            enterprise_id=company_id(slug), enterprise="Newsconseen Demo Retail Shop"),
        row("tasks", slug, "vip-follow-up", title="Follow up with repeat customer",
            description="Offer device setup after recent purchase.", task_type="customer_success",
            status="pending", priority="normal", due_date=today(4), assigned_to_name="Eli James",
            enterprise_id=company_id(slug), enterprise="Newsconseen Demo Retail Shop",
            related_person="Rachel Stone", related_person_id=did(slug, "persons", "rachel-customer")),
    ])
    add_financials(records, slug, [
        {"key": "pos-sale-1", "reference_number": "RTL-SALE-8001",
         "description": "Coffee maker and setup service", "transaction_type": "sale",
         "payment_status": "paid", "amount": 108.99, "person_id": did(slug, "persons", "rachel-customer"),
         "person_name": "Rachel Stone", "product_id": did(slug, "products", "coffee-maker"),
         "product_name": "Compact Coffee Maker"},
        {"key": "supplier-invoice", "reference_number": "RTL-BILL-4108",
         "description": "Inventory replenishment from wholesaler", "transaction_type": "expense",
         "payment_status": "partial", "amount": 2500, "amount_paid": 900, "net_amount": -2500,
         "due_date": today(8)},
    ])
    records["documents"].append(row("documents", slug, "lease", title="Retail Lease",
        document_type="lease", entity_ref_type="enterprise", entity_ref_id=company_id(slug),
        issue_date=today(-365), expiry_date=today(120), status="active"))
    records["schedules"].append(row("schedules", slug, "daily-close", name="Daily Closeout",
        title="Daily Closeout", schedule_type="retail_ops", frequency="daily",
        start_time="18:30", end_time="19:00", start_date=today(-60), is_active=True,
        entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    records["signals"].extend([
        row("signals", slug, "foot-traffic", name="Foot Traffic",
            signal_type="foot_traffic", numeric_value=148, unit="visits", source="demo_pos",
            entity_ref_type="enterprise", entity_ref_id=company_id(slug), is_anomaly=False,
            recorded_at=now_iso()),
        row("signals", slug, "margin-drop", name="Gross Margin Drop",
            signal_type="margin", numeric_value=18.5, unit="percent", source="demo_pos",
            entity_ref_type="product", entity_ref_id=did(slug, "products", "coffee-maker"),
            is_anomaly=True, recorded_at=now_iso(), notes="Margin below target threshold."),
    ])
    records["risks"].append(row("risks", slug, "stockout", title="Coffee maker stockout risk",
        description="Fast-moving SKU is below reorder point with recent demand.",
        risk_type="inventory", severity="medium", likelihood="high", impact="medium",
        status="open", mitigation_notes="Create supplier purchase order.",
        entity_ref_type="product", entity_ref_id=did(slug, "products", "coffee-maker")))
    records["opportunities"].append(row("opportunities", slug, "service-attach",
        title="Increase setup-service attach rate", description="Offer setup service on every appliance sale.",
        opportunity_type="revenue_growth", estimated_value=6200, confidence=74, status="open",
        entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    add_intelligence(records, slug, "Retail")
    return records


def build_school() -> dict[str, list[dict[str, Any]]]:
    slug = "school"
    records = common_company(
        slug, "Newsconseen Demo School", "private_school", 82,
        "Educational Services", "Denver", "CO", 39.7392, -104.9903,
        enterprise_type="nonprofit",
    )
    records["enterprises"].append(row(
        "enterprises", slug, "district-partner", enterprise_name="Front Range Education Foundation",
        enterprise_type="nonprofit", enterprise_subtype="grant_maker", sic_sector_id=83,
        sic_sector_name="Social Services", enterprise_tier="unit", status="active",
        operating_status="open", city="Denver", region="CO", country="USA",
        latitude=39.7450, longitude=-104.9820, notes="Demo grant and scholarship funding partner."))
    add_people(records, slug, [
        {"key": "priya-nair", "first_name": "Priya", "last_name": "Nair",
         "preferred_name": "Dr. Nair", "person_type": "staff", "person_subtype": "principal",
         "primary_role": "Head of School", "engagement_model": "employed", "status": "active",
         "availability_status": "available", "start_date": today(-1100), "phone": "+1-555-0141",
         "email": "priya.nair@demo.newsconseen.com", "city": "Denver", "region": "CO",
         "country": "USA", "latitude": 39.7401, "longitude": -104.9895,
         "notes": "Owns enrollment, staffing, and accreditation decisions."},
        {"key": "owen-fisher", "first_name": "Owen", "last_name": "Fisher",
         "person_type": "staff", "person_subtype": "teacher", "primary_role": "Grade 5 Teacher",
         "engagement_model": "employed", "status": "active", "availability_status": "busy",
         "start_date": today(-360), "phone": "+1-555-0142", "email": "owen.fisher@demo.newsconseen.com",
         "city": "Denver", "region": "CO", "country": "USA", "latitude": 39.7380,
         "longitude": -104.9910, "notes": "Homeroom teacher tracking attendance and grading tasks."},
        {"key": "ivy-morgan", "first_name": "Ivy", "last_name": "Morgan",
         "person_type": "client", "person_subtype": "student", "primary_role": "Student",
         "engagement_model": "enrolled", "status": "active", "availability_status": "available",
         "start_date": today(-200), "email": "guardian.morgan@example.com", "city": "Denver",
         "region": "CO", "country": "USA", "notes": "Demo student with a tuition and attendance record."},
    ])
    records["products"].extend([
        row("products", slug, "uniform-set", product_name="School Uniform Set", item_type="physical",
            item_subtype="apparel", item_class="non_perishable", unit_of_measure="set",
            stock_quantity=22, reorder_level=15, price=64, cost=38, sku="SCH-UNI-01",
            enterprise_id=company_id(slug)),
        row("products", slug, "loaner-laptop", product_name="Loaner Laptop", item_type="physical",
            item_subtype="equipment", item_class="serialized", unit_of_measure="unit",
            stock_quantity=5, reorder_level=3, price=0, cost=420, sku="SCH-LAP-01",
            enterprise_id=company_id(slug), description="Low stock for the 1:1 device loan program."),
    ])
    records["services"].extend([
        row("services", slug, "tuition-annual", name="Annual Tuition", service_name="Annual Tuition",
            service_type="academic", service_subtype="enrollment", price=9800, unit_of_measure="year",
            is_active=True, enterprise_id=company_id(slug)),
        row("services", slug, "after-school", name="After-School Program", service_name="After-School Program",
            service_type="enrichment", service_subtype="tutoring", price=180, unit_of_measure="month",
            duration_minutes=90, is_active=True, enterprise_id=company_id(slug)),
    ])
    records["tasks"].extend([
        row("tasks", slug, "attendance-follow-up", title="Follow up on attendance drop",
            description="Ivy Morgan has three unexcused absences this month.", task_type="student_follow_up",
            status="open", priority="high", due_date=today(0), assigned_to_email="owen.fisher@demo.newsconseen.com",
            assigned_to_name="Owen Fisher", enterprise_id=company_id(slug), enterprise="Newsconseen Demo School",
            related_person="Ivy Morgan", related_person_id=did(slug, "persons", "ivy-morgan")),
        row("tasks", slug, "tuition-followup", title="Follow up on overdue tuition balance",
            description="Autumn term tuition balance is unpaid past due date.", task_type="billing_follow_up",
            status="pending", priority="high", due_date=today(2), assigned_to_name="Priya Nair",
            enterprise_id=company_id(slug), enterprise="Newsconseen Demo School"),
    ])
    add_financials(records, slug, [
        {"key": "tuition-invoice", "reference_number": "SCH-INV-3001",
         "description": "Autumn term tuition — Ivy Morgan", "transaction_type": "tuition",
         "payment_status": "unpaid", "amount": 3200, "amount_paid": 0, "net_amount": 3200,
         "due_date": today(-3), "person_id": did(slug, "persons", "ivy-morgan"),
         "person_name": "Ivy Morgan"},
        {"key": "supply-purchase", "reference_number": "SCH-BILL-1102",
         "description": "Classroom and uniform supply order", "transaction_type": "supply_purchase",
         "payment_status": "paid", "amount": 1450, "net_amount": -1450,
         "product_id": did(slug, "products", "uniform-set"), "product_name": "School Uniform Set"},
    ])
    records["documents"].extend([
        row("documents", slug, "accreditation", title="School Accreditation Certificate",
            document_type="certification", entity_ref_type="enterprise", entity_ref_id=company_id(slug),
            issue_date=today(-500), expiry_date=today(40), status="active",
            notes="Renewal window approaching for compliance-risk testing."),
        row("documents", slug, "grant-agreement", title="Foundation Grant Agreement",
            document_type="contract", entity_ref_type="enterprise",
            entity_ref_id=did(slug, "enterprises", "district-partner"),
            issue_date=today(-150), expiry_date=today(215), status="active"),
    ])
    records["schedules"].append(row("schedules", slug, "parent-conferences", name="Parent-Teacher Conferences",
        title="Parent-Teacher Conferences", schedule_type="academic_ops", frequency="monthly",
        day_of_month=15, start_time="15:00", end_time="18:00", start_date=today(-60),
        is_active=True, entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    records["signals"].append(row("signals", slug, "attendance-rate", name="Weekly Attendance Rate",
        signal_type="attendance", numeric_value=88.4, unit="percent", source="demo_attendance_system",
        entity_ref_type="enterprise", entity_ref_id=company_id(slug), is_anomaly=True,
        recorded_at=now_iso(), notes="Below the 95% target threshold."))
    records["risks"].append(row("risks", slug, "attendance-decline", title="Declining attendance risk",
        description="Weekly attendance rate has dropped below the accreditation-safe threshold.",
        risk_type="operational", severity="medium", likelihood="medium", impact="high",
        status="open", mitigation_notes="Contact guardians and log follow-up outcomes.",
        entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    records["opportunities"].append(row("opportunities", slug, "after-school-growth",
        title="Expand after-school program enrollment", description="Waitlist demand supports a second cohort.",
        opportunity_type="revenue_growth", estimated_value=14400, confidence=70, status="open",
        entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    add_intelligence(records, slug, "School")
    return records


def build_ngo() -> dict[str, list[dict[str, Any]]]:
    slug = "ngo"
    records = common_company(
        slug, "Newsconseen Demo NGO", "community_nonprofit", 83,
        "Social Services", "Nairobi", "Nairobi County", -1.2921, 36.8219,
        enterprise_type="nonprofit",
    )
    records["enterprises"].append(row(
        "enterprises", slug, "funding-partner", enterprise_name="Global Relief Fund",
        enterprise_type="nonprofit", enterprise_subtype="donor_organization", sic_sector_id=83,
        sic_sector_name="Social Services", enterprise_tier="unit", status="active",
        operating_status="open", city="Nairobi", region="Nairobi County", country="Kenya",
        latitude=-1.2833, longitude=36.8172, notes="Demo institutional donor and grant partner."))
    add_people(records, slug, [
        {"key": "daniel-otieno", "first_name": "Daniel", "last_name": "Otieno",
         "person_type": "staff", "person_subtype": "program_director", "primary_role": "Program Director",
         "engagement_model": "employed", "status": "active", "availability_status": "available",
         "start_date": today(-800), "phone": "+254-700-100200", "email": "daniel.otieno@demo.newsconseen.com",
         "city": "Nairobi", "region": "Nairobi County", "country": "Kenya", "latitude": -1.2900,
         "longitude": 36.8200, "notes": "Owns program delivery and grant compliance."},
        {"key": "wanjiku-field", "first_name": "Wanjiku", "last_name": "Kamau",
         "person_type": "volunteer", "person_subtype": "field_officer", "primary_role": "Field Officer",
         "engagement_model": "volunteer", "status": "active", "availability_status": "available",
         "start_date": today(-90), "email": "wanjiku.kamau@demo.newsconseen.com",
         "city": "Nairobi", "region": "Nairobi County", "country": "Kenya",
         "notes": "Coordinates distribution and beneficiary intake in the field."},
        {"key": "amara-beneficiary", "first_name": "Amara", "last_name": "Njoroge",
         "person_type": "client", "person_subtype": "beneficiary", "primary_role": "Beneficiary",
         "engagement_model": "enrolled", "status": "active", "availability_status": "available",
         "start_date": today(-45), "city": "Nairobi", "region": "Nairobi County", "country": "Kenya",
         "notes": "Demo beneficiary enrolled in the relief distribution program."},
    ])
    records["products"].extend([
        row("products", slug, "relief-kit", product_name="Relief Supplies Kit", item_type="physical",
            item_subtype="relief_supplies", item_class="consumable", unit_of_measure="kit",
            stock_quantity=32, reorder_level=25, price=0, cost=18, sku="NGO-KIT-01",
            enterprise_id=company_id(slug), description="Below the safety stock threshold for this month's distribution."),
        row("products", slug, "water-filter", product_name="Household Water Filter", item_type="physical",
            item_subtype="water_sanitation", item_class="reusable", unit_of_measure="unit",
            stock_quantity=12, reorder_level=10, price=0, cost=22, sku="NGO-WF-01",
            enterprise_id=company_id(slug)),
    ])
    records["services"].append(row("services", slug, "health-training", name="Community Health Training",
        service_name="Community Health Training", service_type="community_program",
        service_subtype="training", price=0, unit_of_measure="session", duration_minutes=120,
        is_active=True, enterprise_id=company_id(slug)))
    records["tasks"].extend([
        row("tasks", slug, "distribution-ward4", title="Distribute relief supplies to Ward 4",
            description="Monthly distribution is scheduled and stock is nearing the reorder threshold.",
            task_type="field_work", status="open", priority="urgent", due_date=today(1),
            assigned_to_email="wanjiku.kamau@demo.newsconseen.com", assigned_to_name="Wanjiku Kamau",
            enterprise_id=company_id(slug), enterprise="Newsconseen Demo NGO"),
        row("tasks", slug, "intake-followup", title="Follow up on new beneficiary intake",
            description="Complete household assessment for Amara Njoroge.", task_type="beneficiary_follow_up",
            status="pending", priority="normal", due_date=today(3), assigned_to_name="Daniel Otieno",
            enterprise_id=company_id(slug), enterprise="Newsconseen Demo NGO",
            related_person="Amara Njoroge", related_person_id=did(slug, "persons", "amara-beneficiary")),
    ])
    add_financials(records, slug, [
        {"key": "grant-received", "reference_number": "NGO-GRT-5001",
         "description": "Quarterly program grant — Global Relief Fund", "transaction_type": "grant",
         "payment_status": "paid", "amount": 22000, "amount_paid": 22000, "net_amount": 22000,
         "date": today(-10)},
        {"key": "individual-donation", "reference_number": "NGO-DON-5002",
         "description": "Individual donor contribution", "transaction_type": "donation",
         "payment_status": "paid", "amount": 500, "amount_paid": 500, "net_amount": 500,
         "date": today(-4)},
        {"key": "relief-supply-purchase", "reference_number": "NGO-BILL-6003",
         "description": "Relief kit restock order", "transaction_type": "supply_purchase",
         "payment_status": "unpaid", "amount": 3600, "amount_paid": 0, "net_amount": -3600,
         "due_date": today(6), "product_id": did(slug, "products", "relief-kit"),
         "product_name": "Relief Supplies Kit"},
    ])
    records["documents"].extend([
        row("documents", slug, "ngo-registration", title="NGO Registration Certificate",
            document_type="license", entity_ref_type="enterprise", entity_ref_id=company_id(slug),
            issue_date=today(-900), expiry_date=today(260), status="active"),
        row("documents", slug, "grant-compliance-report", title="Grant Compliance Report Q3",
            document_type="report", entity_ref_type="enterprise",
            entity_ref_id=did(slug, "enterprises", "funding-partner"),
            issue_date=today(-20), expiry_date=today(70), status="active",
            notes="Due for renewal submission for donor compliance testing."),
    ])
    records["schedules"].append(row("schedules", slug, "monthly-distribution", name="Monthly Distribution Day",
        title="Monthly Distribution Day", schedule_type="field_ops", frequency="monthly",
        day_of_month=1, start_time="08:00", end_time="14:00", start_date=today(-90),
        is_active=True, entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    records["signals"].append(row("signals", slug, "kit-stock-level", name="Relief Kit Stock Level",
        signal_type="inventory_level", numeric_value=32, unit="kits", source="demo_field_report",
        entity_ref_type="product", entity_ref_id=did(slug, "products", "relief-kit"),
        is_anomaly=True, recorded_at=now_iso(), notes="Approaching reorder threshold before distribution day."))
    records["risks"].append(row("risks", slug, "supply-stockout", title="Relief supply stockout risk",
        description="Kit stock is close to the reorder threshold ahead of the scheduled distribution.",
        risk_type="inventory", severity="high", likelihood="medium", impact="high",
        status="open", mitigation_notes="Expedite the pending relief-kit restock order.",
        entity_ref_type="product", entity_ref_id=did(slug, "products", "relief-kit")))
    records["opportunities"].append(row("opportunities", slug, "donor-expansion",
        title="Expand recurring individual donor program", description="Recent one-time donors show repeat-giving potential.",
        opportunity_type="fundraising_growth", estimated_value=12000, confidence=65, status="open",
        entity_ref_type="enterprise", entity_ref_id=company_id(slug)))
    add_intelligence(records, slug, "NGO")
    return records


def merge_records(selected: list[str]) -> dict[str, list[dict[str, Any]]]:
    builders = {
        "clinic": build_clinic, "farm": build_farm, "retail": build_retail,
        "school": build_school, "ngo": build_ngo,
    }
    merged: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for slug in selected:
        for table, rows in builders[slug]().items():
            merged[table].extend(rows)
    for table in ENTITY_TABLES:
        merged.setdefault(table, [])
    return merged


def filtered(table: str, record: dict[str, Any]) -> dict[str, Any]:
    allowed = TABLE_COLUMNS.get(table)
    if not allowed:
        return record
    return {k: v for k, v in record.items() if k in allowed and v is not None}


def supabase_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(
            "Missing Supabase config. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
            "in .env, .env.local, python_layer/.env, or your shell."
        )
    return url.rstrip("/"), key


def upsert_table(url: str, key: str, table: str, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    payload = [filtered(table, r) for r in rows]
    resp = requests.post(
        f"{url}/rest/v1/{table}",
        params={"on_conflict": "id"},
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        data=json.dumps(payload, default=str),
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"{table} upsert failed: HTTP {resp.status_code} {resp.text[:500]}")
    return len(rows)


def seed_idjwi_memory(records: dict[str, list[dict[str, Any]]], dry_run: bool) -> int:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return 0

    sys.path.insert(0, str(ROOT / "python_layer"))
    from sqlalchemy import create_engine
    from copilot.idjwi_memory import ensure_table, remember

    if dry_run:
        return 0

    engine = create_engine(database_url, future=True)
    ensure_table(engine)
    company_names = {e["company_id"]: e["enterprise_name"] for e in records["enterprises"] if e["id"] == e["company_id"]}
    memories = []
    for cid, name in company_names.items():
        slug = (
            "clinic" if "Clinic" in name else
            "farm" if "Farm" in name else
            "school" if "School" in name else
            "ngo" if "NGO" in name else
            "retail"
        )
        memories.extend([
            {
                "company_id": cid,
                "key": "demo_company_purpose",
                "memory_type": "domain_context",
                "value": {
                    "company_name": name,
                    "purpose": "Synthetic tenant for validating ontology traversal, analytics, risk analysis, and Idjwi answers.",
                    "safe_to_modify": True,
                },
            },
            {
                "company_id": cid,
                "key": "default_question_behavior",
                "memory_type": "preference",
                "value": {
                    "answer_style": "Use graph evidence first, then analytics, then identify missing data.",
                    "include": ["direct_answer", "evidence", "risks", "recommended_next_actions"],
                },
            },
            {
                "company_id": cid,
                "key": "graph_analysis_contract",
                "memory_type": "analysis_capability",
                "value": {
                    "can_analyze": ["company graph", "relationships", "central entities", "isolated records", "risk propagation"],
                    "expected_visuals": ["entity graph", "bar chart", "line chart", "map when addresses exist"],
                },
            },
            {
                "company_id": cid,
                "key": f"{slug}_critical_metrics",
                "memory_type": "metric_definition",
                "value": {
                    "primary_metrics": [
                        "operational_risk_score",
                        "relationship_coverage",
                        "open_high_priority_tasks",
                        "anomaly_signal_count",
                    ],
                },
            },
        ])
    for memory in memories:
        remember(
            company_id=memory["company_id"],
            key=memory["key"],
            value=memory["value"],
            memory_type=memory["memory_type"],
            scope="company",
            owner="idjwi",
            confidence=1.0,
            source="demo_company_seeder",
            review_status="confirmed",
            metadata={"seeded_by": CREATED_BY},
            engine=engine,
        )
    engine.dispose()
    return len(memories)


def trigger_etl(company_ids: list[str]) -> tuple[int, int]:
    base_url = (
        os.getenv("PYTHON_LAYER_URL")
        or os.getenv("RAILWAY_URL")
        or os.getenv("VITE_RAILWAY_URL")
        or os.getenv("VITE_API_BASE_URL")
    )
    if not base_url:
        return 0, 0

    headers = {}
    cron_secret = os.getenv("CRON_SECRET")
    if cron_secret:
        headers["x-cron-secret"] = cron_secret

    ok = 0
    failed = 0
    base_url = base_url.rstrip("/")
    for cid in company_ids:
        for endpoint in ETL_ENDPOINTS:
            try:
                resp = requests.post(
                    f"{base_url}/load/{endpoint}",
                    params={"company_id": cid},
                    headers=headers,
                    timeout=20,
                )
                if resp.status_code < 400:
                    ok += 1
                else:
                    failed += 1
            except requests.RequestException:
                failed += 1
    return ok, failed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Newsconseen demo company data.")
    parser.add_argument("--only", choices=["clinic", "farm", "retail", "school", "ngo"], action="append",
                        help="Seed only one company. Can be repeated.")
    parser.add_argument("--dry-run", action="store_true", help="Print counts without writing data.")
    parser.add_argument("--skip-etl", action="store_true",
                        help="Do not trigger python_layer /load/* refresh endpoints after seeding.")
    return parser.parse_args()


def main() -> int:
    load_env()
    args = parse_args()
    selected = args.only or ["clinic", "farm", "retail", "school", "ngo"]
    records = merge_records(selected)
    counts = {table: len(rows) for table, rows in records.items() if rows}

    print("Newsconseen demo company seeder")
    print(f"Companies: {', '.join(selected)}")
    for slug in selected:
        print(f"  {slug}: company_id={company_id(slug)}")
    print("Rows:")
    for table in ENTITY_TABLES:
        if counts.get(table):
            print(f"  {table}: {counts[table]}")

    if args.dry_run:
        print("Dry run only. No rows were written.")
        return 0

    url, key = supabase_config()
    total = 0
    for table in ENTITY_TABLES:
        total += upsert_table(url, key, table, records[table])
    memories = seed_idjwi_memory(records, dry_run=False)
    etl_ok = etl_failed = 0
    if not args.skip_etl:
        etl_ok, etl_failed = trigger_etl([company_id(slug) for slug in selected])
    print(f"Seeded {total} Supabase rows.")
    if memories:
        print(f"Seeded {memories} Idjwi memory rows in analytics.idjwi_memory.")
    else:
        print("Skipped Idjwi memory seed because DATABASE_URL is not configured.")
    if args.skip_etl:
        print("Skipped ETL refresh by request.")
    elif etl_ok or etl_failed:
        print(f"Triggered ETL refresh calls: {etl_ok} succeeded, {etl_failed} failed.")
    else:
        print("Skipped ETL refresh because PYTHON_LAYER_URL/RAILWAY_URL is not configured.")
    print("Done. Rerun this command any time; demo rows use stable IDs and will be updated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
