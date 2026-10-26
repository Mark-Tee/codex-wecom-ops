# Contributing

Contributions are welcome when they preserve the project's trust boundary.

## Before opening a pull request

1. Run:

   ```powershell
   npm test
   npm run check
   ```

2. Do not add real Bot IDs, secrets, user IDs, chat IDs, workspace paths, logs,
   screenshots, or company data.
3. New commands and triggers must update both `README.md` and the `/help`
   response.
4. Add tests for access control, queue limits, configuration validation, and
   Codex argument construction when behavior changes.
5. Keep the runtime dependency-free unless a dependency removes substantial
   complexity and has a compatible license.

## Scope

In scope:

- WeCom long-connection protocol handling
- safe Codex execution
- access control and pairing
- task queues and conversation continuity
- health, diagnostics, and packaging

Out of scope:

- hidden credential collection
- bypassing sandbox or approval systems
- unrestricted shell endpoints
- bulk scraping or spam automation
- exposing a public relay without authentication
