# ACI first-run identity harness

ACI now has a first-run identity bootstrap shared by the desktop runtime and mobile client.

## Lifecycle

1. Select/configure the inference provider (Ollama, DeepSeek, another OpenAI-compatible API, or mobile GGUF).
2. Run the identity harness before normal chat.
3. Send the foundational ACI design context to the selected model and ask it to return a structured identity profile.
4. Validate the response, persist the profile and first thought, and use the profile as part of future cognition prompts.
5. Keep chat unavailable until the profile exists.

The profile includes a model-chosen name, pronunciation, short description, personality traits, values, interests, preferences, communication style, strengths, growth areas, curiosities, first thought, self-description and an avatar-generation prompt.

## Desktop / server

The desktop UI exposes **First-run identity harness**. The API is:

- `GET /api/identity` — retrieve the persistent profile.
- `POST /api/harness/initialize` — create the profile with optional `seed_context`.

The profile is stored in the existing SQLite state table. The server refuses normal `/api/chat` requests until the harness has completed.

## Mobile

The mobile app gates its Chat tab until an identity exists. It can bootstrap through the ACI server, a configured OpenAI-compatible API, or an already-loaded on-device GGUF model. Mobile identity profiles are saved in app storage and included in later local/API system prompts. When using an ACI server, the server's own SQLite profile is authoritative.

## Profile picture

The model creates a detailed `avatar_prompt` as part of its identity. This patch prepares the prompt and records the avatar state as `prompt_ready`; it does not claim an image was rendered. A dedicated image-generation provider (local diffusion or a compatible image API) still needs to be configured to turn that prompt into a PNG/JPEG.

## Important distinction

This is an initial computational self-model, not proof of consciousness or subjective feelings. Its profile is a starting point that future learning and memory systems can revise.
