# Mobile source

- `aci.ts`: OpenAI-compatible model discovery and chat transport.
- `storage.ts`: settings persistence and secure API-key storage.
- `types.ts`: shared mobile client types.

The mobile client talks directly to the selected model endpoint. A future ACI server integration can add a dedicated provider adapter without changing the chat screen.
