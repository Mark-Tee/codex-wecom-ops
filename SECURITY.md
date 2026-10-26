# Security Policy

## Threat model

This bridge converts chat messages into local Codex tasks. A malicious or
compromised WeCom account with authorization can ask Codex to inspect or modify
the configured workspace. Treat pairing with the same care as SSH access.

## Required deployment practices

1. Run the bridge under a dedicated low-privilege OS account.
2. Point `codex.workdir` at a dedicated, backed-up workspace.
3. Keep sandbox network access disabled unless a task explicitly requires it.
4. Do not run the bridge as Administrator or root.
5. Do not commit `config.json`, `.env`, `data/`, or logs.
6. Keep `WECOM_BOT_SECRET` in the process environment or an OS secret store.
7. Limit the robot to the intended WeCom groups and users.
8. Review Codex hooks, plugins, MCP servers, and global instructions before
   enabling them with `codex.ignoreUserConfig=false`.

## Sensitive environment variables

The Codex child process receives only a small allowlist of runtime variables
needed to locate the OS, home directory, temporary files, and certificates.
The bridge always removes these variables before spawning Codex:

- `WECOM_BOT_ID`
- `WECOM_BOT_SECRET`
- `GITHUB_TOKEN`
- `GH_TOKEN`
- `TENCENT_DOCS_TOKEN`

Do not add secrets to `config.json`.

If a deployment truly requires an additional environment variable, list its
name in `codex.inheritedEnv`. Any inherited secret becomes readable by commands
run inside the Codex sandbox, so this should be exceptional.

## Reporting a vulnerability

Use GitHub's private security advisory feature for this repository. Do not open
a public issue containing live credentials, chat IDs, workspace paths, or logs
that include user content.

## Supported versions

Security fixes are applied to the latest `main` branch and latest release.
