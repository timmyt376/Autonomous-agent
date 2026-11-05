export type ProviderMode = "device" | "api" | "aci-server";

export type ConnectionSettings = {
  mode: ProviderMode;
  baseUrl: string;
  model: string;
  modelUrl: string;
  apiKey: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export type ModelInfo = {
  id: string;
};
