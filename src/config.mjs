import fs from "node:fs";
import path from "node:path";

const DEFAULT_WS_URL = "wss://openws.work.weixin.qq.com";

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function integer(value, fallback, { min, max, name }) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function normalizeUserIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function assertDirectory(directory, name) {
  let stat;
  try {
    stat = fs.statSync(directory);
  } catch {
    throw new Error(`${name} does not exist: ${directory}`);
  }
  if (!stat.isDirectory()) throw new Error(`${name} is not a directory: ${directory}`);
}

export function loadConfig({
  configPath = process.env.WECOM_OPS_CONFIG || path.join(process.cwd(), "config.json"),
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const absoluteConfigPath = path.resolve(cwd, configPath);
  if (!fs.existsSync(absoluteConfigPath)) {
    throw new Error(`config file not found: ${absoluteConfigPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(absoluteConfigPath, "utf8").replace(/^\uFEFF/, ""));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("config.json must contain a JSON object");
  }
  if (raw.wecom?.secret || raw.wecom?.botId) {
    throw new Error("Do not store WeCom credentials in config.json; use environment variables");
  }

  const workdir = path.resolve(
    cwd,
    required(env.CODEX_WORKDIR || raw.codex?.workdir, "CODEX_WORKDIR or codex.workdir"),
  );
  assertDirectory(workdir, "Codex workdir");

  const envUsers = String(env.WECOM_ALLOWED_USER_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowedUserIds = [
    ...new Set([...normalizeUserIds(raw.security?.allowedUserIds), ...envUsers]),
  ];
  const requirePairing = raw.security?.requirePairing !== false;
  if (!allowedUserIds.length && !requirePairing) {
    throw new Error("Refusing an unauthenticated deployment: configure allowedUserIds or requirePairing");
  }

  const additionalWritableRoots = Array.isArray(raw.codex?.additionalWritableRoots)
    ? raw.codex.additionalWritableRoots.map((entry) => path.resolve(cwd, String(entry)))
    : [];
  for (const root of additionalWritableRoots) assertDirectory(root, "additional writable root");

  const stateDir = path.resolve(cwd, raw.stateDir || "data");
  const healthHost = String(raw.health?.host || "127.0.0.1");
  if (!["127.0.0.1", "::1", "localhost"].includes(healthHost)) {
    throw new Error("health.host must remain loopback-only");
  }

  return {
    configPath: absoluteConfigPath,
    wecom: {
      botId: required(env.WECOM_BOT_ID, "WECOM_BOT_ID"),
      secret: required(env.WECOM_BOT_SECRET, "WECOM_BOT_SECRET"),
      wsUrl: String(raw.wecom?.wsUrl || DEFAULT_WS_URL),
      ackTimeoutMs: integer(raw.wecom?.ackTimeoutMs, 15000, {
        min: 1000,
        max: 120000,
        name: "wecom.ackTimeoutMs",
      }),
    },
    codex: {
      executable: String(env.CODEX_EXE || raw.codex?.executable || "codex"),
      workdir,
      sandbox: String(raw.codex?.sandbox || "workspace-write"),
      approvalPolicy: String(raw.codex?.approvalPolicy || "never"),
      networkAccess: Boolean(raw.codex?.networkAccess),
      ignoreUserConfig: raw.codex?.ignoreUserConfig !== false,
      maxSeconds: integer(raw.codex?.maxSeconds, 300, {
        min: 10,
        max: 3600,
        name: "codex.maxSeconds",
      }),
      additionalWritableRoots,
      inheritedEnv: Array.isArray(raw.codex?.inheritedEnv)
        ? [...new Set(raw.codex.inheritedEnv.map((entry) => String(entry).trim()).filter(Boolean))]
        : [],
    },
    security: {
      allowedUserIds,
      requirePairing,
      maxQueue: integer(raw.security?.maxQueue, 3, {
        min: 0,
        max: 20,
        name: "security.maxQueue",
      }),
      maxPromptChars: integer(raw.security?.maxPromptChars, 12000, {
        min: 100,
        max: 100000,
        name: "security.maxPromptChars",
      }),
    },
    stateDir,
    health: {
      host: healthHost,
      port: integer(raw.health?.port, 8799, {
        min: 1,
        max: 65535,
        name: "health.port",
      }),
    },
  };
}

export function publicConfigSummary(config) {
  return {
    workdir: config.codex.workdir,
    sandbox: config.codex.sandbox,
    networkAccess: config.codex.networkAccess,
    requirePairing: config.security.requirePairing,
    allowedUserCount: config.security.allowedUserIds.length,
    maxQueue: config.security.maxQueue,
    maxSeconds: config.codex.maxSeconds,
  };
}
