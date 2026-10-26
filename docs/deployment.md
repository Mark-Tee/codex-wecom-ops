# Deployment

## Linux with systemd

Run the bridge as a dedicated non-root user.

```ini
[Unit]
Description=Codex WeCom Ops
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=codex
WorkingDirectory=/opt/codex-wecom-ops
EnvironmentFile=/etc/codex-wecom-ops.env
ExecStart=/usr/bin/node src/main.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/opt/codex-wecom-ops/data /path/to/workspace

[Install]
WantedBy=multi-user.target
```

The environment file must be root-readable only and should contain
`WECOM_BOT_ID` and `WECOM_BOT_SECRET`.

## Windows Task Scheduler

Create a task that runs:

```text
node --env-file=C:\path\to\codex-wecom-ops\.env src/main.mjs
```

Set the working directory to the repository root. Run under a dedicated
non-administrator account, not SYSTEM.

## Reverse proxies

No reverse proxy is required. The bridge connects outbound to WeCom. The local
health endpoint should remain bound to loopback and must not be exposed to the
internet.
