# WeCom Long-Connection Notes

This document records the protocol behavior used by `codex-wecom-ops`. WeCom may
change its protocol; verify against the current official WeCom documentation
before deploying a fork.

## Endpoint

```text
wss://openws.work.weixin.qq.com
```

## Frames used

Subscribe:

```json
{
  "cmd": "aibot_subscribe",
  "headers": { "req_id": "subscribe_..." },
  "body": {
    "bot_id": "<BotID>",
    "secret": "<long-connection secret>"
  }
}
```

Incoming message callback:

```text
cmd = aibot_msg_callback
body.msgid
body.from.userid
body.chatid
body.chattype
body.msgtype = text
body.text.content
```

Streaming response:

```json
{
  "cmd": "aibot_respond_msg",
  "headers": { "req_id": "<source request id>" },
  "body": {
    "msgtype": "stream",
    "stream": {
      "id": "stream_...",
      "finish": false,
      "content": "Working..."
    }
  }
}
```

Heartbeat every 30 seconds:

```json
{
  "cmd": "ping",
  "headers": { "req_id": "ping_..." }
}
```

## Operational limits

- Only text messages are handled in version 0.1.
- One task runs at a time; additional tasks enter a bounded queue.
- The long connection must be re-established after transport failure.
- Do not log subscription bodies because they contain the robot secret.
