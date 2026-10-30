from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    ollama_url = os.getenv("ACI_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("ACI_MODEL", "llama3.2:3b")
    data_dir = Path(os.getenv("ACI_DATA_DIR", "./data")).expanduser().resolve()
    workspace = Path(os.getenv("ACI_WORKSPACE", "./workspace")).expanduser().resolve()
    host = os.getenv("ACI_HOST", "127.0.0.1")
    port = int(os.getenv("ACI_PORT", "8765"))
    max_context_messages = max(2, int(os.getenv("ACI_MAX_CONTEXT_MESSAGES", "12")))

settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.workspace.mkdir(parents=True, exist_ok=True)
