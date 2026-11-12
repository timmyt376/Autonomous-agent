import { IMAGE_MODELS, imageModelDir, isImageModelDownloaded } from "./imageModels";
import { generateLocalImage, loadImageModel, localImageGenAvailable } from "./localDream";

/**
 * Generate an image using the first downloaded on-device SD model.
 * This is the automatic fallback when the ComfyUI (API) path fails, so the
 * phone can still produce the image locally.
 *
 * Returns a `file://` URI ready for an <Image source={{ uri }} />.
 */
export async function generateImageOnDevice(prompt: string, negative = ""): Promise<string> {
  if (!localImageGenAvailable()) {
    throw new Error("On-device image generation is not available on this device.");
  }

  // Prefer the first already-downloaded model (largest-by-default order in IMAGE_MODELS).
  for (const m of IMAGE_MODELS) {
    if (!(await isImageModelDownloaded(m.id))) continue;
    await loadImageModel(imageModelDir(m.id), "auto");
    const out = await generateLocalImage({ prompt, negativePrompt: negative, width: 512, height: 512 });
    return "file://" + out.imagePath;
  }

  throw new Error("No on-device image model is downloaded yet. Download one in the Models section first.");
}
