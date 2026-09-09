import type { MaskingConfig } from "./config-loader.ts";

export interface StatusBarFormat {
  enabled?: string;
  disabled?: string;
}

export const DEFAULT_STATUS_BAR_FORMAT = {
  enabled: "🔒 Masking: {active} active / {configured} configured",
  disabled: "🔓 Masking: off · {active} rule(s) ready",
};

/** Validate each source before merging so invalid overrides preserve inherited values. */
export function parseStatusBarFormat(value: unknown, scope: string, warnings: string[]): StatusBarFormat {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    warnings.push(`${scope} options.statusBarFormat must be an object; ignored`);
    return {};
  }
  const result: StatusBarFormat = {};
  for (const key of ["enabled", "disabled"] as const) {
    const template = (value as Record<string, unknown>)[key];
    if (template === undefined) continue;
    if (typeof template !== "string" || /[\x00-\x1f\x7f-\x9f]/u.test(template)) {
      warnings.push(`${scope} options.statusBarFormat.${key} must be a single-line string without control characters; ignored`);
      continue;
    }
    result[key] = template;
  }
  return result;
}

/** Literal substitution only: unknown placeholders remain unchanged. */
export function statusLabel(cfg: MaskingConfig): string {
  const state = cfg.enabled ? "enabled" : "disabled";
  const template = cfg.options.statusBarFormat?.[state] ?? DEFAULT_STATUS_BAR_FORMAT[state];
  return template.replace(/\{(active|configured)\}/g, (_, key: string) =>
    String(key === "active" ? cfg.rules.length : cfg.configuredRules.length));
}
