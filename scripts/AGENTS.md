# Scripts — AGENTS.md

Rules for AI agents working in the `scripts/` directory.

## Overview

Operational and dev-tooling scripts. **All new scripts must be TypeScript** run via `bun`.

## Scripting Rules

- **Standalone scripts**: every operational script in `scripts/` must be directly runnable as its own entrypoint and must not depend on application/package implementation files. The only local-code exception is importing helper or utility modules from `scripts/lib/`.
- **Shebang**: start every `.ts` file with `#!/usr/bin/env bun`
- **Runtime**: Bun — use `node:*` built-ins, never install third-party CLI libs (e.g., `commander`, `yargs`). Use `node:util parseArgs` for argument parsing.
- **Imports**: use `node:` prefix for all Node built-ins (e.g., `node:fs`, `node:path`)
- **Shared code**: put reusable helpers and utilities in `scripts/lib/` — operational scripts import from there. Organize `./lib/` files by domain (e.g., `dockerhub.ts` for Docker Hub API interactions, `utils.ts` for general utilities).
- **Structure**: break scripts into small, focused functions — one function per logical step. The main flow should read like a sequence of named steps, not a single monolithic block.
- **Logging**: use `node:util` `styleText` for colored console output (e.g., `styleText('green', '✓ Done')`, `styleText('red', 'Error: ...')`). Use the `logStep`, `logSuccess`, `logError`, `logWarn`, `logInfo` helpers from `lib/utils.ts` when available. Never use raw ANSI escape codes or `chalk`/`picocolors`.
- **Comments**: every script must have a top-level doc comment explaining what it does, common usage, and any required env vars. All utility functions should have a doc comment describing their purpose, inputs, and outputs.
- **No secrets in code**: reference env vars or `.env` files — never hardcode keys, tokens, or passwords
- **Exit codes**: use non-zero exit codes for failures; print a clear error message before exiting
