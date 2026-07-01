#!/usr/bin/env bun

/**
 * Sync a host's Caddy config from ./hosts/<host>/caddy/ and restart Caddy.
 *
 * Usage:
 *   bun run scripts/sync-caddy.ts <host>
 *   mise run host:sync-caddy t-oracle
 *
 * <host> is any SSH target: an SSH config alias (e.g. t-oracle) or user@host.
 * Local config lives at hosts/<host>/caddy/ relative to the repo root.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, styleText } from 'node:util'

const REMOTE_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

sudo cp ~/caddy/Caddyfile /etc/caddy/Caddyfile
echo "Restarting Caddy..."
sudo systemctl restart caddy
`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`Usage: bun run scripts/sync-caddy.ts <host>

Sync hosts/<host>/caddy/ to the remote host and restart Caddy.
`)
  process.exit(0)
}

const host = positionals[0]?.trim()
if (!host) {
  console.error(styleText('red', 'Error: <host> is required'))
  console.error('Usage: bun run scripts/sync-caddy.ts <host>')
  process.exit(1)
}

const localCaddyDir = join('hosts', host, 'caddy')
if (!existsSync(localCaddyDir)) {
  console.error(
    styleText('red', `Error: local Caddy config not found at ${localCaddyDir}/`)
  )
  process.exit(1)
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(
      styleText(
        'red',
        `Command failed: ${command} ${args.join(' ')} (exit ${result.status ?? 'unknown'})`
      )
    )
    process.exit(result.status ?? 1)
  }
}

console.log(styleText('cyan', `=== Syncing Caddy config to ${host} ===`))

run('rsync', [
  '-avz',
  '--delete',
  '-e',
  'ssh -o StrictHostKeyChecking=no',
  `${localCaddyDir}/`,
  `${host}:~/caddy/`,
])

console.log(styleText('cyan', `=== Updating Caddy service on ${host} ===`))

const sshResult = spawnSync('ssh', [host, 'bash', '-s'], {
  input: REMOTE_SCRIPT,
  stdio: ['pipe', 'inherit', 'inherit'],
})

if (sshResult.status !== 0) {
  console.error(
    styleText(
      'red',
      `Caddy restart failed on ${host} (exit ${sshResult.status ?? 'unknown'})`
    )
  )
  process.exit(sshResult.status ?? 1)
}

console.log(styleText('green', `✓ Caddy restarted on ${host}`))