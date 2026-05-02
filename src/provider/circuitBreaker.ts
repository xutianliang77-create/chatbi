import type { ProviderStatus } from "./types";

const DEFAULT_MAX_CONCURRENCY = 2;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_STUCK_THRESHOLD = 2;

function readPositiveInt(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    process.stderr.write(`[provider-circuit] invalid ${name}=${raw}; using ${fallback}\n`);
    return fallback;
  }
  return fallback;
}

export function getProviderMaxConcurrency(): number {
  return readPositiveInt(
    ["CHATBI_PROVIDER_MAX_CONCURRENCY", "CODECLAW_PROVIDER_MAX_CONCURRENCY"],
    DEFAULT_MAX_CONCURRENCY
  );
}

export function getProviderCooldownMs(): number {
  return readPositiveInt(
    ["CHATBI_PROVIDER_COOLDOWN_MS", "CODECLAW_PROVIDER_COOLDOWN_MS"],
    DEFAULT_COOLDOWN_MS
  );
}

export function getProviderStuckThreshold(): number {
  return readPositiveInt(
    ["CHATBI_PROVIDER_STUCK_THRESHOLD", "CODECLAW_PROVIDER_STUCK_THRESHOLD"],
    DEFAULT_STUCK_THRESHOLD
  );
}

export class ProviderCircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderCircuitOpenError";
  }
}

export type ProviderCircuitOutcome = "success" | "failure" | "stuck";

export interface ProviderCircuitToken {
  key: string;
  providerLabel: string;
  acquiredAt: number;
}

export interface ProviderCircuitSnapshot {
  key: string;
  providerLabel: string;
  running: number;
  stuckCount: number;
  cooldownUntil: number;
  lastReason?: string;
}

interface ProviderCircuitState {
  providerLabel: string;
  running: number;
  stuckCount: number;
  cooldownUntil: number;
  lastReason?: string;
}

export class ProviderCircuitBreaker {
  private readonly states = new Map<string, ProviderCircuitState>();

  constructor(
    private readonly opts: {
      maxConcurrency?: number;
      cooldownMs?: number;
      stuckThreshold?: number;
      now?: () => number;
    } = {}
  ) {}

  acquire(provider: ProviderStatus): ProviderCircuitToken {
    const key = providerCircuitKey(provider);
    const state = this.getState(provider);
    const now = this.now();
    if (state.cooldownUntil > now) {
      throw new ProviderCircuitOpenError(
        `provider ${state.providerLabel} is cooling down for ${state.cooldownUntil - now}ms: ${state.lastReason ?? "circuit open"}`
      );
    }
    if (state.running >= this.maxConcurrency()) {
      throw new ProviderCircuitOpenError(
        `provider ${state.providerLabel} concurrency limit reached (${state.running}/${this.maxConcurrency()})`
      );
    }
    state.running += 1;
    return { key, providerLabel: state.providerLabel, acquiredAt: now };
  }

  release(token: ProviderCircuitToken, outcome: ProviderCircuitOutcome, reason?: string): void {
    const state = this.states.get(token.key);
    if (!state) return;
    state.running = Math.max(0, state.running - 1);
    if (outcome === "success") {
      state.stuckCount = 0;
      state.lastReason = undefined;
      return;
    }
    if (outcome === "stuck") {
      this.markStuckByKey(token.key, reason ?? "provider task stuck");
    }
  }

  markStuck(provider: ProviderStatus, reason: string): void {
    const key = providerCircuitKey(provider);
    this.getState(provider);
    this.markStuckByKey(key, reason);
  }

  reset(): void {
    this.states.clear();
  }

  snapshot(): ProviderCircuitSnapshot[] {
    return [...this.states.entries()].map(([key, state]) => ({
      key,
      providerLabel: state.providerLabel,
      running: state.running,
      stuckCount: state.stuckCount,
      cooldownUntil: state.cooldownUntil,
      ...(state.lastReason ? { lastReason: state.lastReason } : {}),
    }));
  }

  private markStuckByKey(key: string, reason: string): void {
    const state = this.states.get(key);
    if (!state) return;
    state.stuckCount += 1;
    state.lastReason = reason;
    if (state.stuckCount >= this.stuckThreshold()) {
      state.cooldownUntil = this.now() + this.cooldownMs();
    }
  }

  private getState(provider: ProviderStatus): ProviderCircuitState {
    const key = providerCircuitKey(provider);
    const existing = this.states.get(key);
    if (existing) return existing;
    const next: ProviderCircuitState = {
      providerLabel: provider.displayName || provider.instanceId || provider.type,
      running: 0,
      stuckCount: 0,
      cooldownUntil: 0,
    };
    this.states.set(key, next);
    return next;
  }

  private maxConcurrency(): number {
    return this.opts.maxConcurrency ?? getProviderMaxConcurrency();
  }

  private cooldownMs(): number {
    return this.opts.cooldownMs ?? getProviderCooldownMs();
  }

  private stuckThreshold(): number {
    return this.opts.stuckThreshold ?? getProviderStuckThreshold();
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }
}

export function providerCircuitKey(provider: ProviderStatus): string {
  return [
    provider.instanceId || provider.type,
    provider.type,
    provider.baseUrl.replace(/\/+$/, ""),
    provider.model,
  ].join("|");
}

const GLOBAL_PROVIDER_CIRCUIT_BREAKER = new ProviderCircuitBreaker();

export function getGlobalProviderCircuitBreaker(): ProviderCircuitBreaker {
  return GLOBAL_PROVIDER_CIRCUIT_BREAKER;
}

export function isProviderStuckError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Stream idle timeout|Stream buffer exceeded|assistant output exceeded|provider task stuck/i.test(message);
}
