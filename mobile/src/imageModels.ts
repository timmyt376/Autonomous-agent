import * as FileSystem from "expo-file-system/legacy";
import { unzip } from "react-native-zip-archive";

// SD1.5 MNN checkpoints (CPU / all ARM64 devices) from xororz/sd-mnn.
// Each zip contains unet.mnn, clip.mnn, vae_decoder.mnn, tokenizer.json.
export const IMAGE_MODELS = [
  { id: "ChilloutMix", repo: "xororz/sd-mnn", file: "ChilloutMix.zip" },
  { id: "AbsoluteReality", repo: "xororz/sd-mnn", file: "AbsoluteReality.zip" },
  { id: "AnythingV5", repo: "xororz/sd-mnn", file: "AnythingV5.zip" },
];

export function imageModelUrl(repo: string, file: string): string {
  return `https://huggingface.co/${repo}/resolve/main/${file}`;
}

/** Strip a `file://` prefix — react-native-zip-archive and the native
 *  LocalDreamModule both call `new File(path)` directly and reject `file://` URIs. */
function plain(p: string): string {
  return p.startsWith("file://") ? p.slice(7) : p;
}

/** Directory the model pack is extracted into (keeps the `file://` scheme so
 *  expo-file-system's makeDirectoryAsync/getInfoAsync can write to it). */
export function imageModelDir(modelId: string): string {
  return `${FileSystem.documentDirectory}image-models/${modelId}`;
}

/** Download a model zip and extract it into the app's image-models directory. */
export async function downloadImageModel(
  modelId: string,
  repo: string,
  file: string,
  onProgress?: (frac: number) => void,
): Promise<string> {
  const dir = imageModelDir(modelId);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  // Already extracted?
  const marker = `${dir}/unet.mnn`;
  const info = await FileSystem.getInfoAsync(marker);
  if (info.exists) {
    onProgress?.(1);
    return dir;
  }

  const zipUri = `${FileSystem.cacheDirectory}${file}`;
  const download = FileSystem.createDownloadResumable(
    imageModelUrl(repo, file),
    zipUri,
    {},
    (p) => onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite),
  );
  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Model download failed (status ${result?.status ?? "unknown"}).`);
  }

  onProgress?.(1);
  await unzip(plain(result.uri), plain(dir));
  return dir;
}

async function findFile(dir: string, name: string, depth: number): Promise<boolean> {
  if (depth > 3) return false;
  try {
    if ((await FileSystem.getInfoAsync(`${dir}/${name}`)).exists) return true;
    const items = await FileSystem.readDirectoryAsync(dir);
    for (const item of items) {
      const sub = await FileSystem.getInfoAsync(`${dir}/${item}`);
      if (sub.isDirectory && await findFile(`${dir}/${item}`, name, depth + 1)) return true;
    }
  } catch {
    /* dir may not exist yet */
  }
  return false;
}

/** True if the model pack is already extracted on device — searches up to 3 levels
 *  deep for unet.mnn, matching the native loader's own resolution (zips extract with
 *  a top-level folder, so the file is one level deeper than the model dir). */
export async function isImageModelDownloaded(modelId: string): Promise<boolean> {
  return await findFile(imageModelDir(modelId), "unet.mnn", 0);
}
