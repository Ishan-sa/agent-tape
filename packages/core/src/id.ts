import { randomUUID } from "node:crypto";

function normalizePrefix(prefix: string): string {
  return prefix.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function generateId(prefix = "evt"): string {
  return `${normalizePrefix(prefix)}_${randomUUID()}`;
}

export function generateRunId(prefix = "run"): string {
  return generateId(prefix);
}
