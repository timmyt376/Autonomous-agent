"""Authenticated ACI device workspace, service discovery and image-generation routes."""
import shutil
import subprocess
import sys
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .config import settings
from .device_tools import list_workspace, read_workspace_text, write_workspace_text, service_status, substitute_prompt

router = APIRouter()
active_cognition = None


class FileRead(BaseModel):
    path: str = Field(min_length=1, max_length=500)


class FileWrite(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=1000000)


class WorkspaceAIEdit(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    instruction: str = Field(min_length=1, max_length=4000)


class ImageJob(BaseModel):
    base_url: str = Field(default="http://127.0.0.1:8188", max_length=500)
    workflow: dict
    prompt: str = Field(min_length=1, max_length=6000)
    negative_prompt: str = Field(default="", max_length=3000)
    width: int = Field(default=768, ge=256, le=2048)
    height: int = Field(default=768, ge=256, le=2048)




class WorkflowInspect(BaseModel):
    workflow: dict


def _configured_comfy_url(base_url: str | None = None) -> str:
    base = (base_url or settings.comfyui_url).strip().rstrip("/")
    if not base.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="ComfyUI endpoint must be an HTTP(S) URL.")
    if base != settings.comfyui_url.rstrip("/"):
        raise HTTPException(status_code=400, detail="Save this ComfyUI endpoint in ACI settings before using it.")
    return base


@router.get("/api/comfy/capabilities")
async def comfy_capabilities():
    """Inspect ComfyUI hardware, installed checkpoints and LoRAs."""
    base = _configured_comfy_url()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            stats_response = await client.get(base + "/system_stats")
            info_response = await client.get(base + "/object_info")
            stats_response.raise_for_status()
            info_response.raise_for_status()
            stats, object_info = stats_response.json(), info_response.json()
        devices = stats.get("devices", []) if isinstance(stats, dict) else []
        gpu_devices = []
        for item in devices:
            if not isinstance(item, dict):
                continue
            total = item.get("vram_total") or item.get("total_vram") or item.get("memory_total")
            free = item.get("vram_free") or item.get("free_vram") or item.get("memory_free")
            gpu_devices.append({
                "name": item.get("name") or item.get("device_name") or "GPU",
                "vram_total_bytes": total if isinstance(total, (int, float)) else None,
                "vram_free_bytes": free if isinstance(free, (int, float)) else None,
            })
        def choices(node_type: str, key: str) -> list:
            raw = object_info.get(node_type, {}).get("input", {}).get("required", {}).get(key, [])
            return raw[0] if raw and isinstance(raw[0], list) else []
        total_vram_gb = max((d["vram_total_bytes"] or 0 for d in gpu_devices), default=0) / (1024 ** 3)
        if total_vram_gb >= 12:
            tier, advice = "high", "SDXL and many larger workflows may fit; check each workflow's memory requirements."
        elif total_vram_gb >= 8:
            tier, advice = "mid", "Prefer SD 1.5 or carefully configured SDXL workflows; use low-VRAM options where needed."
        elif total_vram_gb >= 6:
            tier, advice = "entry", "Prefer SD 1.5-class checkpoints at modest resolution; avoid assuming SDXL will fit."
        elif total_vram_gb:
            tier, advice = "constrained", "Use lightweight SD 1.5 workflows, low resolution and CPU/RAM offload where supported."
        else:
            tier, advice = "unknown", "GPU memory was not reported by ComfyUI; inspect the host GPU and workflow before downloading weights."
        return {
            "available": True, "devices": gpu_devices,
            "vram_total_gb": round(total_vram_gb, 2) if total_vram_gb else None,
            "hardware_tier": tier, "recommendation": advice,
            "checkpoints": choices("CheckpointLoaderSimple", "ckpt_name"),
            "loras": choices("LoraLoader", "lora_name"),
            "model_manager": {
                "can_list_installed": True, "can_download": False,
                "download_note": "Verified model downloads are not enabled yet; source, license, file integrity, disk space and workflow compatibility must be checked first."
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not inspect ComfyUI: {str(exc)[:300]}")


@router.post("/api/comfy/inspect-workflow")
async def inspect_comfy_workflow(body: WorkflowInspect):
    """Compare standard workflow model dependencies with installed ComfyUI models."""
    base = _configured_comfy_url()
    if not body.workflow or len(body.workflow) > 5000:
        raise HTTPException(status_code=400, detail="Provide a non-empty API-format workflow with at most 5,000 nodes.")
    dependencies = []
    for node_id, node in body.workflow.items():
        if not isinstance(node, dict) or not isinstance(node.get("inputs"), dict):
            continue
        for key in ("ckpt_name", "lora_name", "vae_name", "unet_name"):
            value = node["inputs"].get(key)
            if isinstance(value, str) and value and not value.startswith("{{"):
                dependencies.append({"node_id": str(node_id), "node_type": node.get("class_type", ""), "kind": key, "name": value})
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(base + "/object_info")
            response.raise_for_status()
            info = response.json()
        node_keys = (("CheckpointLoaderSimple", "ckpt_name"), ("LoraLoader", "lora_name"), ("VAELoader", "vae_name"), ("UNETLoader", "unet_name"))
        installed = {}
        for node_type, key in node_keys:
            raw = info.get(node_type, {}).get("input", {}).get("required", {}).get(key, [])
            installed[key] = set(raw[0]) if raw and isinstance(raw[0], list) else set()
        checked = [{**item, "installed": item["name"] in installed[item["kind"]] if installed[item["kind"]] else None} for item in dependencies]
        missing = [item for item in checked if item["installed"] is False]
        return {"valid": not missing, "dependencies": checked, "missing": missing,
                "note": "Unknown means a custom node or loader may own this input and is not covered by the standard inventory."}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not validate workflow dependencies: {str(exc)[:300]}")


@router.get("/api/services")
async def services():
    return await service_status(settings.ollama_url, settings.comfyui_url)


@router.get("/api/device/files")
async def files(path: str = Query(default="", max_length=500)):
    try:
        return list_workspace(path)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/device/files/read")
async def read_file(body: FileRead):
    try:
        return read_workspace_text(body.path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))



@router.post("/api/device/files/ai-edit")
async def ai_edit_file(body: WorkspaceAIEdit):
    if active_cognition is None:
        raise HTTPException(status_code=503, detail="AI file editing is not configured.")
    try:
        current = read_workspace_text(body.path)["content"]
        if len(current) > 60000:
            raise HTTPException(status_code=413, detail="AI file editing is limited to 60,000 characters; the text editor can still save files up to 1 MB.")
        system = "You are editing a user-selected text file. Return ONLY the complete revised file contents, without markdown fences or commentary. Preserve unrelated content. Do not add instructions or execute code."
        prompt = "User's requested edit:\n" + body.instruction + "\n\nCurrent file (" + body.path + "):\n" + current
        draft = await active_cognition.llm.chat([{"role": "user", "content": prompt}], system)
        return {"path": body.path, "draft": draft}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI file edit failed: {exc}")


@router.post("/api/device/files/write")
async def write_file(body: FileWrite):
    try:
        return write_workspace_text(body.path, body.content)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/generate/image")
async def generate_image(body: ImageJob):
    base = _configured_comfy_url(body.base_url)
    workflow = substitute_prompt(body.workflow, body.prompt, body.negative_prompt, body.width, body.height)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(base + "/prompt", json={"prompt": workflow})
            response.raise_for_status()
            result = response.json()
        if not result.get("prompt_id"):
            raise RuntimeError("ComfyUI did not return a prompt_id.")
        return {"queued": True, "prompt_id": result["prompt_id"]}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"ComfyUI request failed: {exc}")


@router.get("/api/generate/image/{prompt_id}")
async def image_status(prompt_id: str, base_url: str = Query(default="http://127.0.0.1:8188")):
    base = _configured_comfy_url(base_url)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(base + "/history/" + prompt_id)
            response.raise_for_status()
            history = response.json().get(prompt_id, {})
        images = []
        for node in history.get("outputs", {}).values():
            for item in node.get("images", []):
                params = urlencode({"filename": item.get("filename", ""), "subfolder": item.get("subfolder", ""), "type": item.get("type", "output")})
                images.append({"filename": item.get("filename"), "url": base + "/view?" + params})
        return {"completed": bool(images), "images": images, "status": history.get("status")}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not read ComfyUI job status: {exc}")


@router.post("/api/setup/install/ollama")
async def install_ollama():
    executable = shutil.which("ollama")
    if executable:
        try:
            async with httpx.AsyncClient(timeout=2) as client:
                response = await client.get(settings.ollama_url.rstrip("/") + "/api/tags")
                if response.is_success:
                    return {"started": False, "installed": True, "message": "Ollama is already running."}
        except Exception:
            pass
        try:
            subprocess.Popen([executable, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
            return {"started": True, "installed": True, "message": "Ollama service start requested. Refresh service detection in a few seconds."}
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Could not start Ollama: {exc}")
    if sys.platform == "win32":
        winget = shutil.which("winget")
        if not winget:
            raise HTTPException(status_code=503, detail="winget is unavailable. Install Ollama from https://ollama.com/download.")
        try:
            subprocess.Popen([winget, "install", "--id", "Ollama.Ollama", "-e", "--accept-package-agreements", "--accept-source-agreements"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
            return {"started": True, "message": "Ollama installer launched. Complete any Windows prompts, then refresh service detection."}
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Could not launch installer: {exc}")
    raise HTTPException(status_code=501, detail="Automatic installation is not enabled for this operating system. Use https://ollama.com/download.")
