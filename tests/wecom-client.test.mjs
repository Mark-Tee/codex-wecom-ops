import assert from "node:assert/strict";
import test from "node:test";
import { WeComClient } from "../src/wecom-client.mjs";

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit("open", {});
    });
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  send(raw) {
    const frame = JSON.parse(raw);
    this.sent.push(frame);
    if (frame.cmd === "aibot_subscribe") {
      queueMicrotask(() => {
        this.emit("message", {
          data: JSON.stringify({ errcode: 0, errmsg: "ok" }),
        });
      });
    }
  }

  close() {
    this.readyState = 3;
    this.emit("close", { code: 1000 });
  }
}

test("authenticates on the first errcode=0 frame", async (t) => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => {
    globalThis.WebSocket = original;
    FakeWebSocket.instances.length = 0;
  });

  const client = new WeComClient({
    botId: "bot-id",
    secret: "bot-secret",
    wsUrl: "wss://example.invalid",
    ackTimeoutMs: 1000,
    logger: { error() {} },
  });
  await client.connect();
  assert.equal(client.authenticated, true);
  const subscribe = FakeWebSocket.instances[0].sent[0];
  assert.equal(subscribe.cmd, "aibot_subscribe");
  assert.deepEqual(subscribe.body, {
    bot_id: "bot-id",
    secret: "bot-secret",
  });
  client.close();
});
