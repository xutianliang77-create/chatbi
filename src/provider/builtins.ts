import type { ProviderDefinition } from "./types";

export const BUILTIN_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    type: "anthropic",
    displayName: "Anthropic",
    kind: "cloud",
    requiresApiKey: true,
    envVars: ["CODECLAW_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-6",
    defaultTimeoutMs: 30_000
  },
  {
    type: "openai",
    displayName: "OpenAI",
    kind: "cloud",
    requiresApiKey: true,
    envVars: ["CODECLAW_OPENAI_API_KEY", "OPENAI_API_KEY"],
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    defaultTimeoutMs: 30_000
  },
  {
    type: "ollama",
    displayName: "Ollama",
    kind: "local",
    requiresApiKey: false,
    envVars: ["CODECLAW_OLLAMA_API_KEY", "OLLAMA_API_KEY"],
    defaultBaseUrl: "http://127.0.0.1:11434",
    defaultModel: "llama3.1",
    defaultTimeoutMs: 60_000
  },
  {
    type: "lmstudio",
    displayName: "LM Studio",
    kind: "local",
    requiresApiKey: false,
    envVars: ["CODECLAW_LMSTUDIO_API_KEY", "LMSTUDIO_API_KEY"],
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    defaultTimeoutMs: 60_000
  },
  {
    type: "openai-compatible",
    displayName: "OpenAI Compatible",
    kind: "cloud",
    requiresApiKey: true,
    envVars: ["CODECLAW_OPENAI_COMPATIBLE_API_KEY", "OPENAI_COMPATIBLE_API_KEY"],
    defaultBaseUrl: "https://api.example.com/v1",
    defaultModel: "model-id",
    defaultTimeoutMs: 60_000
  },
  {
    type: "deepseek",
    displayName: "DeepSeek",
    kind: "cloud",
    requiresApiKey: true,
    envVars: ["CODECLAW_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"],
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    defaultTimeoutMs: 60_000
  },
  {
    type: "dashscope",
    displayName: "DashScope",
    kind: "cloud",
    requiresApiKey: true,
    envVars: ["CODECLAW_DASHSCOPE_API_KEY", "DASHSCOPE_API_KEY"],
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    defaultTimeoutMs: 60_000
  },
  {
    type: "zhipu",
    displayName: "Zhipu",
    kind: "cloud",
    requiresApiKey: true,
    envVars: ["CODECLAW_ZHIPU_API_KEY", "ZHIPUAI_API_KEY", "BIGMODEL_API_KEY"],
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4.7",
    defaultTimeoutMs: 60_000
  },
  {
    type: "moonshot",
    displayName: "Moonshot/Kimi",
    kind: "cloud",
    requiresApiKey: true,
    envVars: ["CODECLAW_MOONSHOT_API_KEY", "MOONSHOT_API_KEY"],
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k2",
    defaultTimeoutMs: 60_000
  },
  {
    type: "doubao",
    displayName: "Doubao/Ark",
    kind: "cloud",
    requiresApiKey: true,
    envVars: ["CODECLAW_DOUBAO_API_KEY", "ARK_API_KEY", "VOLCENGINE_API_KEY"],
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-1-6",
    defaultTimeoutMs: 60_000
  },
  {
    type: "siliconflow",
    displayName: "SiliconFlow",
    kind: "cloud",
    requiresApiKey: true,
    envVars: ["CODECLAW_SILICONFLOW_API_KEY", "SILICONFLOW_API_KEY"],
    defaultBaseUrl: "https://api.siliconflow.com/v1",
    defaultModel: "Qwen/Qwen3-Coder",
    defaultTimeoutMs: 60_000
  }
];
