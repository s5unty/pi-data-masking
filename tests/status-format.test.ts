import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfigFromPaths, type MaskingConfig } from "../config-loader.ts";
import { statusLabel, parseStatusBarFormat } from "../status-format.ts";

const config: MaskingConfig = {
  enabled: true, rules: [], configuredRules: [],
  options: { caseSensitive: true, showStatusBar: true, systemPromptGuidance: false, persistHistory: true },
};

test("status templates preserve defaults and substitute only known variables", () => {
  assert.equal(statusLabel(config), "🔒 Masking: 0 active / 0 configured");
  assert.equal(statusLabel({ ...config, enabled: false }), "🔓 Masking: off · 0 rule(s) ready");
  const custom = { ...config, options: { ...config.options, statusBarFormat: {
    enabled: "🔒 {active}/{configured} {active} {unknown}", disabled: "🔓 off",
  } } };
  assert.equal(statusLabel(custom), "🔒 0/0 0 {unknown}");
  assert.equal(statusLabel({ ...custom, enabled: false }), "🔓 off");
  custom.options.statusBarFormat.enabled = "";
  assert.equal(statusLabel(custom), "");
});

test("invalid templates are ignored with warnings", () => {
  for (const value of [null, [], "text", 7, { enabled: 42 }, { disabled: "two\nlines" }, { enabled: "\x1b[31m" }]) {
    const warnings: string[] = [];
    assert.deepEqual(parseStatusBarFormat(value, "project", warnings), {});
    assert.equal(warnings.length, 1);
  }
});

test("JSON file templates merge per state and reload with accurate rule counts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "masking-status-"));
  try {
    const globalPath = join(dir, "global.json");
    const projectPath = join(dir, "project.json");
    writeFileSync(globalPath, JSON.stringify({
      rules: [{ id: "one", real: "secret-value" }, { id: "two", real: "disabled-secret", enabled: false }],
      options: { statusBarFormat: { enabled: "global {active}/{configured}", disabled: "global off" } },
    }));
    writeFileSync(projectPath, JSON.stringify({ options: { statusBarFormat: { enabled: "project {active}/{configured}" } } }));
    const key = Buffer.alloc(32, 1);
    const first = await loadConfigFromPaths(globalPath, projectPath, key);
    assert.deepEqual(first.warnings, []);
    assert.equal(statusLabel(first.config), "project 1/2");
    assert.equal(statusLabel({ ...first.config, enabled: false }), "global off");
    writeFileSync(projectPath, JSON.stringify({ options: { statusBarFormat: { enabled: 42 } } }));
    const invalid = await loadConfigFromPaths(globalPath, projectPath, key);
    assert.equal(statusLabel(invalid.config), "global 1/2");
    assert.ok(invalid.warnings.some(w => w.includes("statusBarFormat.enabled")));
    writeFileSync(projectPath, JSON.stringify({ options: { statusBarFormat: { disabled: "changed off" } } }));
    const reloaded = await loadConfigFromPaths(globalPath, projectPath, key);
    assert.equal(statusLabel(reloaded.config), "global 1/2");
    assert.equal(statusLabel({ ...reloaded.config, enabled: false }), "changed off");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
