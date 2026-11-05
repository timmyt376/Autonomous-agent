import { ChatMessage, ConnectionSettings, ModelInfo } from "./types";

function endpoint(baseUrl: string, path: string): string {
  return baseUrl.replace(/\\/+$/, "") + path;
}

async function request(url: string, init: RequestInit, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
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
    method: "GET",
    headers: headers(settings)
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
    method: "POST",
    headers: headers(settings),
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: 0.7,
      stream: false
    })
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
