from pathlib import Path
import os

from dotenv import load_dotenv

load_dotenv()


def _read_keyring_secret() -> str:
    try:
        import keyring
        return keyring.get_password("aci-runtime", "deepseek-api-key") or ""
    except Exception:
        # Headless Linux installations may not have an OS keyring configured.
        return ""


def store_openai_api_key(value: str) -> None:
    if not value.strip():
        return
    try:
        import keyring
        if value.strip():
            keyring.set_password("aci-runtime", "openai-compatible-api-key", value.strip())
        else:
            try:
                keyring.delete_password("aci-runtime", "openai-compatible-api-key")
            except Exception:
                pass
    except Exception as exc:
        raise RuntimeError("The operating-system keyring is unavailable for the custom provider key.") from exc


def store_deepseek_api_key(value: str) -> None:
    try:
        import keyring
    except Exception as exc:
        raise RuntimeError(
            "The operating-system keyring is unavailable. Set DEEPSEEK_API_KEY in .env instead."
        ) from exc

    try:
        if value.strip():
            keyring.set_password("aci-runtime", "deepseek-api-key", value.strip())
        else:
            try:
                keyring.delete_password("aci-runtime", "deepseek-api-key")
            except Exception:
                pass
    except Exception as exc:
        raise RuntimeError(
            "Could not access the operating-system keyring. Set DEEPSEEK_API_KEY in .env instead."
        ) from exc


class Settings:
    provider = os.getenv("ACI_PROVIDER", "ollama").strip().lower()
    ollama_url = os.getenv("ACI_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("ACI_MODEL", "llama3.2:3b")
    deepseek_base_url = os.getenv("ACI_DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    deepseek_model = os.getenv("ACI_DEEPSEEK_MODEL", "deepseek-flash")
    openai_base_url = os.getenv("ACI_OPENAI_BASE_URL", "").rstrip("/")
    openai_model = os.getenv("ACI_OPENAI_MODEL", "")
    try:
        import keyring
        openai_api_key = os.getenv("ACI_OPENAI_API_KEY", "").strip() or keyring.get_password("aci-runtime", "openai-compatible-api-key") or ""
    except Exception:
        openai_api_key = os.getenv("ACI_OPENAI_API_KEY", "").strip()
    comfyui_url = os.getenv("ACI_COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
    deepseek_api_key = (
        os.getenv("DEEPSEEK_API_KEY", "").strip()
        or os.getenv("ACI_DEEPSEEK_API_KEY", "").strip()
        or _read_keyring_secret()
    )
    data_dir = Path(os.getenv("ACI_DATA_DIR", "./data")).expanduser().resolve()
    workspace = Path(os.getenv("ACI_WORKSPACE", "./workspace")).expanduser().resolve()
    host = os.getenv("ACI_HOST", "127.0.0.1")
    api_token = os.getenv("ACI_API_TOKEN", "").strip()
    port = int(os.getenv("ACI_PORT", "8765"))
    max_context_messages = max(2, int(os.getenv("ACI_MAX_CONTEXT_MESSAGES", "12")))


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.workspace.mkdir(parents=True, exist_ok=True)
