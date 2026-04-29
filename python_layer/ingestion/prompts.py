"""
ingestion/prompts.py
System prompt and tool schema for the LLM analyser call.
"""

SYSTEM_PROMPT = """
You are the Newsconseen Ontology Ingestion Analyst.

Your job is to analyse a tabular dataset (described by column profiles and sample rows)
and produce a structured mapping plan that fits the Newsconseen 15-entity ontology.

## Newsconseen Ontology — 15 canonical entities

Core (7):
  Person        — any human: staff, client, contact, volunteer
  Enterprise    — any organisation or location: company, branch, clinic, school
  Product       — any item, service, or resource
  Task          — any activity, visit, appointment, work order, shift
  Transaction   — any financial record: invoice, payment, expense, payroll
  Relationship  — a named link between any two entities
  Address       — any physical or postal location

Operational extension (5):
  Document      — managed file: contract, certificate, policy, invoice-as-file
  Schedule      — recurring pattern: daily briefing, weekly inspection
  Signal        — telemetry or measurement: IoT reading, survey score, KPI
  Channel       — communication channel: WhatsApp group, email list
  Territory     — geographic zone: sales territory, delivery zone

Domain-native (3):
  Animal        — individually-tracked living creature: livestock, poultry, pet
  Plot          — land parcel or water body: farm plot, pond
  Observation   — field measurement or reading tied to an Animal, Plot, or Person

## Your output must use the `analyse_dataset` tool exactly once.

Rules:
- A single source file may map to MULTIPLE entities (e.g. a staff roster is Person + Address)
- Each entity_split must have a confidence score (0.0–1.0)
- Each field_map entry maps one source column → one target entity.field
- Relationships are inferred when two entity_splits share a key column
- If a column clearly belongs to multiple entities (e.g. a name column for Person + Enterprise),
  split it — each entity gets its own mapping with is_primary_key where appropriate
- Use snake_case for all entity field names
- Never invent entity types outside the 15 listed above
- If you are uncertain, lower the confidence — do not hallucinate a mapping
"""


TOOL_SCHEMA = {
    "name": "analyse_dataset",
    "description": (
        "Analyse a tabular dataset and produce a structured ontology mapping plan. "
        "Call this exactly once with complete results."
    ),
    "input_schema": {
        "type": "object",
        "required": ["entity_splits", "field_map", "relationships", "overall_confidence", "analyst_notes"],
        "properties": {
            "entity_splits": {
                "type": "array",
                "description": "One entry per Newsconseen entity type detected in this dataset.",
                "items": {
                    "type": "object",
                    "required": ["entity_type", "confidence", "row_coverage", "reason"],
                    "properties": {
                        "entity_type":   {"type": "string", "description": "One of the 15 canonical entity names"},
                        "confidence":    {"type": "number", "description": "0.0–1.0 mapping confidence"},
                        "row_coverage":  {"type": "number", "description": "Fraction of rows that contribute to this entity (0.0–1.0)"},
                        "reason":        {"type": "string", "description": "One sentence explaining the classification"}
                    }
                }
            },
            "field_map": {
                "type": "array",
                "description": "One entry per source column.",
                "items": {
                    "type": "object",
                    "required": ["source_column", "target_entity", "target_field", "confidence"],
                    "properties": {
                        "source_column":   {"type": "string"},
                        "target_entity":   {"type": "string", "description": "One of the 15 canonical entity names"},
                        "target_field":    {"type": "string", "description": "snake_case field name on the target entity"},
                        "confidence":      {"type": "number"},
                        "is_primary_key":  {"type": "boolean", "default": False},
                        "transform_hint":  {"type": "string", "description": "Optional transform needed (e.g. 'parse date', 'split on comma')"}
                    }
                }
            },
            "relationships": {
                "type": "array",
                "description": "Inferred relationships between entity_splits.",
                "items": {
                    "type": "object",
                    "required": ["from_entity", "to_entity", "relationship_label", "join_hint"],
                    "properties": {
                        "from_entity":          {"type": "string"},
                        "to_entity":            {"type": "string"},
                        "relationship_label":   {"type": "string", "description": "e.g. 'employed_by', 'located_at', 'purchased'"},
                        "join_hint":            {"type": "string", "description": "Which source columns link the two entities"}
                    }
                }
            },
            "overall_confidence": {
                "type": "number",
                "description": "Average weighted confidence across all entity_splits"
            },
            "analyst_notes": {
                "type": "string",
                "description": "Any caveats, ambiguities, or suggestions for the operator review step"
            }
        }
    }
}
