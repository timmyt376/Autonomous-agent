import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { ConnectionSettings } from "./types";

const SETTINGS_KEY = "aci.mobile.settings.v1";
const API_KEY_KEY = "aci.mobile.api-key.v1";

const defaults: ConnectionSettings = {
  mode: "device",
  baseUrl: "http://127.0.0.1:8080/v1",
  model: "",
  apiKey: ""
};

export async function loadSettings(): Promise<ConnectionSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  const saved = raw ? JSON.parse(raw) as Partial<ConnectionSettings> : {};
  const apiKey = await SecureStore.getItemAsync(API_KEY_KEY);
  return { ...defaults, ...saved, apiKey: apiKey ?? "" };
}

export async function saveSettings(settings: ConnectionSettings): Promise<void> {
  const { apiKey, ...publicSettings } = settings;
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(publicSettings));
  if (apiKey.trim()) await SecureStore.setItemAsync(API_KEY_KEY, apiKey);
  else await SecureStore.deleteItemAsync(API_KEY_KEY);
}
