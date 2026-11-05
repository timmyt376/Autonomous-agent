# ACI — Autonomous Cognitive Intelligence

ACI is a local-first, cross-platform cognitive agent project. The repository contains a Python runtime for desktop/server use and a separate React Native mobile client.

> ACI models affect as an internal computational state. This is not evidence of consciousness or subjective feelings.

## Projects

- **Desktop/server runtime:** Python, FastAPI, SQLite memory, goal tracking, and an Ollama-compatible model connection.
- **Mobile client:** [mobile/](mobile/) — Android and iOS app built with Expo / React Native. It supports explicit device-local runtime and remote OpenAI-compatible API connection modes.

## Desktop/server quick start

Requirements: Python 3.10+ and (optionally) Ollama with a model such as `llama3.2:3b`.

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

Open http://127.0.0.1:8765.

## Mobile quick start

Requirements: Node.js 20.19+, Android Studio / Android SDK for Android builds, and Xcode on macOS for iOS builds.

```bash
cd mobile
npm install
npx expo prebuild
npx expo run:android
```

The mobile app uses native llama.cpp bindings and does not run in standard Expo Go. See [mobile/README.md](mobile/README.md) for iOS build steps and model connection setup.

**Mobile:** ACI Mobile supports local GGUF inference through llama.cpp, a downloaded-model library, persistent chat, OpenAI-compatible APIs, and direct ACI server connections with optional bearer-token authentication. See [mobile/README.md](mobile/README.md).

## Desktop configuration

- `ACI_OLLAMA_URL`: default `http://127.0.0.1:11434`
- `ACI_MODEL`: default `llama3.2:3b`
- `ACI_DATA_DIR`: default `./data`
- `ACI_HOST`: default `127.0.0.1`; set to `0.0.0.0` for LAN access
- `ACI_API_TOKEN`: optional bearer token required for `/api/*` when set
- `ACI_PORT`: default `8765`

## Safety and scope

The desktop runtime defaults to a loopback-only bind. The current foundation does not provide unrestricted shell execution or arbitrary filesystem control. Keep services private unless authentication and transport security are configured. For mobile LAN access, set a strong `ACI_API_TOKEN` before binding to `0.0.0.0`. This is an early agent foundation, not a self-improving AGI; learning currently means storing and retrieving experiences and user-approved facts.

## Development

Desktop tests:
```bash
python -m pytest
```

Mobile type check:
```bash
cd mobile
npm install
npm run typecheck
```

## License

MIT
