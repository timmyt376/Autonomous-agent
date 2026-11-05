import * as FileSystem from "expo-file-system/legacy";
import { initLlama } from "llama.rn";
import { ChatMessage } from "./types";

type LlamaContext = Awaited<ReturnType<typeof initLlama>>;
let activeContext: LlamaContext | null = null;
let activeModelPath: string | null = null;
let loading: Promise<void> | null = null;

function filenameFromUrl(url: string): string {
  const clean = url.split("?")[0].split("#")[0];
  const name = clean.substring(clean.lastIndexOf("/") + 1);
  if (!name.toLowerCase().endsWith(".gguf")) throw new Error("Use a direct link to a .gguf model file.");
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function downloadAndLoadLocalModel(
  modelUrl: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  if (!modelUrl.trim()) throw new Error("Enter a direct GGUF model download URL.");
  const name = filenameFromUrl(modelUrl.trim());
  const directory = FileSystem.documentDirectory;
  if (!directory) throw new Error("This device does not provide an app document directory.");
  const path = directory + name;

  if (activeContext && activeModelPath === path) return `Loaded ${name}`;
  if (loading) await loading;
  if (activeContext && activeModelPath !== path) {
    await activeContext.release();
    activeContext = null;
    activeModelPath = null;
  }

  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    const download = await FileSystem.downloadAsync(modelUrl.trim(), path);
    if (download.status < 200 || download.status >= 300) throw new Error(`Model download failed (HTTP ${download.status}).`);
  }

  loading = (async () => {
    const context = await initLlama({
      model: path,
      n_ctx: 2048,
      n_batch: 256,
      n_gpu_layers: 99,
      use_mlock: true
    });
    activeContext = context;
    activeModelPath = path;
  })();
  try {
    await loading;
  } finally {
    loading = null;
  }
  onProgress?.(1);
  return `Loaded ${name} on this device`;
}

export async function chatWithLocalModel(history: ChatMessage[], message: string): Promise<string> {
  if (!activeContext) throw new Error("No on-device model is loaded. Download and load a GGUF model in Connection settings.");
  const messages = [
    { role: "system" as const, content: "You are ACI, a helpful personal AI assistant. Be clear about uncertainty. Do not claim to be conscious or to have real feelings." },
    ...history.slice(-16).map(item => ({ role: item.role, content: item.content })),
    { role: "user" as const, content: message }
  ];
  const result = await activeContext.completion({
    messages,
    n_predict: 512,
    temperature: 0.7
  });
  if (!result.text?.trim()) throw new Error("The on-device model returned an empty response.");
  return result.text.trim();
}

export function isLocalModelLoaded(): boolean {
  return activeContext !== null;
}
