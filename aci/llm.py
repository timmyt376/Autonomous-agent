import json
from typing import Callable

import httpx


class OllamaClient:
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def chat(self, messages: list[dict], system: str = "") -> str:
        prompt_messages = ([{"role": "system", "content": system}] if system else []) + messages
        payload = {"model": self.model, "stream": False, "messages": prompt_messages}
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
        return data.get("message", {}).get("content", "")

    async def status(self):
        async with httpx.AsyncClient(timeout=4) as client:
            response = await client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            return response.json().get("models", [])

    async def pull(self, model: str, on_update: Callable[[dict], None] | None = None):
        """Pull a model from the Ollama registry and report streaming progress."""
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/pull",
                json={"name": model, "stream": True},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if on_update:
                        on_update(event)
                    if event.get("error"):
                        raise RuntimeError(str(event["error"]))

    async def delete(self, model: str):
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(
                "DELETE",
                f"{self.base_url}/api/delete",
                json={"name": model},
            )
            response.raise_for_status()


class DeepSeekClient:
    """OpenAI-compatible DeepSeek chat-completions client."""

    def __init__(self, base_url: str, model: str, api_key: str = "", transport=None):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key.strip()
        self.transport = transport

    async def chat(self, messages: list[dict], system: str = "") -> str:
        if not self.api_key:
            raise RuntimeError(
                "DeepSeek API key is not configured. Add it in ACI Settings or set DEEPSEEK_API_KEY."
            )

        prompt_messages = ([{"role": "system", "content": system}] if system else []) + messages
        payload = {
            "model": self.model,
            "messages": prompt_messages,
            "stream": False,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=180, transport=self.transport) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            if not response.is_success:
                detail = response.text[:600]
                raise RuntimeError(
                    f"DeepSeek API returned HTTP {response.status_code}: {detail}"
                )
            data = response.json()

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("DeepSeek returned no completion choices.")
        content = (choices[0].get("message") or {}).get("content")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("DeepSeek returned an empty message.")
        return content.strip()

    async def status(self):
        return [
            {"name": "deepseek-flash"},
            {"name": "deepseek-v4-pro"},
        ]
