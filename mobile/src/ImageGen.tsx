import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  cancelImageGeneration, generateLocalImage, getGeneratedImages, imageGenConstants,
  isModelLoaded, isNpuSupported, loadImageModel, localImageGenAvailable, onImageProgress,
  type LocalImageProgress,
} from "./localDream";
import { downloadImageModel, IMAGE_MODELS, imageModelDir } from "./imageModels";

const palette = { bg: "#0b0f1a", panel: "#121a29", border: "#263650", blue: "#4a7dff", amber: "#f5b84d", text: "#eef3ff", muted: "#9aa9c2" };

type Gen = { id: string; imagePath: string; createdAt: string };

export function ImageGen() {
  const [available] = useState(localImageGenAvailable());
  const [npu, setNpu] = useState<boolean | null>(null);
  const [modelId, setModelId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [steps, setSteps] = useState("20");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<LocalImageProgress | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [result, setResult] = useState<Gen | null>(null);
  const [gallery, setGallery] = useState<Gen[]>([]);
  const [dl, setDl] = useState<number | null>(null);
  const c = imageGenConstants();

  useEffect(() => {
    isNpuSupported().then(setNpu).catch(() => setNpu(false));
    refreshGallery();
  }, []);

  async function refreshGallery() {
    try { setGallery(await getGeneratedImages() as Gen[]); } catch { /* not available */ }
  }

  async function downloadAndLoad(id: string) {
    setBusy(true); setStatus(""); setDl(null);
    try {
      const m = IMAGE_MODELS.find(x => x.id === id)!;
      const dir = await downloadImageModel(m.id, m.repo, m.file, f => setDl(f));
      setStatus("Extracted. Loading model (first load can take a minute)…");
      await loadImageModel(dir, "auto");
      setModelId(id);
      setLoaded(true);
      setStatus("Model loaded · " + (npu ? "NPU (QNN)" : "CPU (MNN)") + " backend");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Model setup failed.");
    } finally {
      setBusy(false); setDl(null);
    }
  }

  async function generate() {
    setBusy(true); setStatus(""); setProgress(null); setPreviewPath(null); setResult(null);
    const sub = onImageProgress(p => {
      setProgress(p);
      if (p.previewPath) setPreviewPath(p.previewPath);
    });
    try {
      const out = await generateLocalImage({
        prompt,
        negativePrompt: negative,
        steps: parseInt(steps, 10) || 20,
        width: 512,
        height: 512,
      });
      setResult({ id: out.id, imagePath: out.imagePath, createdAt: new Date().toISOString() });
      setStatus("Done in " + (out.generationTimeMs / 1000).toFixed(1) + "s");
      await refreshGallery();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      sub?.remove();
      setBusy(false);
    }
  }

  if (!available) {
    return <View style={styles.card}><Text style={styles.title}>On-device image generation</Text><Text style={styles.help}>This build does not include the on-device image runtime (Android-only). Use the ComfyUI option above instead.</Text></View>;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Image generation · on this phone</Text>
      <Text style={styles.help}>
        Stable Diffusion running on the phone. {npu ? "Snapdragon NPU (QNN) detected — fastest backend." : "CPU (MNN) backend."} Requires a one-time model download (~1–2 GB).
      </Text>

      {!modelId ? (
        <>
          <Text style={styles.label}>1 · Download a model</Text>
          {IMAGE_MODELS.map(m => (
            <TouchableOpacity key={m.id} style={styles.row} disabled={busy} onPress={() => downloadAndLoad(m.id)}>
              <Text style={styles.rowText}>{m.id}</Text>
              <Text style={styles.muted}>{busy ? (dl !== null ? `Downloading ${(dl * 100).toFixed(0)}%` : "Working…") : "Download & load"}</Text>
            </TouchableOpacity>
          ))}
        </>
      ) : (
        <>
          <Text style={styles.label}>Model · {modelId} ({loaded ? "loaded" : "not loaded"})</Text>
          {!loaded ? (
            <TouchableOpacity style={styles.button} disabled={busy} onPress={() => downloadAndLoad(modelId)}><Text style={styles.buttonText}>Reload model</Text></TouchableOpacity>
          ) : null}
        </>
      )}

      {loaded ? (
        <>
          <Text style={styles.label}>2 · Describe the image</Text>
          <TextInput value={prompt} onChangeText={setPrompt} style={styles.field} placeholder="e.g. a misty forest at dawn, cinematic" placeholderTextColor={palette.muted} multiline />
          <TextInput value={negative} onChangeText={setNegative} style={styles.field} placeholder="Negative prompt (optional)" placeholderTextColor={palette.muted} multiline />
          <View style={styles.rowLine}>
            <Text style={styles.label}>Steps</Text>
            <TextInput value={steps} onChangeText={setSteps} keyboardType="numeric" style={[styles.field, styles.stepsField]} />
          </View>
          <TouchableOpacity style={styles.button} disabled={busy} onPress={generate}>
            <Text style={styles.buttonText}>{busy ? "Generating…" : "Generate image"}</Text>
          </TouchableOpacity>
          {busy && progress ? <Text style={styles.muted}>Step {progress.step}/{progress.totalSteps}</Text> : null}
          {busy ? <TouchableOpacity style={styles.danger} onPress={async () => { await cancelImageGeneration(); setBusy(false); }}><Text style={styles.buttonText}>Cancel</Text></TouchableOpacity> : null}
          {previewPath ? <Image source={{ uri: "file://" + previewPath }} style={styles.image} resizeMode="contain" /> : null}
          {result ? <Image source={{ uri: "file://" + result.imagePath }} style={styles.image} resizeMode="contain" /> : null}
        </>
      ) : null}

      {gallery.length > 0 ? (
        <>
          <Text style={styles.label}>Generated on this phone</Text>
          {gallery.map(g => <Image key={g.id} source={{ uri: "file://" + g.imagePath }} style={styles.image} resizeMode="contain" />)}
        </>
      ) : null}

      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, borderRadius: 14, padding: 14, gap: 10 },
  title: { color: palette.text, fontSize: 16, fontWeight: "800" },
  help: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  label: { color: palette.text, fontSize: 12, fontWeight: "700", marginTop: 4 },
  field: { color: palette.text, backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.border, borderRadius: 10, padding: 11, marginTop: 2 },
  stepsField: { width: 70, textAlign: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: palette.bg, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.border },
  rowText: { color: palette.text, fontWeight: "700" },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  button: { backgroundColor: palette.blue, padding: 13, borderRadius: 10, alignItems: "center", marginTop: 4 },
  danger: { backgroundColor: "#c0392b", padding: 13, borderRadius: 10, alignItems: "center", marginTop: 4 },
  buttonText: { color: palette.text, fontWeight: "800" },
  muted: { color: palette.muted, fontSize: 12 },
  image: { width: "100%", height: 240, borderRadius: 10, marginTop: 6 },
  status: { color: palette.amber, fontSize: 12, lineHeight: 18 },
});
