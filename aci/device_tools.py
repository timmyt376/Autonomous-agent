"""Explicitly scoped workspace and local generation-service helpers."""
from __future__ import annotations

from pathlib import Path
from typing import Any
import httpx

from .config import settings


MAX_TEXT_FILE_BYTES = 1_000_000
MAX_WORKSPACE_ENTRIES = 250


def resolve_workspace_path(relative: str = "") -> Path:
    root = settings.workspace.resolve()
    candidate = (root / relative).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError("Path is outside the ACI workspace.")
    if candidate.is_symlink():
        raise ValueError("Symbolic links are not accessible through the workspace API.")
    return candidate


def list_workspace(relative: str = "") -> dict[str, Any]:
    directory = resolve_workspace_path(relative)
    if not directory.exists():
        directory.mkdir(parents=True, exist_ok=True)
    if not directory.is_dir():
        raise ValueError("Requested path is not a directory.")
    entries = []
    for item in sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))[:MAX_WORKSPACE_ENTRIES]:
        if item.is_symlink():
            continue
        try:
            stat = item.stat()
            entries.append({
                "name": item.name,
                "path": str(item.relative_to(settings.workspace.resolve())).replace("\\", "/"),
                "kind": "directory" if item.is_dir() else "file",
                "size": stat.st_size if item.is_file() else None,
                "modified": stat.st_mtime,
            })
        except OSError:
            continue
    return {"path": relative, "entries": entries, "truncated": len(list(directory.iterdir())) > MAX_WORKSPACE_ENTRIES}


def read_workspace_text(relative: str) -> dict[str, str]:
    path = resolve_workspace_path(relative)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError("File not found in the ACI workspace.")
    if path.stat().st_size > MAX_TEXT_FILE_BYTES:
        raise ValueError("File is larger than the 1 MB text-edit limit.")
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("This file is not UTF-8 text and cannot be edited in the text editor.") from exc
    return {"path": relative, "content": content}


def write_workspace_text(relative: str, content: str) -> dict[str, str]:
    if not relative or len(content.encode("utf-8")) > MAX_TEXT_FILE_BYTES:
        raise ValueError("Provide a relative file path and text smaller than 1 MB.")
    path = resolve_workspace_path(relative)
    if path.exists() and path.is_dir():
        raise ValueError("A directory cannot be overwritten as a text file.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return {"path": relative, "saved": True}


async def service_status(ollama_url: str, comfy_url: str) -> dict[str, Any]:
    result: dict[str, Any] = {"ollama": {"available": False}, "comfyui": {"available": False}}
    async with httpx.AsyncClient(timeout=3) as client:
        try:
            response = await client.get(ollama_url.rstrip("/") + "/api/tags")
            response.raise_for_status()
            result["ollama"] = {"available": True, "models": response.json().get("models", [])}
        except Exception as exc:
            result["ollama"] = {"available": False, "error": str(exc)[:240]}
        try:
            response = await client.get(comfy_url.rstrip("/") + "/system_stats")
            response.raise_for_status()
            result["comfyui"] = {"available": True, "system": response.json()}
        except Exception as exc:
            result["comfyui"] = {"available": False, "error": str(exc)[:240]}
    return result


def substitute_prompt(value: Any, prompt: str, negative_prompt: str, width: int, height: int) -> Any:
    if isinstance(value, dict):
        return {key: substitute_prompt(item, prompt, negative_prompt, width, height) for key, item in value.items()}
    if isinstance(value, list):
        return [substitute_prompt(item, prompt, negative_prompt, width, height) for item in value]
    if isinstance(value, str):
        return (value.replace("{{PROMPT}}", prompt)
                .replace("{{NEGATIVE_PROMPT}}", negative_prompt)
                .replace("{{WIDTH}}", str(width))
                .replace("{{HEIGHT}}", str(height)))
    return value

def hardware_advice() -> dict[str, Any]:
    import os
    import platform
    import subprocess
    import shutil

    total_ram_gb = 0.0
    try:
        import psutil
        total_ram_gb = psutil.virtual_memory().total / (1024 ** 3)
    except Exception:
        if os.name == "nt":
            try:
                import ctypes
                class MEMORYSTATUSEX(ctypes.Structure):
                    _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong), ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
                state = MEMORYSTATUSEX()
                state.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(state)):
                    total_ram_gb = state.ullTotalPhys / (1024 ** 3)
            except Exception:
                pass
        elif hasattr(os, "sysconf"):
            try:
                total_ram_gb = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / (1024 ** 3)
            except (ValueError, OSError):
                pass
    gpu_name = None
    gpu_vram_gb = 0.0
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            result = subprocess.run([nvidia_smi, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=4, check=True)
            first = result.stdout.splitlines()[0].split(",")
            gpu_name = first[0].strip()
            gpu_vram_gb = float(first[1].strip()) / 1024
        except Exception:
            pass
    if gpu_vram_gb >= 8 or total_ram_gb >= 16:
        model = "qwen3:4b"
    elif gpu_vram_gb >= 4 or total_ram_gb >= 8:
        model = "qwen3:1.7b"
    else:
        model = "qwen3:0.6b"
    return {"platform": platform.platform(), "ram_gb": round(total_ram_gb, 1), "gpu_name": gpu_name, "gpu_vram_gb": round(gpu_vram_gb, 1), "recommended_model": model}
