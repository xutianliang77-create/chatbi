export type NotificationEventType =
  | "task_completed"
  | "approval_required"
  | "context_budget_exceeded"
  | "provider_cooldown"
  | "report_ready"
  | "cron_failed";

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  "task_completed",
  "approval_required",
  "context_budget_exceeded",
  "provider_cooldown",
  "report_ready",
  "cron_failed",
];

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export type NotificationAdapterKind = "auto" | "macos" | "terminal" | "none";

export interface NotificationQuietHours {
  enabled?: boolean;
  /** HH:mm, local time. */
  start: string;
  /** HH:mm, local time. */
  end: string;
}

export interface NotificationSettings {
  enabled?: boolean;
  adapter?: NotificationAdapterKind;
  failuresOnly?: boolean;
  events?: Partial<Record<NotificationEventType, boolean>>;
  quietHours?: NotificationQuietHours;
}

export interface NotificationEvent {
  id?: string;
  type: NotificationEventType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  sessionId?: string;
  workspace?: string;
  resourceId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationHistoryEntry extends Required<Pick<NotificationEvent, "type" | "title" | "message" | "createdAt">> {
  id: string;
  severity: NotificationSeverity;
  delivered: boolean;
  suppressed: boolean;
  adapter: NotificationAdapterKind;
  reason?: string;
  sessionId?: string;
  workspace?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationAdapter {
  kind: NotificationAdapterKind;
  send(event: NotificationHistoryEntry): Promise<void> | void;
}
