import { defaultRedactionOptions, type RedactOptions } from "@agenttape/core";

import type { RedactProfile } from "./types.js";

export function resolveRedactionProfile(profile: RedactProfile): RedactOptions | undefined {
  if (profile === "off") {
    return undefined;
  }

  if (profile === "default") {
    return defaultRedactionOptions();
  }

  const base = defaultRedactionOptions();
  return {
    ...base,
    rules: [
      ...base.rules,
      { key: "email" },
      { key: "phone" },
      { key: "ssn" },
      { pattern: "\\b[0-9]{3}-[0-9]{2}-[0-9]{4}\\b" },
      { pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}" },
    ],
  };
}
