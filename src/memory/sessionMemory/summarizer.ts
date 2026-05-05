/**
 * L2 Session Memory · 摘要器
 *
 * 接 LLM 把会话历史压缩成 ≤200 字的中文摘要，写入 memory_digest 表。
 *
 * 设计：
 *   - SummarizeInvoker 是依赖注入接口，便于测试用 mock 替换。
 *   - createProviderSummarizer 把 streamProviderResponse 包成 SummarizeInvoker。
 *   - summarizeSession 是主入口：拼 system prompt + 调 invoker + 构造 MemoryDigest
 *     （包含 ULID digestId、createdAt、tokenEstimate）。
 *   - LLM 失败时不抛——返回 fallback 摘要（"[LLM 摘要失败]" + 消息计数），
 *     让会话结束流程不被阻断。
 */

import { ulid } from "ulid";
import type { EngineMessage } from "../../agent/types";
import type { ChannelType } from "../../channels/channelAdapter";
import type { ProviderStatus } from "../../provider/types";
import { streamProviderResponse } from "../../provider/client";
import { stripThinking } from "../../lib/stripThinking";
import type { MemoryDigest } from "./store";

const SUMMARY_SYSTEM_PROMPT = `你是会话摘要器。把下面的多轮对话用 ≤200 字的中文摘要：
- 抓住关键事实、决策与未决事项
- 保留具体名词（命令名、文件路径、错误关键词、模块名）
- 用第三人称客观叙述，不要"用户说... 助手说..."
- 不加任何前缀（如"摘要："）；直接输出正文`;

const FALLBACK_SUMMARY_PREFIX = "[LLM 摘要失败]";

export type SummarizeInvoker = (
  messages: EngineMessage[],
  signal?: AbortSignal
) => Promise<string>;

export interface SummarizeMeta {
  sessionId: string;
  channel: ChannelType;
  userId: string;
}

/** 把多条消息拼成给 LLM 的"对话原文"段（去除 system 消息避免污染摘要）*/
function formatConversation(messages: EngineMessage[]): string {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      return `${role}: ${m.text.trim()}`;
    })
    .join("\n\n");
}

/** 粗略估 token：按字符数 / 2.5（中文混合英文的常见近似），最少 1。 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 2.5));
}

function sanitizeSummary(text: string): string {
  const stripped = stripThinking(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^(thinking process|self-correction|final check|output generation|character count check|check nouns)\b/i.test(line)) {
        return false;
      }
      if (/^(let'?s|i will|ready\.|done\.|proceeds\b)/i.test(line)) {
        return false;
      }
      return true;
    })
    .join("\n")
    .trim();

  const finalPolish = /final polish[:：]\s*([\s\S]+)$/i.exec(stripped);
  const candidate = (finalPolish?.[1] ?? stripped).replace(/\s+/g, " ").trim();
  return candidate.length > 260 ? `${candidate.slice(0, 260)}...` : candidate;
}

/**
 * 主入口：把会话压成 MemoryDigest（写库由调用方做）。
 * 空对话或 LLM 失败时返回 fallback digest，永不抛。
 */
export async function summarizeSession(
  invoker: SummarizeInvoker,
  messages: EngineMessage[],
  meta: SummarizeMeta,
  abortSignal?: AbortSignal
): Promise<MemoryDigest> {
  const conversation = formatConversation(messages);
  const messageCount = messages.filter((m) => m.role !== "system").length;
  const now = Date.now();
  const digestId = ulid();

  if (messageCount === 0 || !conversation.trim()) {
    return {
      digestId,
      sessionId: meta.sessionId,
      channel: meta.channel,
      userId: meta.userId,
      summary: `${FALLBACK_SUMMARY_PREFIX} (空对话)`,
      messageCount: 0,
      tokenEstimate: 0,
      createdAt: now,
    };
  }

  const llmMessages: EngineMessage[] = [
    {
      id: "summarize-system",
      role: "system",
      text: SUMMARY_SYSTEM_PROMPT,
      source: "model",
    },
    {
      id: "summarize-user",
      role: "user",
      text: conversation,
      source: "user",
    },
  ];

  let summary: string;
  try {
    summary = sanitizeSummary(await invoker(llmMessages, abortSignal));
    if (!summary) summary = `${FALLBACK_SUMMARY_PREFIX} (LLM 返回空)`;
  } catch (err) {
    summary = `${FALLBACK_SUMMARY_PREFIX} ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    digestId,
    sessionId: meta.sessionId,
    channel: meta.channel,
    userId: meta.userId,
    summary,
    messageCount,
    tokenEstimate: estimateTokens(summary),
    createdAt: now,
  };
}

/**
 * 把 streamProviderResponse 包装成 SummarizeInvoker。
 * 把流式 chunk 收集成完整字符串后返回。
 */
export function createProviderSummarizer(provider: ProviderStatus, fetchImpl?: typeof fetch): SummarizeInvoker {
  return async (messages, signal) => {
    let out = "";
    for await (const chunk of streamProviderResponse(provider, messages, {
      abortSignal: signal,
      ...(fetchImpl ? { fetchImpl } : {}),
    })) {
      out += chunk;
    }
    return out;
  };
}
