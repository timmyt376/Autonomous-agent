import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import * as Device from "expo-device";
import { StatusBar } from "expo-status-bar";
import { discoverModels, sendMessage } from "./src/aci";
import { chatWithLocalModel, downloadAndLoadLocalModel } from "./src/localModel";
import { loadSettings, saveSettings } from "./src/storage";
import { ChatMessage, ConnectionSettings, ProviderMode } from "./src/types";

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
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"chat" | "settings">("chat");
  const [status, setStatus] = useState("Not connected");
  const [models, setModels] = useState<string[]>([]);
  const [deviceInfo, setDeviceInfo] = useState("Checking device…");

  useEffect(() => {
    loadSettings().then(setSettings).catch(() => Alert.alert("Storage error", "Could not load ACI settings."));
    const memory = Device.totalMemory ? `${(Device.totalMemory / 1024 ** 3).toFixed(1)} GB RAM reported` : "Device memory information unavailable";
    setDeviceInfo(`${Device.manufacturer ?? "Device"} ${Device.modelName ?? ""} · ${Platform.OS} · ${memory}`);
  }, []);

  const isDeviceMode = settings?.mode === "device";
  const modeDescription = useMemo(() => isDeviceMode
    ? "Device-local endpoint. Prompts stay on this phone only when the endpoint is a runtime running on this same device."
    : "API mode. Prompts are sent to the provider URL you configure.", [isDeviceMode]);

  async function updateSettings(next: ConnectionSettings) {
    setSettings(next);
    await saveSettings(next);
  }

  async function connect() {
    if (!settings) return;
    setStatus("Checking…");
    try {
      if (settings.mode === "device") {
        const result = await downloadAndLoadLocalModel(settings.modelUrl);
        setStatus(result);
        setModels([settings.model || "On-device GGUF"]);
      } else {
        const found = await discoverModels(settings);
        setModels(found.map(item => item.id));
        setStatus("Connected · " + found.length + " model(s)");
        if (!settings.model && found[0]) await updateSettings({ ...settings, model: found[0].id });
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection failed");
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
      const reply = settings.mode === "device" ? await chatWithLocalModel(next.slice(0, -1), content) : await sendMessage(settings, next.slice(0, -1), content);
      setMessages(current => [...current, { id: makeId(), role: "assistant", content: reply, createdAt: Date.now() }]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown model error";
      setMessages(current => [...current, { id: makeId(), role: "assistant", content: `I couldn't reach the model. ${detail}`, createdAt: Date.now() }]);
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
        <View style={styles.modePill}><View style={[styles.dot, { backgroundColor: isDeviceMode ? colors.amber : colors.blue }]} /><Text style={styles.modeText}>{isDeviceMode ? "ON DEVICE" : "API"}</Text></View>
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setTab("chat")} style={[styles.tab, tab === "chat" && styles.tabActive]}><Text style={styles.tabText}>Chat</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("settings")} style={[styles.tab, tab === "settings" && styles.tabActive]}><Text style={styles.tabText}>Connection</Text></TouchableOpacity>
      </View>
      {tab === "chat" ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.connectionLine}><Text style={styles.muted}>{settings.model || "No model selected"}</Text><Text style={styles.muted}>{status}</Text></View>
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
      ) : (
        <ScrollView style={styles.fill} contentContainerStyle={styles.settingsContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Model location</Text>
          <View style={styles.segment}>
            <TouchableOpacity onPress={() => updateSettings({ ...settings, mode: "device", baseUrl: "http://127.0.0.1:8080/v1" })} style={[styles.segmentButton, isDeviceMode && styles.segmentSelected]}><Text style={styles.segmentText}>On this device</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => updateSettings({ ...settings, mode: "api" })} style={[styles.segmentButton, !isDeviceMode && styles.segmentSelected]}><Text style={styles.segmentText}>API provider</Text></TouchableOpacity>
          </View>
          <Text style={styles.help}>{modeDescription}</Text>
          {isDeviceMode ? (
            <>
              <Text style={styles.label}>Direct GGUF model URL</Text>
              <TextInput value={settings.modelUrl} onChangeText={value => updateSettings({ ...settings, modelUrl: value })} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.field} placeholder="https://huggingface.co/.../model.Q4_K_M.gguf" placeholderTextColor={colors.muted} />
              <Text style={styles.help}>Paste a direct download link to a GGUF file. It will be saved in private app storage and loaded by llama.cpp on this phone.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={connect}><Text style={styles.primaryText}>Download & load on this phone</Text></TouchableOpacity>
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
          <View style={styles.infoCard}><Text style={styles.sectionTitle}>Device information</Text><Text style={styles.help}>{deviceInfo}</Text><Text style={styles.help}>Memory and hardware reporting is advisory only. A model's actual compatibility depends on its size, quantisation, runtime, available RAM, accelerator support and thermal limits.</Text></View>
          <View style={styles.infoCard}><Text style={styles.sectionTitle}>Local model setup</Text><Text style={styles.help}>For true on-phone inference, install or bundle a compatible on-device runtime that exposes an OpenAI-compatible HTTP endpoint on the phone (for example, a llama.cpp-based mobile runtime). Set its local endpoint above. The app never silently falls back to a cloud provider.</Text><Text style={styles.help}>If the runtime runs on another computer, use that computer's LAN address instead; that is local-network inference, not on-device inference.</Text></View>
          <View style={styles.infoCard}><Text style={styles.sectionTitle}>Privacy</Text><Text style={styles.help}>API mode sends messages to the configured provider. Device mode sends requests only to the configured endpoint. Do not use an untrusted endpoint or paste secrets into chat.</Text></View>
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
  connectionLine: { paddingHorizontal: 18, paddingVertical: 9, flexDirection: "row", justifyContent: "space-between", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
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
  infoCard: { backgroundColor: colors.panel, padding: 14, borderRadius: 12, gap: 7, marginTop: 6 },
});
