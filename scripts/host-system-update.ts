#!/usr/bin/env bun

/**
 * SSH to a host and run a full system update, including Docker Engine packages.
 *
 * Usage:
 *   bun run scripts/host-system-update.ts <host>
 *   mise run host:update t-oracle
 *
 * <host> is any SSH target: an SSH config alias (e.g. t-oracle) or user@host.
 */

import { spawnSync } from 'node:child_process'
import { parseArgs, styleText } from 'node:util'

const DOCKER_PACKAGES = [
  'docker-ce',
  'docker-ce-cli',
  'containerd.io',
  'docker-compose-plugin',
  'docker-buildx-plugin',
]

const REMOTE_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[host-update] $*"
}

upgrade_dnf() {
  log "Refreshing dnf metadata"
  sudo dnf makecache -y

  log "Upgrading all system packages"
  sudo dnf upgrade -y --refresh

  log "Upgrading Docker Engine packages"
  sudo dnf upgrade -y ${DOCKER_PACKAGES.join(' ')} || log "Docker packages not installed via dnf repo; skipping"
}

upgrade_apt() {
  log "Refreshing apt metadata"
  sudo apt-get update

  log "Upgrading all system packages"
  sudo DEBIAN_FRONTEND=noninteractive apt-get full-upgrade -y

  log "Upgrading Docker Engine packages"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --only-upgrade ${DOCKER_PACKAGES.join(' ')} || log "Docker packages not installed via apt repo; skipping"
}

if command -v dnf >/dev/null 2>&1; then
  upgrade_dnf
elif command -v apt-get >/dev/null 2>&1; then
  upgrade_apt
else
  echo "Unsupported package manager: need dnf or apt-get" >&2
  exit 1
fi

if systemctl is-active --quiet docker; then
  log "Restarting Docker"
  sudo systemctl restart docker
else
  log "Docker service is not active; skipping restart"
fi

if command -v docker >/dev/null 2>&1; then
  log "Docker version: $(docker --version)"
fi

if [ -f /var/run/reboot-required ]; then
  log "Reboot required to finish installing updates"
elif command -v needs-restarting >/dev/null 2>&1 && ! sudo needs-restarting -r >/dev/null 2>&1; then
  log "Reboot required to finish installing updates"
fi

log "System update complete"
`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`Usage: bun run scripts/host-system-update.ts <host>

SSH to <host> and upgrade all system packages plus Docker Engine.
`)
  process.exit(0)
}

const host = positionals[0]?.trim()
if (!host) {
  console.error(styleText('red', 'Error: <host> is required'))
  console.error('Usage: bun run scripts/host-system-update.ts <host>')
  process.exit(1)
}

console.log(styleText('cyan', `=== Updating system packages on ${host} ===`))

const result = spawnSync('ssh', [host, 'bash', '-s'], {
  input: REMOTE_SCRIPT,
  stdio: ['pipe', 'inherit', 'inherit'],
})

if (result.status !== 0) {
  console.error(
    styleText(
      'red',
      `Update failed on ${host} (exit ${result.status ?? 'unknown'})`
    )
  )
  process.exit(result.status ?? 1)
}

console.log(styleText('green', `✓ Update complete on ${host}`))
