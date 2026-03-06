const ISO_8601_MILLIS_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export function nowIsoTimestamp(): string {
  return new Date().toISOString();
}

export function toIsoTimestamp(value: Date | number | string): string {
  if (typeof value === "string") {
    if (!isIsoTimestamp(value)) {
      throw new Error(`Invalid ISO timestamp string: ${value}`);
    }
    return value;
  }

  const date = typeof value === "number" ? new Date(value) : value;
  const iso = date.toISOString();

  if (!isIsoTimestamp(iso)) {
    throw new Error(`Unable to convert value to ISO timestamp: ${String(value)}`);
  }

  return iso;
}

export function isIsoTimestamp(value: string): boolean {
  if (!ISO_8601_MILLIS_UTC.test(value)) {
    return false;
  }

  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) {
    return false;
  }

  return new Date(epoch).toISOString() === value;
}

export function compareIsoTimestamps(left: string, right: string): number {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);

  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) {
    throw new Error("compareIsoTimestamps requires valid ISO timestamps");
  }

  if (leftMs < rightMs) {
    return -1;
  }
  if (leftMs > rightMs) {
    return 1;
  }
  return 0;
}
