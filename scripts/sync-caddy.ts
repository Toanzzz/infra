#!/usr/bin/env bun

/**
 * Sync the Caddy stack to a host and reload it.
 *
 * Ships ./projects/caddy/ (the shared compose file) plus
 * ./hosts/<host>/caddy/Caddyfile (that host's sites), validates the result on
 * the host, and applies it with `caddy reload` so in-flight requests survive.
 *
 * Usage:
 *   bun run scripts/sync-caddy.ts <host>
 *   mise run host:sync-caddy t-oracle
 *
 * <host> is any SSH target: an SSH config alias (e.g. t-oracle) or user@host.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, styleText } from 'node:util'

/** Where the stack lives on the remote host. */
const REMOTE_DIR = '~/apps/caddy'

/** Validate the synced config, ensure the container is up, then reload. */
const REMOTE_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

cd ~/apps/caddy

docker network inspect edge >/dev/null 2>&1 \\
  || { echo "error: the 'edge' network is missing (docker network create edge)" >&2; exit 1; }

echo "Validating Caddyfile..."
docker compose run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile

echo "Applying..."
docker compose up -d
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile

docker compose ps --format 'table {{.Service}}\\t{{.Status}}'
`

function logStep(message: string): void {
  console.log(styleText('cyan', `=== ${message} ===`))
}

function logError(message: string): void {
  console.error(styleText('red', message))
}

/** Run a command, inheriting stdio, and exit with its code on failure. */
function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    logError(
      `Command failed: ${command} ${args.join(' ')} (exit ${result.status ?? 'unknown'})`
    )
    process.exit(result.status ?? 1)
  }
}

/** Resolve and validate the host argument. */
function parseHost(): string {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h' } },
  })

  if (values.help) {
    console.log(`Usage: bun run scripts/sync-caddy.ts <host>

Sync projects/caddy/ and hosts/<host>/caddy/Caddyfile to the remote host,
then validate and reload Caddy in place.
`)
    process.exit(0)
  }

  const host = positionals[0]?.trim()
  if (!host) {
    logError('Error: <host> is required')
    console.error('Usage: bun run scripts/sync-caddy.ts <host>')
    process.exit(1)
  }
  return host
}

/** Copy the shared compose file and the host-specific Caddyfile up. */
function syncFiles(host: string, caddyfile: string): void {
  const ssh = 'ssh -o StrictHostKeyChecking=no'

  logStep(`Syncing Caddy stack to ${host}`)
  run('ssh', [host, `mkdir -p ${REMOTE_DIR}`])
  // --delete first, then place the Caddyfile: it is not part of projects/caddy/.
  run('rsync', [
    '-avz',
    '--delete',
    '-e',
    ssh,
    'projects/caddy/',
    `${host}:${REMOTE_DIR}/`,
  ])
  run('rsync', [
    '-avz',
    '-e',
    ssh,
    caddyfile,
    `${host}:${REMOTE_DIR}/Caddyfile`,
  ])
}

/** Validate and reload Caddy on the remote host. */
function reloadRemote(host: string): void {
  logStep(`Reloading Caddy on ${host}`)
  const result = spawnSync('ssh', [host, 'bash', '-s'], {
    input: REMOTE_SCRIPT,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  if (result.status !== 0) {
    logError(
      `Caddy reload failed on ${host} (exit ${result.status ?? 'unknown'})`
    )
    process.exit(result.status ?? 1)
  }
}

const host = parseHost()
const caddyfile = join('hosts', host, 'caddy', 'Caddyfile')

if (!existsSync(caddyfile)) {
  logError(`Error: no Caddyfile for this host at ${caddyfile}`)
  process.exit(1)
}
if (!existsSync('projects/caddy/compose.yml')) {
  logError('Error: projects/caddy/compose.yml is missing')
  process.exit(1)
}

syncFiles(host, caddyfile)
reloadRemote(host)

console.log(styleText('green', `✓ Caddy reloaded on ${host}`))
