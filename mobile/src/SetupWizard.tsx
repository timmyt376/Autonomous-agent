import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Device from "expo-device";
import type { ConnectionSettings } from "./types";
import { listGgufFiles, buildHuggingFaceDownloadUrl } from "./catalog";
import { downloadAndLoadLocalModel } from "./localModel";

const palette = { bg: "#0b0f1a", panel: "#121a29", border: "#263650", blue: "#4a7dff", amber: "#f5b84d", text: "#eef3ff", muted: "#9aa9c2" };
type Stage = "welcome" | "local" | "api" | "server";

export function SetupWizard({ onComplete }: { onComplete: (settings: ConnectionSettings) => Promise<void> }) {
  const [stage, setStage] = useState<Stage>("welcome");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-flash");
  const [apiKey, setApiKey] = useState("");
  const [comfyUrl, setComfyUrl] = useState("http://192.168.1.10:8188");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const memory = Device.totalMemory ?? 0;
  function openServer() { setBaseUrl("http://192.168.1.20:11434/v1"); setModel("qwen3:1.7b"); setApiKey(""); setStage("server"); }
  const deviceGb = memory / 1024 ** 3;

  async function finish(next: ConnectionSettings) {
    setBusy(true);
    try { await onComplete(next); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not save setup."); }
    finally { setBusy(false); }
  }

  async function autoPickPhoneModel() {
    setBusy(true); setStatus("Finding a small model compatible with this phone…");
    try {
      const repoId = "Qwen/Qwen3-0.6B-GGUF";
      const files = await listGgufFiles(repoId);
      const selected = files.find(file => /q4_k_m/i.test(file.name)) ?? files.find(file => /q4/i.test(file.name)) ?? files[0];
      if (!selected) throw new Error("The selected model repository contains no GGUF files.");
      const url = buildHuggingFaceDownloadUrl(repoId, selected.name);
      setStatus("Downloading " + selected.name + " · " + (selected.size ? (selected.size / 1024 ** 3).toFixed(2) + " GB" : "size unknown"));
      const result = await downloadAndLoadLocalModel(url);
      await finish({ mode: "device", baseUrl: "", model: selected.name, modelUrl: url, apiKey: "", comfyUrl });
      setStatus(result);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Automatic model setup failed."); }
    finally { setBusy(false); }
  }

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, secure = false) => (
    <View style={styles.fieldWrap}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={palette.muted} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} style={styles.input} /></View>
  );
  const action = (label: string, onPress: () => void, secondary = false) => (
    <TouchableOpacity disabled={busy} style={[styles.button, secondary && styles.secondary, busy && styles.disabled]} onPress={onPress}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>
  );

  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <Text style={styles.brand}>ACI <Text style={styles.accent}>SETUP</Text></Text>
    <Text style={styles.subtitle}>Choose where ACI runs its models. You can change this later in Connection settings.</Text>
    {stage === "welcome" ? <>
      <Text style={styles.heading}>How should ACI run?</Text>
      <Text style={styles.help}>Choose a hosted API or local models. Local models can run directly on this phone or on another computer/server on your network.</Text>
      {action("Use an API", () => setStage("api"))}
      {action("Use local models", () => setStage("local"), true)}
    </> : null}
    {stage === "local" ? <>
      <Text style={styles.heading}>Local model setup</Text>
      <Text style={styles.help}>Phone memory reported: {deviceGb ? deviceGb.toFixed(1) + " GB" : "unavailable"}. ACI starts with a small 0.6B parameter Q4 model and can add larger models later if hardware allows. Text and image models can run separately.</Text>
      {action("Auto-pick and install a model on this phone", autoPickPhoneModel)}
      {action("Connect to a local model server", openServer, true)}
      {field("ComfyUI image server (optional)", comfyUrl, setComfyUrl, "http://192.168.1.10:8188")}
      {action("Back", () => setStage("welcome"), true)}
    </> : null}
    {stage === "server" ? <>
      <Text style={styles.heading}>Local server endpoint</Text>
      <Text style={styles.help}>For Ollama, use its OpenAI-compatible URL, for example http://192.168.1.20:11434/v1. Enter the model tag installed on that computer.</Text>
      {field("Local server endpoint", baseUrl === "https://api.deepseek.com" ? "http://192.168.1.20:11434/v1" : baseUrl, setBaseUrl, "http://192.168.1.20:11434/v1")}
      {field("Model ID / Ollama tag", model === "deepseek-flash" ? "qwen3:1.7b" : model, setModel, "qwen3:1.7b")}
      {field("Endpoint API key (if required)", apiKey, setApiKey, "Optional", true)}
      {field("ComfyUI image server (optional)", comfyUrl, setComfyUrl, "http://192.168.1.20:8188")}
      {action("Connect and continue", () => finish({ mode: "api", baseUrl, model, modelUrl: "", apiKey, comfyUrl }))}
      {action("Back", () => setStage("local"), true)}
    </> : null}
    {stage === "api" ? <>
      <Text style={styles.heading}>Connect an API</Text>
      <Text style={styles.help}>Use DeepSeek or any OpenAI-compatible provider. Your key is stored in secure device storage.</Text>
      {field("API base URL", baseUrl, setBaseUrl, "https://api.deepseek.com")}
      {field("Model ID", model, setModel, "deepseek-flash")}
      {field("API key", apiKey, setApiKey, "Your provider key", true)}
      {field("ComfyUI image server (optional)", comfyUrl, setComfyUrl, "http://192.168.1.20:8188")}
      {action("Save and continue", () => finish({ mode: "api", baseUrl, model, modelUrl: "", apiKey, comfyUrl }))}
      {action("Back", () => setStage("welcome"), true)}
    </> : null}
    {busy ? <View style={styles.busy}><ActivityIndicator color={palette.blue} /><Text style={styles.help}>Setting up…</Text></View> : null}
    {!!status && <Text style={styles.status}>{status}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 22, paddingTop: 56, paddingBottom: 50, gap: 14 },
  brand: { color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: 1 },
  accent: { color: palette.blue, fontSize: 15 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 20, marginBottom: 20 },
  heading: { color: palette.text, fontSize: 22, fontWeight: "800", marginTop: 10 },
  help: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  fieldWrap: { gap: 6 },
  label: { color: palette.text, fontSize: 12, fontWeight: "700" },
  input: { color: palette.text, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, borderRadius: 10, padding: 13 },
  button: { backgroundColor: palette.blue, padding: 15, borderRadius: 12, alignItems: "center", marginTop: 5 },
  secondary: { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border },
  buttonText: { color: palette.text, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  busy: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  status: { color: palette.amber, fontSize: 12, lineHeight: 18 }
});
