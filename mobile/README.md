# ACI Mobile

Cross-platform Expo / React Native companion app for the ACI desktop/server runtime.

## What it does

- Android and iOS chat client with persistent local conversation history.
- **On-device inference:** llama.cpp via llama.rn; compatible GGUF models execute on the phone.
- Download progress, installed-model library, load and delete controls.
- Device RAM-based starting recommendations (advisory only).
- OpenAI-compatible API mode for hosted or LAN inference endpoints.
- Direct ACI server mode for the Python runtime: chat, memory notes and goals.
- API credentials stored in Expo SecureStore.
- No silent fallback between local and remote providers.

## Build requirements

- Node.js 20.19+
- Android Studio and Android SDK for Android builds.
- macOS and Xcode for iOS builds.
- Native build required; **Expo Go is not supported** because llama.cpp is a native module.

    cd mobile
    npm install
    npx expo prebuild
    npx expo run:android

iOS (on macOS):

    cd mobile
    npm install
    npx expo prebuild
    npx pod-install
    npx expo run:ios

For a distributable Android build, use an EAS or local Gradle release build after configuring Android signing credentials. For iOS distribution, configure Apple signing and provisioning.

## On-device models

1. Open **Connection** and choose **On device**.
2. Paste a direct HTTPS URL ending in a compatible .gguf file.
3. Tap **Download & load on this phone** and watch the progress indicator.
4. Use the **Models** tab to load a previously downloaded model or delete it.

The app uses a 2048-token context and requests GPU layer offload; actual acceleration depends on device support and native backend. llama.rn supports Metal on iOS and CPU plus selected Android GPU/NPU backends; Android acceleration is device-dependent and some backends are experimental.

The app shows rough model-size guidance based on total reported device RAM. It cannot know how much memory is currently free, and Android/iOS may terminate an app that exceeds memory limits. Start with a small quantised model, close other demanding apps, and increase model size cautiously. Model compatibility also depends on architecture, tokenizer, quantisation, context size, and thermal throttling.

Models are stored in the app's private document directory. Removing the app removes those files. Only download models from sources you trust and check model licences. The app does not ship model weights.

## OpenAI-compatible API mode

Enter the provider's base URL (the URL before /models), model ID and optional API key. The app uses /models and /chat/completions. Prompts are sent to that provider.

## Connect to your ACI desktop/server

1. On the computer running ACI, set ACI_HOST=0.0.0.0 in its .env file so it listens on the LAN.
2. Set a strong random ACI_API_TOKEN in the same .env file.
3. Restart ACI.
4. Find the computer's private LAN IP address.
5. In the app choose **ACI server**, enter http://COMPUTER-LAN-IP:8765, and enter the same bearer token.
6. Test the connection.

The token protects all /api/* routes using Bearer authentication. Keep the service on a trusted private network or put it behind a properly configured HTTPS reverse proxy. Do not port-forward the service to the public internet. If you do not set a token, the server retains its original unauthenticated API behaviour; keep its default loopback binding in that case.

ACI server mode sends each new user message to the server's /api/chat endpoint. The server owns its model context and persistent memory. Mobile conversation history is also saved locally for display, but that local transcript is not replayed into the server.

## Privacy

- On-device mode: after the model download, inference runs locally and chat prompts are not sent to a model API.
- API mode: prompts are sent to the provider configured by the user.
- ACI server mode: prompts are sent to the user's configured ACI server.
- API credentials are stored using platform secure storage.
- Chat transcripts are stored in app-private storage.

## Troubleshooting

- **Native module missing:** run npx expo prebuild and rebuild the native app; Expo Go cannot load llama.cpp.
- **Model won't load:** check that the URL points to a complete GGUF file, free phone storage/RAM, and model architecture support.
- **API connection fails:** verify the base URL, provider model ID, API key, and OpenAI-compatible endpoint support.
- **ACI server unreachable:** verify both devices are on the same network, use the computer's LAN IP (not 127.0.0.1), confirm ACI_HOST=0.0.0.0, allow the port through the computer firewall, and check the bearer token.
