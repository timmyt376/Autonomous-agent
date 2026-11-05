import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import * as Device from "expo-device";
import { StatusBar } from "expo-status-bar";
import { addAciGoal, checkAciServer, discoverModels, saveAciMemory, sendMessage, sendToAciServer } from "./src/aci";
import { chatWithLocalModel, downloadAndLoadLocalModel, getActiveModelPath, loadInstalledLocalModel, unloadLocalModel } from "./src/localModel";
import { deleteInstalledModel, formatBytes, listInstalledModels, InstalledModel } from "./src/modelManager";
import { getDeviceAdvice } from "./src/recommendations";
import { loadChat, loadSettings, saveChat, saveSettings } from "./src/storage";
import { ChatMessage, ConnectionSettings } from "./src/types";

const colors = {
  bg: "#0b0f1a", panel: "#121a29", panel2: "#182338",
  blue: "#4a7dff", amber: "#f5b84d", text: "#eef3ff",
  muted: "#9aa9c2", border: "#263650", danger: "#ff7777"
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const [settings, setSettings] = useState<ConnectionSettings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"chat" | "settings" | "models">("chat");
  const [status, setStatus] = useState("Not connected");
  const [models, setModels] = useState<string[]>([]);
  const [deviceInfo, setDeviceInfo] = useState("Checking device…");

  useEffect(() => {
    loadSettings().then(setSettings).catch(() => Alert.alert("Storage error", "Could not load ACI settings."));
    loadChat().then(setMessages).catch(() => undefined);
    refreshModels().catch(() => undefined);
    const memory = Device.totalMemory ? `${(Device.totalMemory / 1024 ** 3).toFixed(1)} GB RAM reported` : "Device memory information unavailable";
    setDeviceInfo(`${Device.manufacturer ?? "Device"} ${Device.modelName ?? ""} · ${Platform.OS} · ${memory}`);
  }, []);

  const isDeviceMode = settings?.mode === "device";
  const modeDescription = useMemo(() => {
    if (settings?.mode === "device") return "Run a GGUF model directly on this phone with llama.cpp.";
    if (settings?.mode === "aci-server") return "Send messages to your own ACI Python server.";
    return "Send messages to an OpenAI-compatible model provider.";
  }, [settings?.mode]);

  async function refreshModels() { setInstalledModels(await listInstalledModels()); }

  async function updateSettings(next: ConnectionSettings) {
    setSettings(next);
    await saveSettings(next);
  }

  async function connect() {
    if (!settings) return;
    setStatus("Connecting…");
    try {
      if (settings.mode === "device") {
        setDownloadProgress(0);
        const result = await downloadAndLoadLocalModel(settings.modelUrl, setDownloadProgress);
        const modelName = settings.modelUrl.split("?")[0].split("/").pop() ?? "On-device GGUF";
        await updateSettings({ ...settings, model: modelName });
        setStatus(result);
        await refreshModels();
      } else if (settings.mode === "aci-server") {
        setStatus(await checkAciServer(settings.baseUrl, settings.apiKey));
      } else {
        const found = await discoverModels(settings);
        setModels(found.map(item => item.id));
        setStatus(found.length ? "Connected · " + found.length + " model(s)" : "Connected · no models found");
        if (!settings.model && found[0]) await updateSettings({ ...settings, model: found[0].id });
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setDownloadProgress(null);
    }
  }

  async function send() {
    if (!settings || busy || !draft.trim()) return;
    const content = draft.trim();
    const userMessage: ChatMessage = { id: makeId(), role: "user", content, createdAt: Date.now() };
    const next = [...messages, userMessage];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      await saveChat(next);
      const reply = settings.mode === "device" ? await chatWithLocalModel(next.slice(0, -1), content) : settings.mode === "aci-server" ? await sendToAciServer(settings.baseUrl, content, settings.apiKey) : await sendMessage(settings, next.slice(0, -1), content);
      const completed = [...next, { id: makeId(), role: "assistant" as const, content: reply, createdAt: Date.now() }];
      setMessages(completed);
      await saveChat(completed);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown model error";
      const failed = [...next, { id: makeId(), role: "assistant" as const, content: `I couldn't reach the model. ${detail}`, createdAt: Date.now() }];
      setMessages(failed);
      await saveChat(failed);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <SafeAreaView style={styles.root}><ActivityIndicator color={colors.blue} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View><Text style={styles.brand}>ACI <Text style={styles.mobile}>MOBILE</Text></Text><Text style={styles.sub}>Autonomous Cognitive Intelligence</Text></View>
        <View style={styles.modePill}><View style={[styles.dot, { backgroundColor: isDeviceMode ? colors.amber : colors.blue }]} /><Text style={styles.modeText}>{settings.mode === "device" ? "ON DEVICE" : settings.mode === "aci-server" ? "ACI SERVER" : "API"}</Text></View>
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setTab("chat")} style={[styles.tab, tab === "chat" && styles.tabActive]}><Text style={styles.tabText}>Chat</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("models")} style={[styles.tab, tab === "models" && styles.tabActive]}><Text style={styles.tabText}>Models</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("settings")} style={[styles.tab, tab === "settings" && styles.tabActive]}><Text style={styles.tabText}>Connection</Text></TouchableOpacity>
      </View>
      {tab === "chat" ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.connectionLine}><View style={styles.fill}><Text style={styles.muted}>{settings.model || "No model selected"}</Text><Text style={styles.muted}>{status}</Text></View><TouchableOpacity onPress={() => Alert.alert("Clear conversation?", "This removes the saved chat transcript from this phone.", [{ text: "Cancel", style: "cancel" }, { text: "Clear", style: "destructive", onPress: async () => { setMessages([]); await saveChat([]); } }])}><Text style={styles.clearText}>Clear</Text></TouchableOpacity></View>
          <FlatList
            style={styles.fill}
            contentContainerStyle={styles.chatList}
            data={messages}
            keyExtractor={item => item.id}
            ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Start a conversation</Text><Text style={styles.muted}>Connect a local model or API in the Connection tab.</Text></View>}
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
                <Text style={styles.bubbleRole}>{item.role === "user" ? "YOU" : "ACI"}</Text>
                <Text style={styles.bubbleText}>{item.content}</Text>
              </View>
            )}
          />
          <View style={styles.composer}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Message ACI…" placeholderTextColor={colors.muted} multiline style={styles.input} editable={!busy} />
            <TouchableOpacity onPress={send} disabled={busy || !draft.trim()} style={[styles.send, (busy || !draft.trim()) && styles.disabled]}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.sendText}>Send</Text>}</TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : tab === "models" ? (
        <ScrollView style={styles.fill} contentContainerStyle={styles.settingsContent}>
          <Text style={styles.sectionTitle}>On-device model library</Text>
          <Text style={styles.help}>Downloaded GGUF models stay in this app private storage. Load a model for offline use or delete it to reclaim space.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => refreshModels()}><Text style={styles.primaryText}>Refresh library</Text></TouchableOpacity>
          {installedModels.length === 0 ? <Text style={styles.help}>No models downloaded yet. Choose On device in Connection to add a GGUF model.</Text> : installedModels.map(model => (
            <View key={model.uri} style={styles.infoCard}>
              <Text style={styles.modelText}>{model.name}</Text>
              <Text style={styles.help}>{formatBytes(model.sizeBytes)} · {getActiveModelPath() === model.uri ? "Currently loaded" : "Stored on device"}</Text>
              <View style={styles.modelActions}>
                <TouchableOpacity style={styles.smallButton} onPress={async () => { try { setStatus("Loading model…"); await loadInstalledLocalModel(model.uri); setStatus("Loaded " + model.name); if (settings) await updateSettings({ ...settings, mode: "device", model: model.name }); } catch (e) { setStatus(e instanceof Error ? e.message : "Could not load model"); } }}><Text style={styles.primaryText}>Load</Text></TouchableOpacity>
                <TouchableOpacity style={styles.smallDanger} onPress={() => Alert.alert("Delete model?", "Remove " + model.name + " from this phone?", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { try { if (getActiveModelPath() === model.uri) await unloadLocalModel(); await deleteInstalledModel(model.uri); await refreshModels(); setStatus("Model deleted"); } catch (e) { Alert.alert("Delete failed", e instanceof Error ? e.message : "Unknown error"); } } }])}><Text style={styles.primaryText}>Delete</Text></TouchableOpacity>
              </View>
            </View>
          ))}
          <Text style={styles.status}>{status}</Text>
        </ScrollView>
      ) : (
        <ScrollView style={styles.fill} contentContainerStyle={styles.settingsContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Model location</Text>
          <View style={styles.segment}>
            <TouchableOpacity onPress={() => updateSettings({ ...settings, mode: "device" })} style={[styles.segmentButton, settings.mode === "device" && styles.segmentSelected]}><Text style={styles.segmentText}>On device</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => updateSettings({ ...settings, mode: "api" })} style={[styles.segmentButton, settings.mode === "api" && styles.segmentSelected]}><Text style={styles.segmentText}>API</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => updateSettings({ ...settings, mode: "aci-server" })} style={[styles.segmentButton, settings.mode === "aci-server" && styles.segmentSelected]}><Text style={styles.segmentText}>ACI server</Text></TouchableOpacity>
          </View>
          <Text style={styles.help}>{modeDescription}</Text>
          {isDeviceMode ? (
            <>
              <Text style={styles.label}>Direct GGUF model URL</Text>
              <TextInput value={settings.modelUrl} onChangeText={value => updateSettings({ ...settings, modelUrl: value })} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.field} placeholder="https://huggingface.co/.../model.Q4_K_M.gguf" placeholderTextColor={colors.muted} />
              <Text style={styles.help}>Paste a direct HTTPS download link to a GGUF file. It will be saved in private app storage and loaded by llama.cpp on this phone.</Text>
              {downloadProgress !== null ? <View><Text style={styles.help}>Download progress: {(downloadProgress * 100).toFixed(0)}%</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: (Math.max(0, Math.min(100, downloadProgress * 100))) + "%" }]} /></View></View> : null}
              <TouchableOpacity style={styles.primaryButton} onPress={connect}><Text style={styles.primaryText}>Download & load on this phone</Text></TouchableOpacity>
            </>
          ) : settings.mode === "aci-server" ? (
            <>
              <Text style={styles.label}>ACI server URL</Text>
              <TextInput value={settings.baseUrl} onChangeText={value => updateSettings({ ...settings, baseUrl: value })} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.field} placeholder="http://192.168.1.20:8765" placeholderTextColor={colors.muted} />
              <Text style={styles.help}>Use your computer LAN IP and ACI port 8765. The server must listen on the LAN interface. Do not expose it publicly without authentication and HTTPS.</Text>
              <Text style={styles.label}>API bearer token (if configured on server)</Text>
              <TextInput value={settings.apiKey} onChangeText={value => updateSettings({ ...settings, apiKey: value })} secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.field} placeholder="Stored securely on this phone" placeholderTextColor={colors.muted} />
              <TouchableOpacity style={styles.primaryButton} onPress={connect}><Text style={styles.primaryText}>Test ACI server</Text></TouchableOpacity>
              <Text style={styles.label}>Memory note</Text>
              <TextInput value={memoryDraft} onChangeText={setMemoryDraft} style={styles.field} placeholder="Something ACI should remember" placeholderTextColor={colors.muted} />
              <TouchableOpacity style={styles.smallButton} onPress={async () => { try { await saveAciMemory(settings.baseUrl, memoryDraft, settings.apiKey); setMemoryDraft(""); Alert.alert("Saved", "Memory saved to your ACI server."); } catch (e) { Alert.alert("Could not save", e instanceof Error ? e.message : "Unknown error"); } }}><Text style={styles.primaryText}>Save memory</Text></TouchableOpacity>
              <Text style={styles.label}>Goal</Text>
              <TextInput value={goalDraft} onChangeText={setGoalDraft} style={styles.field} placeholder="A goal for ACI to track" placeholderTextColor={colors.muted} />
              <TouchableOpacity style={styles.smallButton} onPress={async () => { try { await addAciGoal(settings.baseUrl, goalDraft, settings.apiKey); setGoalDraft(""); Alert.alert("Added", "Goal added to your ACI server."); } catch (e) { Alert.alert("Could not add goal", e instanceof Error ? e.message : "Unknown error"); } }}><Text style={styles.primaryText}>Add goal</Text></TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>OpenAI-compatible base URL</Text>
              <TextInput value={settings.baseUrl} onChangeText={value => updateSettings({ ...settings, baseUrl: value })} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.field} placeholder="https://api.example.com/v1" placeholderTextColor={colors.muted} />
              <Text style={styles.label}>Model ID</Text>
              <TextInput value={settings.model} onChangeText={value => updateSettings({ ...settings, model: value })} autoCapitalize="none" autoCorrect={false} style={styles.field} placeholder="model-name" placeholderTextColor={colors.muted} />
              <Text style={styles.label}>API key</Text>
              <TextInput value={settings.apiKey} onChangeText={value => updateSettings({ ...settings, apiKey: value })} secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.field} placeholder="Stored securely on this device" placeholderTextColor={colors.muted} />
              <TouchableOpacity style={styles.primaryButton} onPress={connect}><Text style={styles.primaryText}>Test connection & find models</Text></TouchableOpacity>
            </>
          )}
          <Text style={styles.status}>{status}</Text>
          {models.map(model => <TouchableOpacity key={model} style={styles.modelRow} onPress={() => updateSettings({ ...settings, model })}><Text style={styles.modelText}>{model}</Text><Text style={styles.muted}>{settings.model === model ? "Selected ✓" : "Use model"}</Text></TouchableOpacity>)}
          <View style={styles.infoCard}><Text style={styles.sectionTitle}>Device information</Text><Text style={styles.help}>{deviceInfo}</Text><Text style={styles.help}>Suggested starting models: {getDeviceAdvice(Device.totalMemory ?? undefined).suggestedModels.join(" · ")}</Text><Text style={styles.help}>{getDeviceAdvice(Device.totalMemory ?? undefined).explanation}</Text></View>
          <View style={styles.infoCard}><Text style={styles.sectionTitle}>Model library</Text><Text style={styles.help}>Use the Models tab to view installed GGUF files, load a different model, or delete one and reclaim storage. Hardware estimates are advisory, not guarantees.</Text></View>
          <View style={styles.infoCard}><Text style={styles.sectionTitle}>Privacy</Text><Text style={styles.help}>API mode sends messages to the configured provider. Device mode runs inference locally after the model is downloaded; chat prompts are not sent to a model API. Do not use an untrusted endpoint or paste secrets into chat.</Text></View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: colors.text, fontSize: 26, fontWeight: "800", letterSpacing: 1 },
  mobile: { color: colors.blue, fontSize: 12, letterSpacing: 2 },
  sub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  modePill: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.panel2, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  modeText: { color: colors.text, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 20 },
  tab: { paddingVertical: 12, marginRight: 22, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.blue },
  tabText: { color: colors.text, fontWeight: "600" },
  connectionLine: { paddingHorizontal: 18, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  clearText: { color: colors.amber, fontSize: 12, fontWeight: "700", padding: 8 },
  muted: { color: colors.muted, fontSize: 11, flexShrink: 1 },
  chatList: { padding: 16, flexGrow: 1, gap: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 260, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  bubble: { padding: 14, borderRadius: 15, maxWidth: "90%" },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#203a70", borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.panel, borderBottomLeftRadius: 4 },
  bubbleRole: { color: colors.amber, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 9, padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, minHeight: 46, color: colors.text, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11 },
  send: { height: 46, minWidth: 62, alignItems: "center", justifyContent: "center", backgroundColor: colors.blue, borderRadius: 12, paddingHorizontal: 12 },
  sendText: { color: "white", fontWeight: "700" },
  disabled: { opacity: 0.45 },
  settingsContent: { padding: 18, gap: 12, paddingBottom: 40 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 3 },
  segment: { flexDirection: "row", backgroundColor: colors.panel, borderRadius: 12, padding: 4, gap: 4 },
  segmentButton: { flex: 1, padding: 11, borderRadius: 9, alignItems: "center" },
  segmentSelected: { backgroundColor: "#263e70" },
  segmentText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  help: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  label: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 5 },
  field: { backgroundColor: colors.panel, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  primaryButton: { backgroundColor: colors.blue, borderRadius: 11, padding: 14, alignItems: "center", marginTop: 5 },
  primaryText: { color: "white", fontWeight: "700" },
  status: { color: colors.amber, fontSize: 12 },
  modelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.panel, padding: 12, borderRadius: 9 },
  modelText: { color: colors.text, fontSize: 13, flex: 1 },
  modelActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  smallButton: { backgroundColor: colors.blue, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9, alignItems: "center", alignSelf: "flex-start" },
  smallDanger: { backgroundColor: colors.danger, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9, alignItems: "center", alignSelf: "flex-start" },
  progressTrack: { height: 7, backgroundColor: colors.panel2, borderRadius: 6, overflow: "hidden" },
  progressFill: { height: 7, backgroundColor: colors.blue },
  infoCard: { backgroundColor: colors.panel, padding: 14, borderRadius: 12, gap: 7, marginTop: 6 },
});
