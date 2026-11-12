import { NativeModules, NativeEventEmitter, Platform } from "react-native";

const { LocalDreamModule } = NativeModules;

export type LocalDreamBackend = "auto" | "mnn" | "qnn";

export type LocalImageGenParams = {
  prompt: string;
  negativePrompt?: string;
  steps?: number;
  guidanceScale?: number;
  seed?: number;
  width?: number;
  height?: number;
  previewInterval?: number;
};

export type LocalImageProgress = {
  step: number;
  totalSteps: number;
  progress: number;
  previewPath?: string;
};

export type GeneratedLocalImage = {
  id: string;
  imagePath: string;
  width: number;
  height: number;
  seed: number;
  generationTimeMs: number;
};

const emitter = LocalDreamModule
  ? new NativeEventEmitter(LocalDreamModule)
  : null;

export function localImageGenAvailable(): boolean {
  return Platform.OS === "android" && LocalDreamModule != null;
}

export async function isNpuSupported(): Promise<boolean> {
  if (!localImageGenAvailable()) return false;
  return await LocalDreamModule.isNpuSupported();
}

export async function isModelLoaded(): Promise<boolean> {
  if (!localImageGenAvailable()) return false;
  return await LocalDreamModule.isModelLoaded();
}

export async function loadImageModel(modelDir: string, backend: LocalDreamBackend = "auto"): Promise<boolean> {
  if (!localImageGenAvailable()) throw new Error("On-device image generation is not available on this device.");
  const plainDir = modelDir.startsWith("file://") ? modelDir.slice(7) : modelDir;
  return await LocalDreamModule.loadModel({ modelPath: plainDir, backend });
}

export async function unloadImageModel(): Promise<boolean> {
  if (!localImageGenAvailable()) return true;
  return await LocalDreamModule.unloadModel();
}

export function onImageProgress(
  onProgress: (p: LocalImageProgress) => void,
): { remove: () => void } | null {
  if (!emitter) return null;
  const sub = emitter.addListener("LocalDreamProgress", onProgress);
  return { remove: () => sub.remove() };
}

export function onImageError(onError: (msg: string) => void): { remove: () => void } | null {
  if (!emitter) return null;
  const sub = emitter.addListener("LocalDreamError", (e: { error: string }) => onError(e.error));
  return { remove: () => sub.remove() };
}

export async function generateLocalImage(
  params: LocalImageGenParams,
): Promise<GeneratedLocalImage> {
  if (!localImageGenAvailable()) throw new Error("On-device image generation is not available.");
  const trimmed = (params.prompt || "").trim();
  if (!trimmed) throw new Error("Enter a prompt to generate an image.");
  return await LocalDreamModule.generateImage({
    prompt: trimmed,
    negativePrompt: params.negativePrompt || "",
    steps: params.steps ?? 20,
    guidanceScale: params.guidanceScale ?? 7.5,
    seed: params.seed ?? Math.floor(Math.random() * 2147483647),
    width: params.width ?? 512,
    height: params.height ?? 512,
    previewInterval: params.previewInterval ?? 2,
  });
}

export async function cancelImageGeneration(): Promise<boolean> {
  if (!localImageGenAvailable()) return true;
  return await LocalDreamModule.cancelGeneration();
}

export async function getGeneratedImages(): Promise<Array<{ id: string; imagePath: string; createdAt: string; size: number }>> {
  if (!localImageGenAvailable()) return [];
  return await LocalDreamModule.getGeneratedImages();
}

export async function deleteGeneratedImage(id: string): Promise<boolean> {
  if (!localImageGenAvailable()) return false;
  return await LocalDreamModule.deleteGeneratedImage(id);
}

export function imageGenConstants() {
  if (!LocalDreamModule) {
    return { DEFAULT_STEPS: 20, DEFAULT_GUIDANCE_SCALE: 7.5, DEFAULT_WIDTH: 512, DEFAULT_HEIGHT: 512, SUPPORTED_WIDTHS: [512], SUPPORTED_HEIGHTS: [512] };
  }
  return LocalDreamModule.getConstants();
}
