import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export function requestId(prefix = "req") {
  return `${prefix}_${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export class WeComClient extends EventEmitter {
  #socket = null;
  #waiters = new Map();
  #heartbeat = null;
  #manualClose = false;
  #authenticated = false;
  #closePromise = null;

  constructor({ botId, secret, wsUrl, ackTimeoutMs, logger }) {
    super();
    this.botId = botId;
    this.secret = secret;
    this.wsUrl = wsUrl;
    this.ackTimeoutMs = ackTimeoutMs;
    this.logger = logger;
  }

  get authenticated() {
    return this.#authenticated;
  }

  async connect() {
    if (typeof globalThis.WebSocket !== "function") {
      throw new Error("Node.js 22 or newer is required for built-in WebSocket support");
    }
    this.#manualClose = false;
    const socket = new globalThis.WebSocket(this.wsUrl);
    this.#socket = socket;

    this.#closePromise = new Promise((resolve) => {
      socket.addEventListener("close", (event) => {
        this.#authenticated = false;
        this.#stopHeartbeat();
        this.#rejectWaiters(new Error("WeCom WebSocket closed"));
        this.emit("disconnect", event);
        resolve();
      });
    });

    const connected = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        this.off("authenticated", onAuthenticated);
        this.off("auth-error", onAuthError);
        handler(value);
      };
      const onAuthenticated = () => finish(resolve);
      const onAuthError = (error) => finish(reject, error);
      this.once("authenticated", onAuthenticated);
      this.once("auth-error", onAuthError);

      socket.addEventListener("error", () => {
        finish(reject, new Error("WeCom WebSocket error"));
      });
      socket.addEventListener("close", () => {
        finish(reject, new Error("WeCom WebSocket closed before authentication"));
      });
      socket.addEventListener("open", () => {
        try {
          socket.send(JSON.stringify({
            cmd: "aibot_subscribe",
            headers: { req_id: requestId("subscribe") },
            body: {
              bot_id: this.botId,
              secret: this.secret,
            },
          }));
        } catch (error) {
          finish(reject, error);
          try {
            socket.close();
          } catch {}
        }
      });
      socket.addEventListener("message", (event) => {
        const raw = typeof event.data === "string" ? event.data : String(event.data);
        this.#handleFrame(raw);
      });
    });

    await connected;
  }

  async waitForClose() {
    if (this.#closePromise) await this.#closePromise;
  }

  async sendCommand(command, body, id = requestId(command)) {
    if (!this.#socket || this.#socket.readyState !== 1) {
      throw new Error("WeCom WebSocket is not open");
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters.delete(id);
        reject(new Error(`WeCom acknowledgement timed out: ${command}`));
      }, this.ackTimeoutMs);
      this.#waiters.set(id, { resolve, reject, timer });
      const frame = { cmd: command, headers: { req_id: id } };
      if (body !== undefined) frame.body = body;
      try {
        this.#socket.send(JSON.stringify(frame));
      } catch (error) {
        clearTimeout(timer);
        this.#waiters.delete(id);
        reject(error);
      }
    });
  }

  async replyStream(sourceFrame, streamId, content, finish) {
    return this.sendCommand(
      "aibot_respond_msg",
      {
        msgtype: "stream",
        stream: {
          id: streamId,
          finish: Boolean(finish),
          content: String(content || ""),
        },
      },
      sourceFrame?.headers?.req_id,
    );
  }

  async replyText(sourceFrame, content) {
    return this.replyStream(sourceFrame, requestId("stream"), content, true);
  }

  close() {
    this.#manualClose = true;
    this.#stopHeartbeat();
    try {
      this.#socket?.close();
    } catch {}
  }

  #handleFrame(raw) {
    let frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      this.logger.error("Ignored a malformed WeCom frame");
      return;
    }
    const id = frame?.headers?.req_id;
    const waiter = id ? this.#waiters.get(id) : null;
    if (waiter) {
      clearTimeout(waiter.timer);
      this.#waiters.delete(id);
      if (frame.errcode && frame.errcode !== 0) {
        waiter.reject(new Error(`WeCom errcode ${frame.errcode}: ${frame.errmsg || ""}`));
      } else {
        waiter.resolve(frame);
      }
      return;
    }
    if (!this.#authenticated && frame.errcode !== undefined) {
      if (frame.errcode === 0) {
        this.#authenticated = true;
        this.#startHeartbeat();
        this.emit("authenticated");
      } else {
        const error = new Error(`WeCom authentication failed: ${frame.errmsg || frame.errcode}`);
        this.emit("auth-error", error);
        try {
          this.#socket?.close();
        } catch {}
      }
      return;
    }
    if (frame.errcode && frame.errcode !== 0) {
      this.logger.error(`WeCom protocol error ${frame.errcode}: ${frame.errmsg || ""}`);
      return;
    }
    this.emit("frame", frame);
  }

  #startHeartbeat() {
    this.#stopHeartbeat();
    this.#heartbeat = setInterval(() => {
      if (!this.#authenticated || this.#socket?.readyState !== 1) return;
      this.sendCommand("ping").catch((error) => {
        this.logger.error("WeCom heartbeat failed", error);
      });
    }, 30_000);
  }

  #stopHeartbeat() {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
  }

  #rejectWaiters(error) {
    for (const waiter of this.#waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.#waiters.clear();
  }
}
