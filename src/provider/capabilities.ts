import type { ProviderStatus } from "./types";

export type VisionSupportLevel = "supported" | "unsupported" | "unknown";

export interface ProviderCapabilities {
  vision: VisionSupportLevel;
  reason: string;
}

const KNOWN_VISION_MODEL_PATTERNS = [
  /gpt-4\.1/i,
  /gpt-4o/i,
  /o4/i,
  /claude-3/i,
  /claude-sonnet-4/i,
  /claude-opus-4/i,
  /qwen.*vl/i,
  /qvq/i,
  /llava/i,
  /minicpm-v/i,
  /internvl/i,
  /glm-4v/i,
  /gemma-3/i,
  /medgemma/i,
  /llama3\.2.*vision/i
];

const KNOWN_TEXT_ONLY_MODEL_PATTERNS = [
  /^llama3(\.|$)/i,
  /^llama3\.1/i,
  /^qwen\/qwen3/i,
  /^qwen3/i,
  /^deepseek/i
];

const OPENAI_COMPATIBLE_PROVIDER_TYPES = new Set([
  "openai",
  "lmstudio",
  "openai-compatible",
  "deepseek",
  "dashscope",
  "zhipu",
  "moonshot",
  "doubao",
  "siliconflow",
]);

export function detectProviderCapabilities(provider: ProviderStatus | null): ProviderCapabilities {
  if (!provider) {
    return {
      vision: "unknown",
      reason: "no active provider"
    };
  }

  const model = provider.model.trim();

  if (OPENAI_COMPATIBLE_PROVIDER_TYPES.has(provider.type)) {
    if (KNOWN_TEXT_ONLY_MODEL_PATTERNS.some((pattern) => pattern.test(model))) {
      return {
        vision: "unsupported",
        reason: "model name matches a text-only family"
      };
    }
    if (KNOWN_VISION_MODEL_PATTERNS.some((pattern) => pattern.test(model))) {
      return {
        vision: "supported",
        reason: "provider uses OpenAI-compatible image_url inputs and model name suggests vision support"
      };
    }
    return {
      vision: provider.type === "openai" ? "supported" : "unknown",
      reason:
        provider.type === "openai"
          ? "OpenAI chat/completions lane is configured for image_url inputs"
          : "OpenAI-compatible lane supports image_url inputs, but this model family is not classified yet"
    };
  }

  if (provider.type === "anthropic") {
    return {
      vision: "supported",
      reason: "Anthropic messages lane is configured for image content blocks"
    };
  }

  if (provider.type === "ollama") {
    if (KNOWN_VISION_MODEL_PATTERNS.some((pattern) => pattern.test(model))) {
      return {
        vision: "unknown",
        reason: "model name suggests vision support, but Ollama is still running in text-only fallback mode"
      };
    }

    return {
      vision: "unsupported",
      reason: "Ollama is currently wired as text-only in CodeClaw"
    };
  }

  return {
    vision: "unknown",
    reason: "provider capability is not classified"
  };
}
