#!/usr/bin/env bun

/**
 * Sync the Caddy stack to a host and reload it.
 *
 * Ships ./projects/caddy/compose.yml (the shared compose file) plus
 * ./hosts/<host>/caddy/Caddyfile (that host's sites), validates the result on
 * the host, and applies it with `caddy reload` so in-flight requests survive.
 *
 * Usage:
 *   bun run scripts/sync-caddy.ts <host>
 *   mise run host:sync-caddy t-oracle
 *
 * <host> is any SSH target: an SSH config alias (e.g. t-oracle) or user@host.
 *
 * Bind-mount note: the compose file bind-mounts Caddyfile as a single file.
 * Docker pins that mount to an inode. Deleting/replacing the host file (rsync
 * --delete, or rsync's default temp+rename) leaves the container reading a
 * stale deleted inode, so validate (fresh `compose run`) can pass while
 * reload (`compose exec`) applies the old config. This script always writes
 * the Caddyfile in place (`rsync --inplace`) and recreates the container when
 * the mount is out of sync.
 *
 * Stdin note: the remote steps run via `ssh … bash -s` with the script on
 * stdin. Every `docker compose run/exec` must take stdin from /dev/null so it
 * cannot consume the rest of the bash script.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, styleText } from 'node:util'

/** Where the stack lives on the remote host. */
const REMOTE_DIR = '~/apps/caddy'

/**
 * Validate the synced config, ensure the container sees the host Caddyfile,
 * then reload (or recreate once if the file bind-mount is stale).
 *
 * Written as an array of lines so bash `${…}` is never interpreted by the
 * TypeScript template literal.
 */
const REMOTE_SCRIPT = [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  '',
  'cd ~/apps/caddy',
  '',
  'docker network inspect edge >/dev/null 2>&1 \\',
  '  || { echo "error: the \'edge\' network is missing (docker network create edge)" >&2; exit 1; }',
  '',
  'if [[ ! -f Caddyfile ]]; then',
  '  echo "error: Caddyfile missing in ~/apps/caddy after sync" >&2',
  '  exit 1',
  'fi',
  '',
  'echo "Validating Caddyfile..."',
  '# compose run mounts fresh from the host, so this always checks the synced file.',
  '# </dev/null: compose run would otherwise consume the rest of this bash -s script.',
  'docker compose run --rm --no-deps -T caddy \\',
  '  caddy validate --config /etc/caddy/Caddyfile </dev/null',
  '',
  '# Detect a stale single-file bind mount (container still holds a deleted inode).',
  'host_sum=$(sha256sum Caddyfile | awk \'{print $1}\')',
  'ctr_sum=""',
  'if docker compose ps --status running -q caddy >/dev/null 2>&1; then',
  '  ctr_sum=$(docker compose exec -T caddy sha256sum /etc/caddy/Caddyfile </dev/null 2>/dev/null | awk \'{print $1}\' || true)',
  'fi',
  '',
  'if [[ -z "$ctr_sum" || "$host_sum" != "$ctr_sum" ]]; then',
  '  echo "Caddyfile bind mount out of sync (host=$host_sum container=${ctr_sum:-missing}); recreating..."',
  '  docker compose up -d --force-recreate --no-deps caddy',
  'else',
  '  echo "Applying via reload..."',
  '  docker compose up -d --no-deps caddy',
  '  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile </dev/null',
  'fi',
  '',
  'docker compose ps --format "table {{.Service}}\\t{{.Status}}"',
  '',
].join('\n')

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

Sync projects/caddy/compose.yml and hosts/<host>/caddy/Caddyfile to the remote
host, then validate and reload Caddy in place.
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

  // Sync compose.yml only. A directory rsync with --delete removes Caddyfile
  // (it is not in projects/caddy/), which breaks the Docker file bind-mount.
  run('rsync', [
    '-avz',
    '-e',
    ssh,
    'projects/caddy/compose.yml',
    `${host}:${REMOTE_DIR}/compose.yml`,
  ])

  // --inplace writes into the existing inode so the running container's bind
  // mount sees the new bytes. Default rsync (temp file + rename) replaces the
  // inode; the container keeps the deleted one until recreate.
  run('rsync', [
    '-avz',
    '--inplace',
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
