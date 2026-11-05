import type { ChatMessage, ConnectionSettings, ModelInfo } from "./types";

function endpoint(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + path;
}

async function request(url: string, init: RequestInit, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Request timed out. Check the server and network.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function headers(settings: ConnectionSettings): Record<string, string> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey.trim()) result.Authorization = `Bearer ${settings.apiKey.trim()}`;
  return result;
}

export async function discoverModels(settings: ConnectionSettings): Promise<ModelInfo[]> {
  const response = await request(endpoint(settings.baseUrl, "/models"), {
    method: "GET", headers: headers(settings)
  }, 15000);
  if (!response.ok) throw new Error(`Model discovery failed (${response.status}). Check the endpoint and provider compatibility.`);
  const data = await response.json() as { data?: Array<{ id?: string }> };
  return (data.data ?? []).filter(item => typeof item.id === "string").map(item => ({ id: item.id! }));
}

export async function sendMessage(
  settings: ConnectionSettings,
  history: ChatMessage[],
  message: string
): Promise<string> {
  if (!settings.baseUrl.trim()) throw new Error("Enter a model endpoint in Settings.");
  if (!settings.model.trim()) throw new Error("Choose a model in Settings.");
  const messages = [
    { role: "system", content: "You are ACI, a helpful personal AI assistant. Be clear about uncertainty. Do not claim to be conscious or to have real feelings." },
    ...history.slice(-20).map(item => ({ role: item.role, content: item.content })),
    { role: "user", content: message }
  ];
  const response = await request(endpoint(settings.baseUrl, "/chat/completions"), {
    method: "POST", headers: headers(settings),
    body: JSON.stringify({ model: settings.model, messages, temperature: 0.7, stream: false })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Model request failed (${response.status}): ${detail.slice(0, 300) || response.statusText}`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("The model returned an empty response.");
  return content.trim();
}

export async function checkConnection(settings: ConnectionSettings): Promise<string> {
  const models = await discoverModels(settings);
  return models.length ? `Connected · ${models.length} model(s) found` : "Connected · no models were listed";
}

export async function checkAciServer(baseUrl: string, apiKey = ""): Promise<string> {
  if (!baseUrl.trim()) throw new Error("Enter the ACI server address.");
  const response = await request(endpoint(baseUrl, "/api/status"), { method: "GET", headers: apiKey.trim() ? { Authorization: "Bearer " + apiKey.trim() } : {} }, 15000);
  if (!response.ok) throw new Error(`ACI server check failed (${response.status}).`);
  const data = await response.json() as { name?: string; version?: string; ollama_connected?: boolean; model?: string };
  return `${data.name ?? "ACI"} ${data.version ?? ""} · ${data.ollama_connected ? "model backend connected" : "server online, model backend offline"} · ${data.model ?? "no model"}`;
}

export async function sendToAciServer(baseUrl: string, message: string, apiKey = ""): Promise<string> {
  if (!baseUrl.trim()) throw new Error("Enter the ACI server address in Connection settings.");
  const response = await request(endpoint(baseUrl, "/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey.trim() ? { Authorization: "Bearer " + apiKey.trim() } : {}) },
    body: JSON.stringify({ message })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`ACI server request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const data = await response.json() as { reply?: string };
  if (!data.reply?.trim()) throw new Error("ACI server returned an empty reply.");
  return data.reply.trim();
}

export async function saveAciMemory(baseUrl: string, content: string, apiKey = ""): Promise<void> {
  const response = await request(endpoint(baseUrl, "/api/memory"), {
    method: "POST", headers: { "Content-Type": "application/json", ...(apiKey.trim() ? { Authorization: "Bearer " + apiKey.trim() } : {}) }, body: JSON.stringify({ content })
  });
  if (!response.ok) throw new Error(`Could not save memory (${response.status}).`);
}

export async function addAciGoal(baseUrl: string, content: string, apiKey = ""): Promise<void> {
  const response = await request(endpoint(baseUrl, "/api/goals"), {
    method: "POST", headers: { "Content-Type": "application/json", ...(apiKey.trim() ? { Authorization: "Bearer " + apiKey.trim() } : {}) }, body: JSON.stringify({ content })
  });
  if (!response.ok) throw new Error(`Could not add goal (${response.status}).`);
}
