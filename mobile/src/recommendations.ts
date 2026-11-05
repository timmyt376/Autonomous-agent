import { Platform } from "react-native";

export type DeviceAdvice = {
  tier: "limited" | "moderate" | "capable" | "unknown";
  suggestedModels: string[];
  explanation: string;
};

export function getDeviceAdvice(totalMemoryBytes?: number): DeviceAdvice {
  if (!totalMemoryBytes || totalMemoryBytes <= 0) {
    return {
      tier: "unknown",
      suggestedModels: ["1B–2B Q4 GGUF"],
      explanation: "Device RAM is unavailable. Start with a small quantised model and monitor stability."
    };
  }
  const gb = totalMemoryBytes / 1024 ** 3;
  if (gb < 6) return {
    tier: "limited",
    suggestedModels: ["0.5B–1.5B Q4 GGUF"],
    explanation: "Reported RAM is limited. Leave memory for the operating system; larger models may be terminated."
  };
  if (gb < 8) return {
    tier: "moderate",
    suggestedModels: ["1B–2B Q4 GGUF", "3B Q3 GGUF (experimental)"],
    explanation: "Try a small Q4 model first. Actual free memory is lower than total installed RAM."
  };
  if (gb < 12) return {
    tier: "capable",
    suggestedModels: ["1B–3B Q4 GGUF", "3B–4B Q4 GGUF (check free RAM)"],
    explanation: "Several small models may work. Context size and GPU offload also consume memory."
  };
  return {
    tier: "capable",
    suggestedModels: ["3B–7B Q4 GGUF (check free RAM)", "1B–3B Q5 GGUF"],
    explanation: "Higher-memory device detected. Large models can still exceed available memory or throttle under sustained load."
  };
}

export function platformLabel(): string {
  return Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : Platform.OS;
}
