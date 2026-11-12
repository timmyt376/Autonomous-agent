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
    base = body.base_url.strip().rstrip("/")
    if not base.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="ComfyUI endpoint must be an HTTP(S) URL.")
    if base != settings.comfyui_url.rstrip("/"):
        raise HTTPException(status_code=400, detail="Save this ComfyUI endpoint in ACI settings before using it.")
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
    base = base_url.strip().rstrip("/")
    if base != settings.comfyui_url.rstrip("/"):
        raise HTTPException(status_code=400, detail="Use the configured ComfyUI endpoint.")
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
    if shutil.which("ollama"):
        return {"started": False, "installed": True, "message": "Ollama is already installed."}
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
