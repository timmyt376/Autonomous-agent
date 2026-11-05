import * as FileSystem from "expo-file-system/legacy";

export type InstalledModel = {
  name: string;
  uri: string;
  sizeBytes: number;
  modifiedAt?: number;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(0) + " KB";
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  return (bytes / 1024 ** 3).toFixed(2) + " GB";
}

export async function listInstalledModels(): Promise<InstalledModel[]> {
  const root = FileSystem.documentDirectory;
  if (!root) return [];
  const names = await FileSystem.readDirectoryAsync(root);
  const models: InstalledModel[] = [];
  for (const name of names.filter(item => item.toLowerCase().endsWith(".gguf"))) {
    const uri = root + name;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory) {
      models.push({ name, uri, sizeBytes: info.size ?? 0, modifiedAt: info.modificationTime });
    }
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteInstalledModel(uri: string): Promise<void> {
  const root = FileSystem.documentDirectory;
  if (!root || !uri.startsWith(root) || !uri.toLowerCase().endsWith(".gguf")) {
    throw new Error("Refusing to delete a file outside ACI's model storage.");
  }
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
