# ACI Mobile

Cross-platform Expo / React Native client for the ACI project. It is a separate mobile application and does not replace the Python ACI runtime.

## Features in this first mobile client

- Android and iOS app shell with a mobile chat interface.
- Two explicit connection modes: device-local runtime and remote API.
- OpenAI-compatible `/v1/models` discovery and `/v1/chat/completions` chat requests.
- Model selection, connection testing, and persistent conversation settings.
- API keys stored with the platform secure-storage facility.
- Device model and reported memory shown as advisory compatibility information.
- No silent cloud fallback when device mode is selected.

## Run it

Install Node.js 20.19+ and the Expo tooling, then:

```bash
cd mobile
npm install
npx expo start
```

Use Expo Go for development where supported, or build a native app with an EAS development/production build. For a local Android build, configure the Android toolchain and run `npx expo run:android`.

## Connecting models

### On-device inference

This app's device mode is an adapter to an OpenAI-compatible HTTP endpoint. To perform actual inference on the phone, an on-device runtime must be installed or bundled into a native build and expose that endpoint on the device (the default is `http://127.0.0.1:8080/v1`). A llama.cpp-based Android/iOS runtime is one possible implementation.

The current Expo client does **not** bundle model weights or a native inference engine. It does not claim that merely selecting device mode makes inference local. The endpoint must really be hosted on the phone. Runtime packaging, model download/licensing, hardware delegate selection, and native lifecycle integration are follow-on work.

A runtime hosted on a different computer is LAN inference, not on-device inference. Use that computer's reachable LAN URL.

### API mode

Set the provider's OpenAI-compatible base URL, model ID, and API key. API mode sends prompts to that configured provider. The app does not proxy API traffic through the ACI desktop server.

## Compatibility

The app displays OS, device model, and reported memory when available. These are hints, not guarantees. Real compatibility depends on model architecture, quantisation, context length, RAM available to the app, NPU/GPU support, runtime build, battery and thermal constraints.

## Security notes

- API keys are stored using Expo SecureStore.
- Local endpoints should remain bound to the device or trusted LAN.
- Do not expose an unauthenticated model endpoint to the public internet.
- Only use endpoints you trust. HTTP may be appropriate for loopback; use HTTPS for remote APIs.
