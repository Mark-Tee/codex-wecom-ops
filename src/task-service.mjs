import fs from "node:fs";
import path from "node:path";
import { AccessControl } from "./access-control.mjs";
import { requestId } from "./wecom-client.mjs";

const MAX_REPLY_BYTES = 18_000;
const SEEN_MESSAGE_LIMIT = 500;

export function stripMentions(text) {
  return String(text || "")
    .replace(/^(?:\s*@\S+\s*)+/u, "")
    .trim();
}

export function truncateUtf8(text, maxBytes = MAX_REPLY_BYTES) {
  const source = String(text || "");
  const buffer = Buffer.from(source, "utf8");
  if (buffer.length <= maxBytes) return source;
  const marker = "\n\n[truncated]";
  const available = Math.max(0, maxBytes - Buffer.byteLength(marker, "utf8"));
  let output = "";
  let used = 0;
  for (const character of source) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (used + bytes > available) break;
    output += character;
    used += bytes;
  }
  return `${output}${marker}`;
}

function userContext(body) {
  return {
    userId: String(body?.from?.userid || ""),
    chatId: String(body?.chatid || body?.from?.userid || "unknown"),
    chatType: body?.chattype === "group" ? 2 : 1,
  };
}

export class TaskService {
  constructor({ config, client, runner, stateStore, logger }) {
    this.config = config;
    this.client = client;
    this.runner = runner;
    this.stateStore = stateStore;
    this.logger = logger;
    this.state = stateStore.load();
    this.queue = [];
    this.running = false;
    this.startedAt = Date.now();
    this.currentTaskStartedAt = 0;
    this.access = new AccessControl({
      state: this.state,
      allowedUserIds: config.security.allowedUserIds,
      requirePairing: config.security.requirePairing,
      onStateChange: () => this.stateStore.save(this.state),
    });
  }

  initialize() {
    const code = this.access.ensurePairingCode();
    if (code) {
      const file = this.stateStore.writePrivateFile(
        "pairing-code.txt",
        `Pairing code: ${code}\nExpires in 10 minutes.\nSend: /pair ${code}\n`,
      );
      this.logger.info(`Pairing code written to ${file}`);
    }
  }

  async handleFrame(frame) {
    if (frame?.cmd !== "aibot_msg_callback") return;
    const body = frame.body || {};
    if (body.msgtype !== "text") {
      await this.client.replyText(frame, "This version accepts text messages only.");
      return;
    }
    if (!body.msgid || this.#seen(body.msgid)) return;
    await this.#handleText(frame, body);
  }

  async #handleText(frame, body) {
    const { userId, chatId, chatType } = userContext(body);
    const prompt = stripMentions(body?.text?.content);
    if (!prompt) {
      await this.client.replyText(frame, "Usage: @bot <task>");
      return;
    }
    if (prompt.length > this.config.security.maxPromptChars) {
      await this.client.replyText(
        frame,
        `Prompt is too long. Limit: ${this.config.security.maxPromptChars} characters.`,
      );
      return;
    }

    if (prompt === "/help" || prompt === "帮助") {
      await this.client.replyText(frame, this.#helpText());
      return;
    }
    if (prompt.startsWith("/pair")) {
      await this.#pair(frame, userId, prompt);
      return;
    }
    if (!this.access.isAuthorized(userId)) {
      await this.client.replyText(
        frame,
        "This user is not paired. Read data/pairing-code.txt on the host, then send /pair <code>.",
      );
      return;
    }

    if (prompt === "/status") {
      await this.client.replyText(frame, this.#statusText());
      return;
    }
    if (prompt === "/new") {
      delete this.state.threads?.[chatId];
      this.stateStore.save(this.state);
      await this.client.replyText(frame, "Started a fresh Codex thread for this conversation.");
      return;
    }
    if (prompt === "/stop") {
      this.runner.stop();
      this.queue.length = 0;
      await this.client.replyText(frame, "Stopped the active task and cleared the queue.");
      return;
    }
    if (prompt === "/invite") {
      const code = this.access.createInvite();
      this.stateStore.writePrivateFile(
        "pairing-code.txt",
        `Pairing code: ${code}\nExpires in 10 minutes.\nSend: /pair ${code}\n`,
      );
      await this.client.replyText(frame, "Created a new 10-minute pairing code on the host.");
      return;
    }

    if (this.running && this.queue.length >= this.config.security.maxQueue) {
      await this.client.replyText(frame, "The task queue is full. Try again later.");
      return;
    }

    this.queue.push({ frame, prompt, chatId, chatType, userId });
    if (this.running) {
      await this.client.replyText(
        frame,
        `Queued. ${this.queue.length} task(s) waiting before yours.`,
      );
      return;
    }
    await this.#drain();
  }

  async #pair(frame, userId, prompt) {
    const code = prompt.split(/\s+/)[1] || "";
    if (!this.access.pair(userId, code)) {
      await this.client.replyText(frame, "Pairing code is invalid or expired.");
      return;
    }
    try {
      fs.rmSync(path.join(this.config.stateDir, "pairing-code.txt"), { force: true });
    } catch {}
    await this.client.replyText(frame, "Pairing complete. You can now submit Codex tasks.");
  }

  async #drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const task = this.queue.shift();
        try {
          await this.#process(task);
        } catch (error) {
          this.logger.error("Task failed", error);
          await this.client
            .replyText(task.frame, `Task failed: ${error.message}`)
            .catch(() => {});
        }
      }
    } finally {
      this.running = false;
    }
  }

  async #process(task) {
    const streamId = requestId("stream");
    const started = Date.now();
    this.currentTaskStartedAt = started;
    const progress = setInterval(() => {
      const seconds = Math.round((Date.now() - started) / 1000);
      this.client
        .replyStream(task.frame, streamId, `Working... ${seconds}s elapsed.`, false)
        .catch(() => {});
    }, 25_000);
    try {
      this.state.threads ||= {};
      const knownThread = this.state.threads[task.chatId] || "";
      await this.client.replyStream(
        task.frame,
        streamId,
        knownThread ? "Continuing this conversation..." : "Codex is starting a new task...",
        false,
      );
      const result = await this.runner.run({ prompt: task.prompt, threadId: knownThread });
      if (result.threadId) {
        this.state.threads[task.chatId] = result.threadId;
        this.stateStore.save(this.state);
      }
      const heading = result.ok ? "Codex finished" : "Codex failed";
      await this.client.replyStream(
        task.frame,
        streamId,
        truncateUtf8(
          `${heading}\nDuration: ${result.seconds}s\n\n${result.text || "(no output)"}`,
        ),
        true,
      );
    } finally {
      clearInterval(progress);
      this.currentTaskStartedAt = 0;
    }
  }

  #seen(messageId) {
    this.state.seenMessageIds ||= [];
    if (this.state.seenMessageIds.includes(messageId)) return true;
    this.state.seenMessageIds.push(messageId);
    if (this.state.seenMessageIds.length > SEEN_MESSAGE_LIMIT) {
      this.state.seenMessageIds = this.state.seenMessageIds.slice(-SEEN_MESSAGE_LIMIT);
    }
    this.stateStore.save(this.state);
    return false;
  }

  #statusText() {
    const uptime = Math.round((Date.now() - this.startedAt) / 1000);
    const current = this.currentTaskStartedAt
      ? `running ${Math.round((Date.now() - this.currentTaskStartedAt) / 1000)}s`
      : "idle";
    return [
      `Connection: ${this.client.authenticated ? "authenticated" : "not authenticated"}`,
      `Uptime: ${uptime}s`,
      `Queue: ${this.queue.length}`,
      `Current task: ${current}`,
    ].join("\n");
  }

  #helpText() {
    return [
      "@bot <task>: run a Codex task in the configured workspace",
      "/pair <code>: pair this WeCom user",
      "/invite: create a new pairing code on the host",
      "/new: start a fresh Codex thread for this conversation",
      "/status: show connection, queue, and task state",
      "/stop: stop the current task and clear the queue",
      "/help: show this help",
      "Only text messages are accepted. New commands must also be documented in README.md.",
    ].join("\n");
  }
}
