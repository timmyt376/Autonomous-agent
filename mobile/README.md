# ACI Mobile

Cross-platform Expo / React Native client for the ACI project. It is a separate mobile application and does not replace the Python ACI runtime.

## Features

- Android and iOS app with a mobile chat interface.
- **True on-device inference:** GGUF models run in the app process using llama.cpp via `llama.rn` (Metal on supported iPhones/iPads; CPU and supported GPU acceleration on Android).
- Download a GGUF model from a direct URL into private app storage, then load it locally.
- Remote API mode using OpenAI-compatible `/v1/models` and `/v1/chat/completions`.
- Explicit mode selection. No silent cloud fallback.
- API keys stored using the platform secure-storage facility.
- Device model and reported memory shown as advisory compatibility information.

## Run it

Requirements: Node.js 20.19+, Android Studio / Android SDK for Android builds, and Xcode on macOS for iOS builds.

```bash
cd mobile
npm install
npx expo prebuild
npx expo run:android
```

For iOS on macOS:

```bash
cd mobile
npm install
npx expo prebuild
npx pod-install
npx expo run:ios
```

This app includes native modules and **will not run in standard Expo Go**. Use a development build or native build. The `llama.rn` dependency downloads native llama.cpp artifacts during installation.

## On-device models

1. Choose **On this device** in Connection settings.
2. Paste a direct download URL to a compatible `.gguf` model file.
3. Tap **Download & load on this phone**.
4. Wait for model initialisation, then return to Chat.

Use quantised GGUF models intended for mobile devices. A 1B–3B Q4 model is a reasonable starting point for many modern phones, but there is no universal minimum: actual support depends on free RAM, model architecture, context size, operating system memory limits, CPU/GPU backend, and thermal throttling. Large models can make the app crash or the phone terminate it. The initial implementation uses a 2048-token context and requests GPU offload where supported.

Models are downloaded to the app's private document storage. The current version does not yet provide a model catalogue, download progress UI, model deletion UI, or automatic RAM-based model recommendations. Only download models from sources you trust and check their licences.

The native runtime is based on [llama.rn](https://github.com/mybigday/llama.rn), a React Native binding for llama.cpp. Its Android GPU/NPU acceleration support varies by device; CPU fallback is available on supported architectures.

## API mode

Set the provider's OpenAI-compatible base URL, model ID, and API key. API mode sends prompts to that configured provider. The app does not proxy API traffic through the ACI desktop server.

## Remote ACI server

The current API mode can connect to an OpenAI-compatible endpoint. The Python ACI server currently exposes its own native `/api/chat` API rather than the OpenAI-compatible routes, so direct ACI server integration needs a dedicated adapter in a later update.

## Security

- API keys are stored using Expo SecureStore.
- Device mode performs model inference locally after downloading the GGUF file.
- API mode sends conversation content to the configured provider.
- Use HTTPS for remote API endpoints and do not expose unauthenticated model services to the public internet.
