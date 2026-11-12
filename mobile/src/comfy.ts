import * as FileSystem from "expo-file-system/legacy";

function replaceTokens(value: unknown, prompt: string, negative: string): unknown {
  if (Array.isArray(value)) return value.map(item => replaceTokens(item, prompt, negative));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, replaceTokens(item, prompt, negative)]));
  }
  if (typeof value === "string") return value.replaceAll("{{PROMPT}}", prompt).replaceAll("{{NEGATIVE_PROMPT}}", negative);
  return value;
}

export async function checkComfyUI(baseUrl: string): Promise<boolean> {
  const response = await fetch(baseUrl.replace(/\/+$/, "") + "/system_stats");
  return response.ok;
}

export async function generateComfyImage(baseUrl: string, workflowJson: string, prompt: string, negative = ""): Promise<string> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) throw new Error("Enter a valid ComfyUI HTTP endpoint.");
  let workflow: unknown;
  try { workflow = JSON.parse(workflowJson); } catch { throw new Error("Paste a valid ComfyUI API-format workflow JSON first."); }
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) throw new Error("Workflow must be a ComfyUI API-format object.");
  const payload = replaceTokens(workflow, prompt, negative);
  const queued = await fetch(base + "/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: payload }) });
  if (!queued.ok) throw new Error("ComfyUI rejected the workflow: " + (await queued.text()).slice(0, 300));
  const { prompt_id } = await queued.json() as { prompt_id?: string };
  if (!prompt_id) throw new Error("ComfyUI did not return a job ID.");
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const response = await fetch(base + "/history/" + encodeURIComponent(prompt_id));
    if (!response.ok) continue;
    const history = (await response.json() as Record<string, any>)[prompt_id];
    if (!history) continue;
    for (const node of Object.values(history.outputs ?? {}) as Array<any>) {
      const image = node.images?.[0];
      if (!image?.filename) continue;
      const query = "?filename=" + encodeURIComponent(image.filename) + "&subfolder=" + encodeURIComponent(image.subfolder ?? "") + "&type=" + encodeURIComponent(image.type ?? "output");
      const target = (FileSystem.documentDirectory ?? "") + "aci-generated-" + Date.now() + ".png";
      const downloaded = await FileSystem.downloadAsync(base + "/view" + query, target);
      if (downloaded.status < 200 || downloaded.status >= 300) throw new Error("ComfyUI image download failed.");
      return downloaded.uri;
    }
    const status = history.status?.status_str;
    if (status === "error") throw new Error("ComfyUI reported a workflow error.");
  }
  throw new Error("Image generation timed out. Check the ComfyUI queue and server.");
}
