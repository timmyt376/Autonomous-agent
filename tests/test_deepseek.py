import asyncio
import json

import httpx
import pytest

from aci.llm import DeepSeekClient


class RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(self, seen):
        self.seen = seen

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.seen["url"] = str(request.url)
        self.seen["authorization"] = request.headers.get("authorization")
        self.seen["body"] = json.loads((await request.aread()).decode("utf-8"))
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Hello from DeepSeek"}}]},
            request=request,
        )


def test_deepseek_chat_uses_openai_compatible_endpoint_and_bearer_key():
    seen = {}
    client = DeepSeekClient(
        "https://api.deepseek.com",
        "deepseek-flash",
        "test-secret",
        transport=RecordingTransport(seen),
    )

    reply = asyncio.run(client.chat([{"role": "user", "content": "Hi"}], "System context"))

    assert reply == "Hello from DeepSeek"
    assert seen["url"] == "https://api.deepseek.com/chat/completions"
    assert seen["authorization"] == "Bearer test-secret"
    assert seen["body"]["model"] == "deepseek-flash"
    assert seen["body"]["messages"][0] == {"role": "system", "content": "System context"}


def test_deepseek_requires_an_api_key():
    client = DeepSeekClient("https://api.deepseek.com", "deepseek-flash")
    with pytest.raises(RuntimeError, match="API key is not configured"):
        asyncio.run(client.chat([{"role": "user", "content": "Hi"}]))
