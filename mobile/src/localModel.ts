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
  if (!/^https:\/\//i.test(modelUrl.trim())) throw new Error("Model downloads must use HTTPS.");
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
    const task = FileSystem.createDownloadResumable(
      modelUrl.trim(),
      path,
      {},
      progress => {
        const total = progress.totalBytesExpectedToWrite;
        onProgress?.(total > 0 ? progress.totalBytesWritten / total : 0);
      }
    );
    const result = await task.downloadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(path, { idempotent: true });
      throw new Error(`Model download failed (${result?.status ?? "no response"}).`);
    }
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
  } catch (error) {
    activeContext = null;
    activeModelPath = null;
    throw new Error(`The GGUF file downloaded, but llama.cpp could not load it. Check model compatibility and available RAM. ${error instanceof Error ? error.message : ""}`);
  } finally {
    loading = null;
  }
  onProgress?.(1);
  return `Loaded ${name} on this device`;
}

export async function loadInstalledLocalModel(path: string): Promise<string> {
  if (activeContext && activeModelPath === path) return "Model already loaded";
  if (loading) await loading;
  if (activeContext) {
    await activeContext.release();
    activeContext = null;
    activeModelPath = null;
  }
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) throw new Error("The selected model file no longer exists.");
  loading = (async () => {
    const context = await initLlama({ model: path, n_ctx: 2048, n_batch: 256, n_gpu_layers: 99, use_mlock: true });
    activeContext = context;
    activeModelPath = path;
  })();
  try {
    await loading;
  } finally {
    loading = null;
  }
  return "Model loaded on this device";
}

export async function unloadLocalModel(): Promise<void> {
  if (activeContext) await activeContext.release();
  activeContext = null;
  activeModelPath = null;
}

export async function chatWithLocalModel(
  history: ChatMessage[],
  message: string,
  onToken?: (partial: string) => void
): Promise<string> {
  if (!activeContext) throw new Error("No on-device model is loaded. Open Model library and load a GGUF model.");
  const messages = [
    { role: "system" as const, content: "You are ACI, a helpful personal AI assistant. Be clear about uncertainty. Do not claim to be conscious or to have real feelings." },
    ...history.slice(-16).map(item => ({ role: item.role, content: item.content })),
    { role: "user" as const, content: message }
  ];
  const result = await activeContext.completion(
    { messages, n_predict: 512, temperature: 0.7 },
    data => onToken?.(data.token)
  );
  if (!result.text?.trim()) throw new Error("The on-device model returned an empty response.");
  return result.text.trim();
}

export function isLocalModelLoaded(): boolean {
  return activeContext !== null;
}

export function getActiveModelPath(): string | null {
  return activeModelPath;
}
