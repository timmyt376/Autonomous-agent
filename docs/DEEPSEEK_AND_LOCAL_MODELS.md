# DeepSeek and local model setup

## DeepSeek API

ACI supports the official DeepSeek OpenAI-compatible chat-completions API.

- API base URL: https://api.deepseek.com
- Default model: deepseek-flash
- Stronger reasoning model: deepseek-v4-pro
- Chat endpoint: /chat/completions
- Authentication: Authorization: Bearer YOUR_KEY

### Desktop / PC

1. Start ACI and open its local web interface.
2. Open the provider section and select DeepSeek API.
3. Paste your API key and save it. On supported desktop installations ACI stores it in the operating-system credential store through Python keyring.
4. Select deepseek-flash or deepseek-v4-pro and activate the provider.

If the operating-system keyring is unavailable, put DEEPSEEK_API_KEY=your-key in the local .env file and restart ACI. Never commit a real key to Git or place it in a source file.

You can also configure ACI_PROVIDER=deepseek, ACI_DEEPSEEK_MODEL=deepseek-flash and DEEPSEEK_API_KEY in .env.

### Android / iOS

1. Open Connection.
2. Choose API mode.
3. Set the base URL to https://api.deepseek.com.
4. Set the model to deepseek-flash or deepseek-v4-pro.
5. Paste the DeepSeek API key and connect.

The mobile app stores the API key with Expo SecureStore. The app knows the current DeepSeek model IDs and does not depend on a provider-specific model-list endpoint.

DeepSeek API usage is billed by DeepSeek. ACI does not include API credit.

## Local models on mobile

The mobile app includes an in-app GGUF model manager powered by llama.cpp through llama.rn.

- Search the Hugging Face catalogue for GGUF repositories.
- Inspect GGUF files and approximate sizes.
- Download models into the app's private storage.
- Load, unload and delete downloaded models.
- Run inference on-device without sending prompts to a hosted model provider.

A native development or production build is required; Expo Go cannot load the llama.cpp native module. Model size, context length, available RAM, GPU backend and device thermals determine whether a model will run.

## Local models on PC

The desktop ACI interface includes a local model manager that controls the Ollama runtime.

- Search the built-in model catalogue.
- Pull/download a model from the Ollama registry.
- View download progress.
- List installed models.
- Select a model for local inference.
- Delete models to reclaim disk space.

Install and start Ollama once on the PC. ACI communicates with its local API at http://127.0.0.1:11434 by default. The model discovery, download, selection and deletion workflow is available inside the ACI interface.

## Security

- Keep ACI bound to 127.0.0.1 unless LAN access is required.
- Set ACI_API_TOKEN before binding to a LAN interface.
- Do not expose the unauthenticated runtime to the public internet.
- DeepSeek requests send conversation content to DeepSeek; local model requests stay on the local inference backend.
