import type { EngineEvent } from "../agent/types";
import type { GatewayEventEnvelope, GatewayMessageRequest } from "./types";

export type CodeClawSdkErrorKind = "auth" | "not-found" | "server" | "network" | "unknown";

export class CodeClawSdkError extends Error {
  constructor(
    message: string,
    readonly kind: CodeClawSdkErrorKind,
    readonly status?: number
  ) {
    super(message);
    this.name = "CodeClawSdkError";
  }
}

export class CodeClawSdkClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authToken?: string
  ) {}

  async healthCheck(): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/health`, {
      headers: this.buildHeaders()
    });

    return response.ok;
  }

  async sendMessage(request: GatewayMessageRequest): Promise<{
    sessionId: string;
    traceId: string | null;
    channel: "http";
    messages: Array<{ id: string; role: string; text: string }>;
    pendingApproval: unknown;
  }> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw await buildSdkError(response, "Gateway request failed");
    }

    return (await response.json()) as {
      sessionId: string;
      traceId: string | null;
      channel: "http";
      messages: Array<{ id: string; role: string; text: string }>;
      pendingApproval: unknown;
    };
  }

  async *streamMessage(
    request: GatewayMessageRequest
  ): AsyncGenerator<GatewayEventEnvelope<EngineEvent>> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/json",
        accept: "text/event-stream"
      },
      body: JSON.stringify({
        ...request,
        stream: true
      })
    });

    if (!response.ok || !response.body) {
      throw await buildSdkError(response, "Gateway stream failed");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const line = chunk
          .split("\n")
          .find((entry) => entry.startsWith("data: "));
        if (!line) {
          continue;
        }

        yield JSON.parse(line.slice("data: ".length)) as GatewayEventEnvelope<EngineEvent>;
      }
    }
  }

  async interrupt(sessionId?: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/interrupt`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId
      })
    });

    if (!response.ok) {
      throw await buildSdkError(response, "Gateway interrupt failed");
    }
  }

  private buildHeaders(): Record<string, string> {
    return this.authToken
      ? {
          Authorization: `Bearer ${this.authToken}`
        }
      : {};
  }
}

async function buildSdkError(response: Response, prefix: string): Promise<CodeClawSdkError> {
  let detail = "";
  try {
    detail = await response.text();
  } catch {
    detail = "";
  }
  return new CodeClawSdkError(
    `${prefix} (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    classifyStatus(response.status),
    response.status
  );
}

function classifyStatus(status: number): CodeClawSdkErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not-found";
  if (status >= 500) return "server";
  return "unknown";
}
