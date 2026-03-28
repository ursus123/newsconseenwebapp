"""
python_layer/copilot/engine.py
================================
The grounded copilot engine.
Passes TOOL_DEFINITIONS to the Anthropic API so Claude can
call real PostgreSQL query functions before answering.
"""

import json
import logging
import os
import anthropic
from .queries import TOOL_DEFINITIONS, execute_tool

logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# System prompt is built at runtime from operator Enterprise record — see build_system_prompt()
You have access to real-time data tools that query the business's PostgreSQL analytics database.

ALWAYS use the available tools before answering any question about:
- Staff counts, availability, or scheduling
- Client numbers, retention, or discharge risk
- Revenue, invoices, or financial performance
- Task completion rates or visit outcomes
- Stock levels or inventory alerts
- Branch or network performance

Answer in plain language the operator can act on immediately.
When you have data, lead with the numbers first, then the interpretation.
Never make up numbers. If a tool returns no data, say so clearly.
Keep answers concise — operators are busy. Use bullet points for lists."""


async def ask(question: str, company_id: str, history: list = None) -> str:
    """
    Full grounded copilot call with tool loop.
    Returns a final text answer grounded in real data.
    """
    messages = list(history or [])
    messages.append({"role": "user", "content": question})

    # ── Tool loop — up to 5 rounds ───────────────────────────────────────────
    for _ in range(5):
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            tools=TOOL_DEFINITIONS,
            messages=messages,
        )

        # If Claude is done (no more tool calls) return the text
        if response.stop_reason == "end_turn":
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            return "\n".join(text_blocks)

        # If Claude wants to call tools — execute them all
        if response.stop_reason == "tool_use":
            # Add Claude's response (with tool_use blocks) to messages
            messages.append({"role": "assistant", "content": response.content})

            # Execute each tool call and collect results
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                logger.info(
                    "Copilot calling tool: %s with input: %s",
                    block.name,
                    block.input,
                )

                result = execute_tool(
                    tool_name=block.name,
                    tool_input=block.input,
                    company_id=company_id,  # always injected server-side
                )

                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(result, default=str),
                })

            # Add tool results to messages and loop again
            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop reason
        break

    # Fallback — extract any text from last response
    if response and response.content:
        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        if text_blocks:
            return "\n".join(text_blocks)

    return "I was unable to retrieve the data needed to answer your question."


async def ask_stream(question: str, company_id: str, history: list = None):
    """
    Streaming version — yields text chunks as they arrive.
    Tool calls are executed silently, then the final answer streams.
    """
    # Run the full tool loop first (non-streaming)
    # then stream the final answer for UX
    full_answer = await ask(question, company_id, history)

    # Simulate streaming by yielding the answer in chunks
    chunk_size = 6
    for i in range(0, len(full_answer), chunk_size):
        yield full_answer[i:i + chunk_size]
