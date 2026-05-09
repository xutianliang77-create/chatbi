import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_PAIRING_TTL_MS = 10 * 60 * 1000;
const MAX_PAIRING_TTL_MS = 30 * 60 * 1000;
const MIN_PAIRING_TTL_MS = 60 * 1000;

export interface MobilePairingToken {
  id: string;
  tokenHash: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  deviceId?: string;
}

export interface MobileDevice {
  id: string;
  label: string;
  platform?: string;
  tokenHash: string;
  pairedAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}

interface MobileStoreFile {
  pairingTokens: MobilePairingToken[];
  devices: MobileDevice[];
}

export interface CreatePairingTokenResult {
  token: string;
  tokenId: string;
  label: string;
  expiresAt: string;
  ttlMs: number;
}

export type PairDeviceResult =
  | { ok: true; device: Omit<MobileDevice, "tokenHash">; deviceToken: string }
  | { ok: false; reason: "invalid_token" | "expired_token" | "used_token" };

export function defaultMobileStorePath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".codeclaw", "mobile", "devices.json");
}

export class MobileCompanionStore {
  constructor(
    private readonly options: {
      filePath?: string;
      now?: () => Date;
    } = {}
  ) {}

  async createPairingToken(input: { label?: string; ttlMs?: number } = {}): Promise<CreatePairingTokenResult> {
    const data = await this.load();
    const now = this.now();
    const ttlMs = clampTtl(input.ttlMs ?? DEFAULT_PAIRING_TTL_MS);
    const token = `ccm_${randomBytes(18).toString("base64url")}`;
    const entry: MobilePairingToken = {
      id: `pair-${randomBytes(8).toString("hex")}`,
      tokenHash: hashSecret(token),
      label: sanitizeLabel(input.label, "Mobile device"),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    data.pairingTokens.push(entry);
    await this.save(data);
    return {
      token,
      tokenId: entry.id,
      label: entry.label,
      expiresAt: entry.expiresAt,
      ttlMs,
    };
  }

  async pairDevice(input: { token: string; label?: string; platform?: string }): Promise<PairDeviceResult> {
    const data = await this.load();
    const now = this.now();
    const tokenHash = hashSecret(input.token);
    const pairing = data.pairingTokens.find((entry) => entry.tokenHash === tokenHash);
    if (!pairing) return { ok: false, reason: "invalid_token" };
    if (pairing.usedAt) return { ok: false, reason: "used_token" };
    if (Date.parse(pairing.expiresAt) <= now.getTime()) return { ok: false, reason: "expired_token" };

    const deviceToken = `cmd_${randomBytes(24).toString("base64url")}`;
    const device: MobileDevice = {
      id: `dev-${randomBytes(8).toString("hex")}`,
      label: sanitizeLabel(input.label, pairing.label),
      ...(input.platform ? { platform: sanitizeLabel(input.platform, "unknown") } : {}),
      tokenHash: hashSecret(deviceToken),
      pairedAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    };
    pairing.usedAt = now.toISOString();
    pairing.deviceId = device.id;
    data.devices.push(device);
    await this.save(data);
    return { ok: true, device: publicDevice(device), deviceToken };
  }

  async listDevices(options: { includeRevoked?: boolean } = {}): Promise<Array<Omit<MobileDevice, "tokenHash">>> {
    const data = await this.load();
    return data.devices
      .filter((device) => options.includeRevoked || !device.revokedAt)
      .map(publicDevice);
  }

  async revokeDevice(deviceId: string): Promise<boolean> {
    const data = await this.load();
    const device = data.devices.find((entry) => entry.id === deviceId);
    if (!device) return false;
    if (!device.revokedAt) device.revokedAt = this.now().toISOString();
    await this.save(data);
    return true;
  }

  async authenticateDevice(deviceToken: string): Promise<Omit<MobileDevice, "tokenHash"> | null> {
    const data = await this.load();
    const tokenHash = hashSecret(deviceToken);
    const device = data.devices.find((entry) => entry.tokenHash === tokenHash && !entry.revokedAt);
    if (!device) return null;
    device.lastSeenAt = this.now().toISOString();
    await this.save(data);
    return publicDevice(device);
  }

  private filePath(): string {
    return this.options.filePath ?? defaultMobileStorePath();
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private async load(): Promise<MobileStoreFile> {
    try {
      const raw = JSON.parse(await readFile(this.filePath(), "utf8")) as Partial<MobileStoreFile>;
      return {
        pairingTokens: Array.isArray(raw.pairingTokens) ? raw.pairingTokens : [],
        devices: Array.isArray(raw.devices) ? raw.devices : [],
      };
    } catch {
      return { pairingTokens: [], devices: [] };
    }
  }

  private async save(data: MobileStoreFile): Promise<void> {
    const filePath = this.filePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, filePath);
  }
}

function publicDevice(device: MobileDevice): Omit<MobileDevice, "tokenHash"> {
  const { tokenHash: _tokenHash, ...rest } = device;
  return rest;
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeLabel(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim();
  return (trimmed || fallback).slice(0, 80);
}

function clampTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs)) return DEFAULT_PAIRING_TTL_MS;
  return Math.max(MIN_PAIRING_TTL_MS, Math.min(Math.floor(ttlMs), MAX_PAIRING_TTL_MS));
}
