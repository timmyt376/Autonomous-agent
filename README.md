# ACI — Autonomous Cognitive Intelligence

ACI is a local-first, cross-platform cognitive agent runtime. It combines an Ollama-compatible model interface, persistent SQLite memory, goal tracking, a browser dashboard, and an explicit permission boundary around tools.

> ACI models affect as an internal computational state. This is not evidence of consciousness or subjective feelings.

## Requirements
- Python 3.10+
- Ollama installed and running (optional for dashboard/memory features)
- A model pulled in Ollama, e.g. `ollama pull llama3.2:3b`

## Quick start

### Windows (PowerShell)
```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
Copy-Item .env.example .env
aci
```

### macOS / Linux
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
cp .env.example .env
aci
```

Open http://127.0.0.1:8765. Configure the Ollama model in Settings or in `.env`.

## Configuration
- `ACI_OLLAMA_URL`: default `http://127.0.0.1:11434`
- `ACI_MODEL`: default `llama3.2:3b`
- `ACI_DATA_DIR`: default `./data`
- `ACI_HOST`: default `127.0.0.1`
- `ACI_PORT`: default `8765`

## Safety model
ACI starts with a local-only bind address. Tools are allowlisted and file operations are restricted to its workspace. It does not execute shell commands, install software, access arbitrary paths, or make external network calls on its own. Keep the approval boundary enabled when adding new tools.

## Current scope
This is an early runnable foundation, not a self-improving AGI. Learning means storing and retrieving experiences and user-approved facts. Model fine-tuning, multi-agent collaboration, voice, and unrestricted computer control are intentionally out of scope until they can be implemented and tested safely.

## Development
```bash
python -m pytest
```

## License
MIT
