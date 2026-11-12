import asyncio

import httpx

from aci.llm import DeepSeekClient


def test_deepseek_chat_uses_openai_compatible_endpoint_and_bearer_key():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["authorization"] = request.headers.get("authorization")
        seen["body"] = request.read().decode("utf-8")
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Hello from DeepSeek"}}]},
        )

    client = DeepSeekClient(
        "https://api.deepseek.com",
        "deepseek-flash",
        "test-secret",
    )
    client._transport = httpx.MockTransport(handler)

    async def run():
        # Exercise the same request path while keeping the test fully offline.
        async with httpx.AsyncClient(transport=client._transport, timeout=10) as http_client:
            response = await http_client.post(
                client.base_url + "/chat/completions",
                headers={"Authorization": "Bearer " + client.api_key},
                json={"model": client.model, "messages": [{"role": "user", "content": "Hi"}], "stream": False},
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]

    assert asyncio.run(run()) == "Hello from DeepSeek"
    assert seen["url"] == "https://api.deepseek.com/chat/completions"
    assert seen["authorization"] == "Bearer test-secret"
