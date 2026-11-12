import asyncio
import json

import httpx
import pytest

from aci.llm import DeepSeekClient


def test_deepseek_chat_uses_openai_compatible_endpoint_and_bearer_key():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["authorization"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.read().decode("utf-8"))
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Hello from DeepSeek"}}]},
        )

    client = DeepSeekClient(
        "https://api.deepseek.com",
        "deepseek-flash",
        "test-secret",
        transport=httpx.MockTransport(handler),
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
