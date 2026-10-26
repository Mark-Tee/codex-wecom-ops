import assert from "node:assert/strict";
import test from "node:test";
import { stripMentions, truncateUtf8 } from "../src/task-service.mjs";

test("strips leading WeCom mentions", () => {
  assert.equal(stripMentions("@Codex  explain OSPF"), "explain OSPF");
  assert.equal(stripMentions("  @bot @helper task"), "task");
});

test("truncates UTF-8 output by byte length", () => {
  const result = truncateUtf8("你".repeat(100), 30);
  assert.ok(Buffer.byteLength(result, "utf8") <= 30);
  assert.match(result, /\[truncated\]$/);
});
