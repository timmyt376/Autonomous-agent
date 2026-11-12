import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  cancelImageGeneration, generateLocalImage, getGeneratedImages, imageGenConstants,
  isNpuSupported, loadImageModel, localImageGenAvailable, onImageProgress,
  type LocalImageProgress,
} from "./localDream";
import { downloadImageModel, IMAGE_MODELS, imageModelDir, isImageModelDownloaded } from "./imageModels";

const palette = { bg: "#0b0f1a", panel: "#121a29", border: "#263650", blue: "#4a7dff", green: "#2ecc71", amber: "#f5b84d", text: "#eef3ff", muted: "#9aa9c2" };

type Gen = { id: string; imagePath: string; createdAt: string };
type Phase = "" | "downloading" | "loading";

export function ImageGen() {
  const [available] = useState(localImageGenAvailable());
  const [npu, setNpu] = useState<boolean | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [modelId, setModelId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("");
  const [dl, setDl] = useState<number | null>(null);
  const [status, setStatus] = useState("");

  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [steps, setSteps] = useState("20");
  const [genBusy, setGenBusy] = useState(false);
  const [progress, setProgress] = useState<LocalImageProgress | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [result, setResult] = useState<Gen | null>(null);
  const [gallery, setGallery] = useState<Gen[]>([]);
  const c = imageGenConstants();

  useEffect(() => {
    isNpuSupported().then(setNpu).catch(() => setNpu(false));
    refreshGallery();
    refreshDownloaded();
  }, []);

  async function refreshGallery() {
    try { setGallery(await getGeneratedImages() as Gen[]); } catch { /* not available */ }
  }

  async function refreshDownloaded() {
    const out: Record<string, boolean> = {};
    for (const m of IMAGE_MODELS) out[m.id] = await isImageModelDownloaded(m.id);
    setDownloaded(out);
  }

  /** Download (if needed) then load a model — always one model resident at a time. */
  async function selectModel(id: string) {
    if (busy) return;
    const m = IMAGE_MODELS.find(x => x.id === id)!;
    setBusy(true); setStatus(""); setDl(null);
    try {
      if (!downloaded[id]) {
        setPhase("downloading");
        setStatus(`Downloading ${m.id} (~1–2 GB)…`);
        await downloadImageModel(m.id, m.repo, m.file, f => setDl(f));
        setDownloaded(prev => ({ ...prev, [id]: true }));
      }
      setPhase("loading");
      setStatus(`Loading ${m.id} — the native engine is starting…`);
      // Native loadModel stops any running server first, so only one model runs at a time.
      await loadImageModel(imageModelDir(m.id), "auto");
      setModelId(id);
      setLoaded(true);
      setStatus(`Loaded ${m.id} · ${npu ? "NPU (QNN)" : "CPU (MNN)"}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Model setup failed.");
    } finally {
      setBusy(false); setDl(null); setPhase("");
    }
  }

  async function generate() {
    setGenBusy(true); setStatus(""); setProgress(null); setPreviewPath(null); setResult(null);
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
      setGenBusy(false);
    }
  }

  if (!available) {
    return <View style={styles.card}><Text style={styles.title}>On-device image generation</Text><Text style={styles.help}>This build does not include the on-device image runtime (Android-only). Use the ComfyUI option above instead.</Text></View>;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Image generation · on this phone</Text>
      <Text style={styles.help}>
        Stable Diffusion running on the phone. {npu ? "Snapdragon NPU (QNN) detected — fastest backend." : "CPU (MNN) backend."} One model runs at a time; first load is the slowest.
      </Text>

      <Text style={styles.label}>Models</Text>
      {IMAGE_MODELS.map(m => {
        const isLoaded = modelId === m.id && loaded;
        const isDown = downloaded[m.id];
        return (
          <View key={m.id} style={[styles.row, isLoaded && { borderColor: palette.green }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>{m.id}</Text>
              <Text style={styles.muted}>{isLoaded ? "Loaded · active" : isDown ? "Downloaded · ready to load" : "Not downloaded"}</Text>
            </View>
            {isLoaded ? (
              <Text style={styles.badge}>ACTIVE</Text>
            ) : (
              <TouchableOpacity style={styles.smallBtn} disabled={busy} onPress={() => selectModel(m.id)}>
                <Text style={styles.smallBtnText}>{isDown ? "Load" : "Download"}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {loaded ? (
        <>
          <Text style={styles.label}>Describe the image</Text>
          <TextInput value={prompt} onChangeText={setPrompt} style={styles.field} placeholder="e.g. a misty forest at dawn, cinematic" placeholderTextColor={palette.muted} multiline />
          <TextInput value={negative} onChangeText={setNegative} style={styles.field} placeholder="Negative prompt (optional)" placeholderTextColor={palette.muted} multiline />
          <View style={styles.rowLine}>
            <Text style={styles.label}>Steps</Text>
            <TextInput value={steps} onChangeText={setSteps} keyboardType="numeric" style={[styles.field, styles.stepsField]} />
          </View>
          <TouchableOpacity style={styles.button} disabled={genBusy} onPress={generate}>
            <Text style={styles.buttonText}>{genBusy ? "Generating…" : "Generate image"}</Text>
          </TouchableOpacity>
          {genBusy && progress ? <Text style={styles.muted}>Step {progress.step}/{progress.totalSteps}</Text> : null}
          {genBusy ? <TouchableOpacity style={styles.danger} onPress={async () => { await cancelImageGeneration(); setGenBusy(false); }}><Text style={styles.buttonText}>Cancel</Text></TouchableOpacity> : null}
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

      {busy ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={palette.blue} />
          <Text style={styles.overlayTitle}>{phase === "downloading" ? "Downloading model" : "Loading model"}</Text>
          {phase === "downloading" && dl !== null ? (
            <Text style={styles.overlayPct}>{(dl * 100).toFixed(0)}%</Text>
          ) : null}
          <Text style={styles.overlayStatus}>{status}</Text>
          <Text style={styles.overlayWarn}>⏳ First load can take 1–2 minutes while the engine warms up — please keep the app open.</Text>
        </View>
      ) : null}
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
  smallBtn: { backgroundColor: palette.blue, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  smallBtnText: { color: palette.text, fontWeight: "800", fontSize: 13 },
  badge: { color: palette.green, fontWeight: "800", fontSize: 12 },
  muted: { color: palette.muted, fontSize: 12 },
  image: { width: "100%", height: 240, borderRadius: 10, marginTop: 6 },
  status: { color: palette.amber, fontSize: 12, lineHeight: 18 },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(8,12,22,0.96)", borderRadius: 14, alignItems: "center", justifyContent: "center", padding: 22, gap: 12, zIndex: 10 },
  overlayTitle: { color: palette.text, fontSize: 18, fontWeight: "800" },
  overlayPct: { color: palette.blue, fontSize: 30, fontWeight: "800" },
  overlayStatus: { color: palette.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  overlayWarn: { color: palette.amber, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
