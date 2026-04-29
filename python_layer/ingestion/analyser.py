"""
ingestion/analyser.py
LLM-powered entity classification, field mapping, and relationship inference.

Makes a single tool-use call to claude-sonnet-4-6, passing column profiles +
sample rows as evidence. Returns a structured AnalysisResult dict.
"""
import json
import logging
from typing import Any

import anthropic

from ingestion.prompts import SYSTEM_PROMPT, TOOL_SCHEMA

logger = logging.getLogger(__name__)

_MODEL   = "claude-sonnet-4-6"
_MAX_TOKENS = 4096


def _build_user_message(
    source_name: str,
    columns: list[str],
    profiles: list[dict],
    sample_rows: list[dict],
    row_count: int,
) -> str:
    profile_lines = []
    for p in profiles:
        signals = ", ".join(p.get("pattern_signals", [])) or "—"
        samples = " | ".join(p.get("sample_values", [])[:4]) or "—"
        foreign = " [FK?]" if p.get("foreign_ref") else ""
        profile_lines.append(
            f"  {p['column']}{foreign}: type={p['inferred_type']}, "
            f"cardinality={p['cardinality']}, null_rate={p['null_rate']:.0%}, "
            f"signals=[{signals}], samples=[{samples}]"
        )

    profile_block = "\n".join(profile_lines)
    sample_block  = json.dumps(sample_rows[:5], indent=2, default=str)

    return (
        f"Source file: {source_name}\n"
        f"Total rows: {row_count}\n"
        f"Columns ({len(columns)}):\n{profile_block}\n\n"
        f"Sample rows (up to 5):\n{sample_block}\n\n"
        "Please call analyse_dataset with your mapping plan."
    )


def analyse(
    source_name: str,
    columns: list[str],
    profiles: list[dict],
    sample_rows: list[dict],
    row_count: int,
    api_key: str,
) -> dict[str, Any]:
    """
    Call the LLM analyser and return a parsed AnalysisResult.

    Returns:
        {
          "entity_splits":       [...],
          "field_map":           [...],
          "relationships":       [...],
          "overall_confidence":  float,
          "analyst_notes":       str,
        }
    Raises:
        ValueError if the LLM did not call the tool or returned malformed output.
    """
    client = anthropic.Anthropic(api_key=api_key)

    user_msg = _build_user_message(source_name, columns, profiles, sample_rows, row_count)

    logger.info("Ingestion analyser: calling %s for '%s' (%d cols, %d rows)",
                _MODEL, source_name, len(columns), row_count)

    response = client.messages.create(
        model=_MODEL,
        max_tokens=_MAX_TOKENS,
        system=SYSTEM_PROMPT,
        tools=[TOOL_SCHEMA],
        tool_choice={"type": "any"},
        messages=[{"role": "user", "content": user_msg}],
    )

    # Extract the tool_use block
    tool_block = next(
        (b for b in response.content if b.type == "tool_use" and b.name == "analyse_dataset"),
        None,
    )
    if tool_block is None:
        raise ValueError("LLM did not call analyse_dataset — no tool_use block in response")

    result: dict = tool_block.input
    logger.info("Ingestion analyser: overall_confidence=%.2f, entities=%s",
                result.get("overall_confidence", 0),
                [e["entity_type"] for e in result.get("entity_splits", [])])
    return result
