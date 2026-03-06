import type { JsonValue } from "@agenttape/core";

import type { DiffSeverity } from "./types.js";

const ORDER: Record<DiffSeverity, number> = {
  none: 0,
  minor: 1,
  major: 2,
  breaking: 3,
};

export function maxSeverity(left: DiffSeverity, right: DiffSeverity): DiffSeverity {
  return ORDER[left] >= ORDER[right] ? left : right;
}

export function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
  return `{${entries.join(",")}}`;
}

export function deepEqual(left: JsonValue, right: JsonValue): boolean {
  return stableStringify(left) === stableStringify(right);
}

export function asObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }
  return undefined;
}

export function asString(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export function asBoolean(value: JsonValue | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function asArray(value: JsonValue | undefined): JsonValue[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
