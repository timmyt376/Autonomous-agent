# Device, local model and media integrations

## First-run provider selection

Both clients begin with an explicit setup choice: API or local models.

- API: DeepSeek or any OpenAI-compatible endpoint, model ID and optional key.
- PC local: detect Ollama, inspect RAM and NVIDIA VRAM, and recommend an Ollama model. On Windows, a user click can launch the official Ollama package through winget. The user completes any installer prompts.
- Mobile local: the initial automatic choice is Qwen3 0.6B Q4 GGUF downloaded into app-private storage and loaded with llama.cpp. Alternatively connect to a local OpenAI-compatible endpoint such as an Ollama server.
- Text and image models are independent. The text model may be local or hosted; ComfyUI is a separate image-generation backend.

## PC workspace tools

The Python runtime exposes a restricted workspace under ACI_WORKSPACE:

- GET /api/device/files?path=...
- POST /api/device/files/read with a relative path
- POST /api/device/files/write with a relative path and content
- POST /api/device/files/ai-edit with a relative path and instruction

The AI edit route returns a draft only. The desktop UI requires a separate save action. Paths are resolved under the workspace, traversal outside it is rejected, and UTF-8 text editing is capped at 1 MB. This is deliberately not arbitrary whole-disk access or unrestricted shell execution.

## Mobile phone files and media

Android users can grant a folder through the system Storage Access Framework. The app uses that grant to list the selected folder, read and edit UTF-8 text files, and create new text files. The AI can prepare a revised draft using the selected phone text model or API; the user reviews and explicitly saves it. Camera and photo gallery are opened only after a user action.

iOS and Android sandbox rules remain in force. The app does not have unrestricted access to other apps' private data, does not bypass permission prompts, and does not provide covert screen capture or accessibility-based remote control.

## ComfyUI image generation

Service detection checks Ollama's /api/tags and ComfyUI's /system_stats. Image generation uses ComfyUI's local HTTP API:

- POST /prompt with the API-format workflow
- GET /history/{prompt_id} to poll completion
- GET /view to retrieve generated images

In a workflow JSON, use the literal placeholders {{PROMPT}} and {{NEGATIVE_PROMPT}} in the corresponding text input values. The workflow must be exported in ComfyUI's API format, and all checkpoints, LoRAs, custom nodes and other workflow dependencies must already be installed in ComfyUI. ACI does not guess or download multi-gigabyte diffusion weights automatically.

PC ComfyUI installation is linked to the official desktop installer. The app detects an existing ComfyUI server but does not perform a blind cross-platform install of GPU-specific PyTorch/CUDA dependencies.

## Security notes

- The desktop API should remain loopback-only unless ACI_API_TOKEN and trusted HTTPS/LAN networking are configured.
- ACI workspace access is restricted to the configured workspace root.
- Mobile file access is scoped to a folder explicitly selected by the user.
- API keys are stored using the OS keyring on PC where available and Expo SecureStore on mobile.
- User-selected local and custom endpoints should be trusted. Do not expose unauthenticated services to the public internet.
