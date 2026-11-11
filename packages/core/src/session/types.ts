import type { Entity } from "../Entity.ts";
import type { EntityConstructor, EntityManager } from "../EntityManager.ts";

export type SessionValue = null | boolean | number | string | SessionValue[] | { [key: string]: SessionValue };
export interface SessionRef {
  ref: string;
}

export type SessionCommand =
  | { op: "create"; type: string; key: string; values: Record<string, SessionValue> }
  | { op: "set"; target: SessionRef; values: Record<string, SessionValue> }
  | { op: "add" | "remove"; target: SessionRef; field: string; value: SessionRef }
  | { op: "delete"; target: SessionRef }
  | { op: "touch"; target: SessionRef };

export interface SessionSnapshot {
  ref: string;
  type: string;
  values: Record<string, SessionValue>;
}

export interface SessionError {
  ref?: string;
  field?: string;
  code?: string;
  message: string;
}

export interface SessionFieldChange {
  originalValue: SessionValue;
  newValue: SessionValue;
}

export interface SessionChange {
  ref: string;
  type: string;
  kind: "create" | "update" | "delete" | "touch";
  touched: boolean;
  fields: Record<string, SessionFieldChange>;
  /** ORM-maintained timestamp fields; dry runs leave existing versions unchanged. */
  timestampFields: string[];
  relationships: Record<string, { added: SessionValue[]; removed: SessionValue[] }>;
}

export type SessionValidation =
  | { status: "valid"; scope: "pre-write" | "full"; changes: SessionChange[] }
  | { status: "invalid"; errors: SessionError[] };

export type SessionReview =
  | { status: "valid"; reviewToken: string; revision: number; changes: SessionChange[] }
  | { status: "invalid"; errors: SessionError[] };

export interface SessionOptions<EM extends EntityManager> {
  /** Lazily supplies a fresh, empty writable application EM with its context and plugins for each execution. */
  createEm: () => EM | Promise<EM>;
  /** An explicit type allowlist; Session does not expose all globally registered metadata. */
  types: readonly EntityConstructor<Entity>[];
}

/** Private execution state; no entities or managers appear in Session's JSON results. */
export interface SessionExecution {
  em: EntityManager;
  entities: Map<string, Entity>;
  refs: Map<Entity, string>;
}
