import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const SAF = FileSystem.StorageAccessFramework;

export type PhoneFile = { uri: string; name: string; isDirectory: boolean };

export async function choosePhoneFolder(): Promise<string> {
  if (Platform.OS !== "android" || !SAF) throw new Error("Folder browsing is currently supported on Android. iOS file access is limited by its app sandbox and document picker.");
  const result = await SAF.requestDirectoryPermissionsAsync();
  if (!result.granted || !result.directoryUri) throw new Error("Folder permission was not granted.");
  return result.directoryUri;
}

export async function listPhoneFolder(folderUri: string): Promise<PhoneFile[]> {
  if (Platform.OS !== "android" || !SAF) throw new Error("Android folder access is unavailable.");
  const uris = await SAF.readDirectoryAsync(folderUri);
  return uris.map(uri => {
    const name = decodeURIComponent(uri.split("/").pop() ?? uri);
    return { uri, name, isDirectory: uri.endsWith("%3A") || !/\.[a-z0-9]{1,10}$/i.test(name) };
  }).sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
}

export async function readPhoneTextFile(uri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && !info.isDirectory && info.size && info.size > 1000000) {
    throw new Error("Text editor is limited to files smaller than 1 MB.");
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

export async function writePhoneTextFile(uri: string, content: string): Promise<void> {
  if (content.length > 1000000) throw new Error("Text editor is limited to 1 MB.");
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
}

export async function createPhoneTextFile(folderUri: string, filename: string): Promise<string> {
  if (!SAF) throw new Error("Folder access is unavailable.");
  const safe = filename.trim().replace(/[\\/:*?"<>|]/g, "_");
  if (!safe || safe.includes("..")) throw new Error("Enter a valid filename.");
  return SAF.createFileAsync(folderUri, safe, "text/plain");
}
