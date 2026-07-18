"""
Provider adapters for Idjwi reasoning.

The adapter boundary keeps Idjwi's memory/tools/capabilities stable while LLM
providers change. Anthropic currently supports grounded tool loops. OpenAI and
Gemini adapters provide direct reasoning responses and are ready for native tool
adapter expansion.
"""

from dataclasses import dataclass
from typing import Any

from .llm_registry import ModelSpec


@dataclass
class TextBlock:
    text: str
    type: str = "text"


@dataclass
class ToolUseBlock:
    id: str
    name: str
    input: dict
    type: str = "tool_use"


@dataclass
class AdapterResponse:
    content: list
    stop_reason: str = "end_turn"


def _messages_to_text(messages: list[dict]) -> str:
    chunks = []
    for message in messages:
        role = message.get("role", "user")
        content = message.get("content", "")
        if isinstance(content, str):
            chunks.append(f"{role}: {content}")
        else:
            chunks.append(f"{role}: {content}")
    return "\n\n".join(chunks)


class AnthropicAdapter:
    def __init__(self, spec: ModelSpec, api_key: str | None = None):
        self.spec = spec
        self.api_key = api_key

    def create(self, *, system: str, tools: list, messages: list[dict]) -> Any:
        import anthropic
        client = anthropic.Anthropic(api_key=self.api_key) if self.api_key else anthropic.Anthropic()
        return client.messages.create(
            model=self.spec.id,
            max_tokens=self.spec.max_tokens,
            system=system,
            tools=tools,
            messages=messages,
        )


class OpenAIAdapter:
    def __init__(self, spec: ModelSpec, api_key: str | None = None):
        self.spec = spec
        self.api_key = api_key

    def create(self, *, system: str, tools: list, messages: list[dict]) -> AdapterResponse:
        from openai import OpenAI
        client = OpenAI(api_key=self.api_key) if self.api_key else OpenAI()
        chat_messages = [{"role": "system", "content": system}]
        for message in messages:
            if isinstance(message.get("content"), str):
                chat_messages.append({
                    "role": message.get("role", "user"),
                    "content": message.get("content", ""),
                })
            else:
                chat_messages.append({
                    "role": message.get("role", "user"),
                    "content": str(message.get("content", "")),
                })
        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": tool.get("name"),
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {"type": "object", "properties": {}}),
                },
            }
            for tool in tools
            if tool.get("name")
        ]
        kwargs = {
            "model": self.spec.id,
            "messages": chat_messages,
            "max_tokens": self.spec.max_tokens,
        }
        if openai_tools:
            kwargs["tools"] = openai_tools
            kwargs["tool_choice"] = "auto"
        response = client.chat.completions.create(**kwargs)
        message = response.choices[0].message
        if getattr(message, "tool_calls", None):
            import json
            blocks = []
            for call in message.tool_calls:
                try:
                    args = json.loads(call.function.arguments or "{}")
                except Exception:
                    args = {}
                blocks.append(ToolUseBlock(id=call.id, name=call.function.name, input=args))
            return AdapterResponse(content=blocks, stop_reason="tool_use")
        text = message.content or ""
        return AdapterResponse(content=[TextBlock(text=text)])


class GeminiAdapter:
    def __init__(self, spec: ModelSpec, api_key: str | None = None):
        self.spec = spec
        self.api_key = api_key

    def create(self, *, system: str, tools: list, messages: list[dict]) -> AdapterResponse:
        import google.generativeai as genai
        if self.api_key:
            genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(self.spec.id, system_instruction=system)
        response = model.generate_content(_messages_to_text(messages))
        return AdapterResponse(content=[TextBlock(text=getattr(response, "text", "") or "")])


def get_adapter(spec: ModelSpec, api_key: str | None = None):
    if spec.provider == "anthropic":
        return AnthropicAdapter(spec, api_key=api_key)
    if spec.provider == "openai":
        return OpenAIAdapter(spec, api_key=api_key)
    if spec.provider == "google":
        return GeminiAdapter(spec, api_key=api_key)
    raise RuntimeError(f"Unsupported Idjwi provider: {spec.provider}")
