export type CatalogModel = {
  id: string;
  downloads: number;
  likes: number;
};

export type CatalogFile = {
  name: string;
  size?: number;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Model catalogue request failed (" + response.status + ").");
  return await response.json() as T;
}

export async function searchGgufModels(query: string): Promise<CatalogModel[]> {
  const term = query.trim() || "small instruct";
  const url = "https://huggingface.co/api/models?search=" + encodeURIComponent(term) + "&sort=downloads&direction=-1&limit=20";
  const results = await getJson<Array<{ id?: string; downloads?: number; likes?: number; tags?: string[] }>>(url);
  return results
    .filter(item => typeof item.id === "string" && (item.tags ?? []).some(tag => tag.toLowerCase().includes("gguf")))
    .map(item => ({ id: item.id!, downloads: item.downloads ?? 0, likes: item.likes ?? 0 }));
}

export async function listGgufFiles(modelId: string): Promise<CatalogFile[]> {
  const url = "https://huggingface.co/api/models/" + encodeURIComponent(modelId).replace(/%2F/g, "/") + "?blobs=true";
  const result = await getJson<{ siblings?: Array<{ rfilename?: string; size?: number }> }>(url);
  return (result.siblings ?? [])
    .filter(file => typeof file.rfilename === "string" && file.rfilename.toLowerCase().endsWith(".gguf") && !file.rfilename.toLowerCase().includes("mmproj"))
    .map(file => ({ name: file.rfilename!, size: file.size }))
    .sort((a, b) => (a.size ?? Number.MAX_SAFE_INTEGER) - (b.size ?? Number.MAX_SAFE_INTEGER));
}

export function buildHuggingFaceDownloadUrl(modelId: string, filename: string): string {
  const safeModel = modelId.split("/").map(encodeURIComponent).join("/");
  const safeFile = filename.split("/").map(encodeURIComponent).join("/");
  return "https://huggingface.co/" + safeModel + "/resolve/main/" + safeFile + "?download=true";
}
