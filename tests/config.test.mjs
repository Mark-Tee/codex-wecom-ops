import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";

function makeWorkspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-wecom-ops-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  return { root, workspace };
}

function writeConfig(root, overrides = {}) {
  const config = {
    codex: {
      workdir: path.join(root, "workspace"),
      maxSeconds: 120,
      networkAccess: false,
      ignoreUserConfig: true,
    },
    security: {
      allowedUserIds: [],
      requirePairing: true,
      maxQueue: 2,
      maxPromptChars: 2000,
    },
    stateDir: "./data",
    health: { host: "127.0.0.1", port: 8799 },
    ...overrides,
  };
  const configPath = path.join(root, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config));
  return configPath;
}

test("loads environment credentials without persisting them", (t) => {
  const { root } = makeWorkspace(t);
  const configPath = writeConfig(root);
  const config = loadConfig({
    configPath,
    cwd: root,
    env: {
      WECOM_BOT_ID: "bot-id",
      WECOM_BOT_SECRET: "bot-secret",
      WECOM_ALLOWED_USER_IDS: "u1,u2",
    },
  });
  assert.equal(config.wecom.botId, "bot-id");
  assert.equal(config.wecom.secret, "bot-secret");
  assert.deepEqual(config.security.allowedUserIds, ["u1", "u2"]);
  assert.equal(config.codex.networkAccess, false);
});

test("rejects credentials stored in config.json", (t) => {
  const { root } = makeWorkspace(t);
  const configPath = writeConfig(root, {
    wecom: { botId: "unsafe", secret: "unsafe" },
  });
  assert.throws(
    () =>
      loadConfig({
        configPath,
        cwd: root,
        env: { WECOM_BOT_ID: "bot-id", WECOM_BOT_SECRET: "secret" },
      }),
    /environment variables/,
  );
});

test("rejects an unauthenticated deployment", (t) => {
  const { root } = makeWorkspace(t);
  const configPath = writeConfig(root, {
    security: { allowedUserIds: [], requirePairing: false },
  });
  assert.throws(
    () =>
      loadConfig({
        configPath,
        cwd: root,
        env: { WECOM_BOT_ID: "bot-id", WECOM_BOT_SECRET: "secret" },
      }),
    /unauthenticated/,
  );
});
