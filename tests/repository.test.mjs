import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("public repository contains the required governance files", () => {
  for (const relative of [
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "skills/ticket-to-report/SKILL.md",
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, relative)), relative);
  }
});

test("README documents every bridge command", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  for (const command of ["/help", "/pair", "/invite", "/new", "/status", "/stop"]) {
    assert.match(readme, new RegExp(command.replace("/", "\\/")));
  }
});
