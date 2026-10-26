import assert from "node:assert/strict";
import test from "node:test";
import { buildChildEnvironment, buildCodexArgs, parseCodexEvents } from "../src/codex-runner.mjs";

test("builds a sandboxed non-interactive Codex invocation", () => {
  const config = {
    codex: {
      workdir: "/safe/workspace",
      sandbox: "workspace-write",
      approvalPolicy: "never",
      networkAccess: false,
      ignoreUserConfig: true,
      additionalWritableRoots: [],
    },
  };
  const args = buildCodexArgs({ config, prompt: "hello" });
  assert.deepEqual(args.slice(0, 4), [
    "exec",
    "-C",
    "/safe/workspace",
    "--skip-git-repo-check",
  ]);
  assert.ok(args.includes("--ignore-user-config"));
  assert.ok(args.includes("--json"));
  assert.ok(args.includes('sandbox_mode="workspace-write"'));
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes("sandbox_workspace_write.network_access=false"));
  assert.ok(!args.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.equal(args.at(-1), "hello");
});

test("resumes a known thread", () => {
  const config = {
    codex: {
      workdir: "/safe/workspace",
      sandbox: "workspace-write",
      approvalPolicy: "never",
      networkAccess: false,
      ignoreUserConfig: false,
      additionalWritableRoots: [],
    },
  };
  const args = buildCodexArgs({ config, prompt: "continue", threadId: "thread-1" });
  assert.deepEqual(args.slice(0, 3), ["exec", "resume", "thread-1"]);
  assert.ok(!args.includes("--ignore-user-config"));
});

test("parses JSONL output", () => {
  const output = [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "done" },
    }),
  ].join("\n");
  assert.deepEqual(parseCodexEvents(output), {
    messages: ["done"],
    threadId: "thread-1",
  });
});

test("uses an environment allowlist and preserves explicit opt-ins", () => {
  const environment = buildChildEnvironment(
    {
      codex: {
        inheritedEnv: ["CUSTOM_TOOL_TOKEN"],
      },
    },
    {
      PATH: "/usr/bin",
      HOME: "/home/test",
      WECOM_BOT_SECRET: "must-not-leak",
      GITHUB_TOKEN: "must-not-leak",
      CUSTOM_TOOL_TOKEN: "explicitly-requested",
      UNRELATED_SECRET: "must-not-leak",
    },
    "linux",
  );
  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.HOME, "/home/test");
  assert.equal(environment.CUSTOM_TOOL_TOKEN, "explicitly-requested");
  assert.equal(environment.WECOM_BOT_SECRET, undefined);
  assert.equal(environment.GITHUB_TOKEN, undefined);
  assert.equal(environment.UNRELATED_SECRET, undefined);
});
