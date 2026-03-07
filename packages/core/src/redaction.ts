import type {
  JsonArray,
  JsonObject,
  JsonValue,
  RedactOptions,
  RedactProfile,
  RedactResult,
  RedactionRecord,
  RedactionRule,
} from "./types.js";

const DEFAULT_REPLACEMENT = "[REDACTED]";

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRegex(pattern: string | RegExp): RegExp {
  return typeof pattern === "string" ? new RegExp(pattern, "g") : pattern;
}

function normalizePath(path: string): string[] {
  return path.split(".").filter((part) => part.length > 0);
}

function pathMatches(rulePath: string, currentPath: string[]): boolean {
  const ruleParts = normalizePath(rulePath);
  if (ruleParts.length !== currentPath.length) {
    return false;
  }

  for (let i = 0; i < ruleParts.length; i += 1) {
    const rulePart = ruleParts[i];
    const currentPart = currentPath[i];
    if (rulePart !== "*" && rulePart !== currentPart) {
      return false;
    }
  }

  return true;
}

function keyMatches(ruleKey: string, currentKey: string, caseInsensitive: boolean): boolean {
  return caseInsensitive
    ? ruleKey.toLowerCase() === currentKey.toLowerCase()
    : ruleKey === currentKey;
}

function ruleReplacement(rule: RedactionRule, options: RedactOptions): string {
  return rule.replacement ?? options.defaultReplacement ?? DEFAULT_REPLACEMENT;
}

function applyPatternRules(
  value: string,
  rules: RedactionRule[],
  path: string,
  records: RedactionRecord[],
  options: RedactOptions,
): string {
  let result = value;

  for (const rule of rules) {
    if (!rule.pattern) {
      continue;
    }

    const regex = toRegex(rule.pattern);
    if (!regex.global) {
      const withGlobal = new RegExp(regex.source, `${regex.flags}g`);
      result = result.replace(withGlobal, () => {
        records.push({ path, rule: "pattern" });
        return ruleReplacement(rule, options);
      });
      continue;
    }

    result = result.replace(regex, () => {
      records.push({ path, rule: "pattern" });
      return ruleReplacement(rule, options);
    });
  }

  return result;
}

function redactInternal(
  value: JsonValue,
  options: RedactOptions,
  path: string[],
  records: RedactionRecord[],
): JsonValue {
  if (typeof value === "string") {
    return applyPatternRules(value, options.rules, path.join("."), records, options);
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      redactInternal(entry, options, [...path, String(index)], records),
    ) as JsonArray;
  }

  if (isObject(value)) {
    const output: JsonObject = {};

    for (const [key, entry] of Object.entries(value)) {
      const nextPath = [...path, key];
      const dotPath = nextPath.join(".");

      const pathRule = options.rules.find((rule) => rule.path && pathMatches(rule.path, nextPath));
      if (pathRule) {
        output[key] = ruleReplacement(pathRule, options);
        records.push({ path: dotPath, rule: "path", key });
        continue;
      }

      const keyRule = options.rules.find(
        (rule) =>
          rule.key &&
          keyMatches(rule.key, key, options.caseInsensitiveKeys ?? true),
      );

      if (keyRule) {
        output[key] = ruleReplacement(keyRule, options);
        records.push({ path: dotPath, rule: "key", key });
        continue;
      }

      output[key] = redactInternal(entry, options, nextPath, records);
    }

    return output;
  }

  return value;
}

export function redactValue<T extends JsonValue>(value: T, options: RedactOptions): RedactResult<T> {
  if (!Array.isArray(options.rules) || options.rules.length === 0) {
    throw new Error("redactValue requires at least one redaction rule");
  }

  const records: RedactionRecord[] = [];
  const redacted = redactInternal(value, options, [], records) as T;

  return {
    value: redacted,
    records,
  };
}

export function defaultRedactionOptions(): RedactOptions {
  return {
    defaultReplacement: DEFAULT_REPLACEMENT,
    caseInsensitiveKeys: true,
    rules: [
      { key: "authorization" },
      { key: "apiKey" },
      { key: "password" },
      { key: "token" },
      { pattern: "sk-[A-Za-z0-9]{16,}" },
      { pattern: "Bearer\\s+[A-Za-z0-9._-]+" },
    ],
  };
}

export function resolveRedactionProfile(profile: RedactProfile): RedactOptions | undefined {
  if (profile === "off") return undefined;
  if (profile === "default") return defaultRedactionOptions();
  // strict: adds PII patterns on top of default
  const base = defaultRedactionOptions();
  return {
    ...base,
    rules: [
      ...base.rules,
      { key: "email" },
      { key: "phone" },
      { pattern: "\\b[0-9]{3}-[0-9]{2}-[0-9]{4}\\b" },
      { pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}" },
    ],
  };
}
