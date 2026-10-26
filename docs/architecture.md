# Architecture

## Boundaries

The bridge is split into four trust boundaries:

1. **WeCom transport** receives callbacks and sends stream responses.
2. **Access control** decides whether a WeCom user may create a task.
3. **Task service** limits queue size, prompt size, and runtime.
4. **Codex runner** executes Codex with a scrubbed environment and sandbox.

The bridge never exposes an endpoint that executes arbitrary shell commands.
Codex remains responsible for tool selection inside its own sandbox.

## State

`data/state.json` stores only:

- paired operator user IDs
- an active pairing code and expiry
- per-conversation Codex thread IDs
- recent WeCom message IDs used for deduplication

It does not store prompts, secrets, or Codex output.

## Lifecycle

1. Load and validate `config.json`.
2. Read secrets from environment variables.
3. Load private state and create a pairing code when necessary.
4. Connect to the WeCom long-connection endpoint.
5. Dispatch text callbacks into a bounded queue.
6. Spawn Codex with JSONL output.
7. Store the returned thread ID and stream the final response.
8. Reconnect with exponential backoff on transport failure.

## Hardening choices

- `globalThis.WebSocket` from Node avoids a runtime dependency.
- The health endpoint is loopback-only and contains no secrets.
- Extra writable roots must be explicit directories.
- Network access inside the Codex sandbox is opt-in.
- User-level Codex config is ignored by default to avoid unexpected hooks or
  plugins.
