import httpx

class OllamaClient:
    def __init__(self, base_url: str, model: str):
        self.base_url, self.model = base_url, model

    async def chat(self, messages: list[dict], system: str = "") -> str:
        payload = {"model": self.model, "stream": False, "messages": ([{"role":"system","content":system}] if system else []) + messages}
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
