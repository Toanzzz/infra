#!/usr/bin/env bun

/**
 * Replace an OCI instance's ephemeral public IPv4 address with a newly allocated one.
 *
 * Usage:
 *   bun run scripts/oci-reassign-public-ip.ts [--display-name free-instance]
 *   bun run scripts/oci-reassign-public-ip.ts --instance-id <instance-ocid> --yes
 *
 * The compartment defaults to `pulumi config get oci:tenancyOcid`. Override it with
 * --compartment-id when the instance lives in a child compartment. The OCI CLI must
 * be installed and authenticated (through its config file or OCI environment vars).
 * This script changes OCI only; run `bun run up` afterward to refresh Pulumi state
 * and update DNS records that consume the instance's public IP.
 */

import { spawnSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { parseArgs, styleText } from 'node:util'

interface OciListResponse<T> {
  data: T[]
}

interface OciItemResponse<T> {
  data: T
}

interface Instance {
  id: string
  'availability-domain': string
  'display-name': string
  'lifecycle-state': string
}

interface VnicAttachment {
  'vnic-id': string
  'lifecycle-state': string
}

interface PrivateIp {
  id: string
  'ip-address': string
  'is-primary': boolean
}

interface PublicIp {
  id: string
  'ip-address': string
  lifetime: 'EPHEMERAL' | 'RESERVED'
  'private-ip-id': string | null
}

const { values } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h' },
    yes: { type: 'boolean', short: 'y' },
    'instance-id': { type: 'string' },
    'display-name': { type: 'string', default: 'free-instance' },
    'compartment-id': { type: 'string' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: bun run scripts/oci-reassign-public-ip.ts [options]

Options:
  --instance-id <ocid>      Target an instance by OCID
  --display-name <name>     Discover the instance by name (default: free-instance)
  --compartment-id <ocid>   OCI compartment (default: Pulumi oci:tenancyOcid)
  -y, --yes                 Skip the interactive confirmation
  -h, --help                Show this help

The instance must have an ephemeral public IPv4 address. Afterward, run
\`bun run up\` to update Pulumi-managed DNS records with the new address.`)
  process.exit(0)
}

/** Runs a command, returning trimmed stdout or exiting with its status on failure. */
function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' })

  if (result.error) {
    console.error(
      styleText(
        'red',
        `Error: failed to run ${command}: ${result.error.message}`
      )
    )
    process.exit(1)
  }

  if (result.status !== 0) {
    if (result.stderr.trim()) console.error(result.stderr.trim())
    console.error(
      styleText(
        'red',
        `Error: ${command} exited with status ${result.status ?? 'unknown'}`
      )
    )
    process.exit(result.status ?? 1)
  }

  return result.stdout.trim()
}

/** Runs an OCI CLI command and parses its JSON response. */
function runOci<T>(args: string[]): T {
  const output = run('oci', [...args, '--output', 'json'])
  try {
    return JSON.parse(output) as T
  } catch {
    console.error(styleText('red', 'Error: OCI CLI returned invalid JSON'))
    process.exit(1)
  }
}

/**
 * Runs an OCI CLI list command and returns the `data` array. The OCI CLI
 * prints nothing at all for an empty list result, so blank output means `[]`.
 */
function runOciList<T>(args: string[]): T[] {
  const output = run('oci', [...args, '--output', 'json'])
  if (!output) return []
  try {
    return (JSON.parse(output) as OciListResponse<T>).data
  } catch {
    console.error(styleText('red', 'Error: OCI CLI returned invalid JSON'))
    process.exit(1)
  }
}

/** Gets the configured OCI compartment from the explicit option or Pulumi config. */
function getCompartmentId(): string {
  if (values['compartment-id']?.trim()) return values['compartment-id'].trim()

  const compartmentId = run('pulumi', ['config', 'get', 'oci:tenancyOcid'])
  if (!compartmentId) {
    console.error(
      styleText(
        'red',
        'Error: set --compartment-id or configure oci:tenancyOcid'
      )
    )
    process.exit(1)
  }
  return compartmentId
}

/** Resolves exactly one running instance from an OCID or display name. */
function getInstance(compartmentId: string): Instance {
  if (values['instance-id']?.trim()) {
    return runOci<OciItemResponse<Instance>>([
      'compute',
      'instance',
      'get',
      '--instance-id',
      values['instance-id'].trim(),
    ]).data
  }

  const instances = runOciList<Instance>([
    'compute',
    'instance',
    'list',
    '--compartment-id',
    compartmentId,
    '--display-name',
    values['display-name'] ?? 'free-instance',
    '--lifecycle-state',
    'RUNNING',
    '--all',
  ])

  const [instance] = instances
  if (!instance || instances.length !== 1) {
    console.error(
      styleText(
        'red',
        `Error: expected one running instance named ${values['display-name']}, found ${instances.length}`
      )
    )
    process.exit(1)
  }
  return instance
}

/** Finds the target instance's attached primary VNIC. */
function getVnicId(compartmentId: string, instanceId: string): string {
  const attachments = runOciList<VnicAttachment>([
    'compute',
    'vnic-attachment',
    'list',
    '--compartment-id',
    compartmentId,
    '--instance-id',
    instanceId,
    '--all',
  ]).filter((attachment) => attachment['lifecycle-state'] === 'ATTACHED')

  const [attachment] = attachments
  if (!attachment || attachments.length !== 1) {
    console.error(
      styleText(
        'red',
        `Error: expected one attached VNIC, found ${attachments.length}`
      )
    )
    process.exit(1)
  }
  return attachment['vnic-id']
}

/** Finds the primary private IPv4 address belonging to a VNIC. */
function getPrimaryPrivateIp(vnicId: string): PrivateIp {
  const privateIps = runOciList<PrivateIp>([
    'network',
    'private-ip',
    'list',
    '--vnic-id',
    vnicId,
    '--all',
  ])
  const primary = privateIps.find((privateIp) => privateIp['is-primary'])
  if (!primary) {
    console.error(styleText('red', 'Error: primary private IP not found'))
    process.exit(1)
  }
  return primary
}

/**
 * Finds the public IPv4 address assigned to a private IP. Ephemeral public IPs
 * assigned to private IPs have scope AVAILABILITY_DOMAIN, so the query must
 * include the instance's availability domain; a REGION-scoped query only
 * returns reserved IPs and regional entities such as NAT gateways.
 */
function getPublicIp(
  compartmentId: string,
  availabilityDomain: string,
  privateIpId: string
): PublicIp {
  const publicIps = runOciList<PublicIp>([
    'network',
    'public-ip',
    'list',
    '--scope',
    'AVAILABILITY_DOMAIN',
    '--availability-domain',
    availabilityDomain,
    '--compartment-id',
    compartmentId,
    '--lifetime',
    'EPHEMERAL',
    '--all',
  ])
  const publicIp = publicIps.find(
    (candidate) => candidate['private-ip-id'] === privateIpId
  )
  if (!publicIp) {
    console.error(
      styleText(
        'red',
        'Error: the primary private IP has no public IPv4 address'
      )
    )
    process.exit(1)
  }
  if (publicIp.lifetime !== 'EPHEMERAL') {
    console.error(
      styleText('red', 'Error: refusing to replace a reserved public IP')
    )
    process.exit(1)
  }
  return publicIp
}

/** Requests confirmation before the old address is deleted. */
async function confirmReplacement(
  instance: Instance,
  publicIp: PublicIp
): Promise<void> {
  if (values.yes) return

  const readline = createInterface({ input: stdin, output: stdout })
  const answer = await readline.question(
    `Replace ${publicIp['ip-address']} on ${instance['display-name']}? This briefly interrupts IPv4 connectivity. [y/N] `
  )
  readline.close()
  if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
    console.log(styleText('yellow', 'Cancelled'))
    process.exit(0)
  }
}

/** Deletes the old ephemeral address and allocates a new one on the same private IP. */
function replacePublicIp(
  compartmentId: string,
  privateIpId: string,
  oldPublicIpId: string
): PublicIp {
  run('oci', [
    'network',
    'public-ip',
    'delete',
    '--public-ip-id',
    oldPublicIpId,
    '--force',
  ])
  return runOci<OciItemResponse<PublicIp>>([
    'network',
    'public-ip',
    'create',
    '--compartment-id',
    compartmentId,
    '--lifetime',
    'EPHEMERAL',
    '--private-ip-id',
    privateIpId,
    '--wait-for-state',
    'ASSIGNED',
  ]).data
}

const compartmentId = getCompartmentId()
const instance = getInstance(compartmentId)
const vnicId = getVnicId(compartmentId, instance.id)
const privateIp = getPrimaryPrivateIp(vnicId)
const oldPublicIp = getPublicIp(
  compartmentId,
  instance['availability-domain'],
  privateIp.id
)

console.log(
  styleText('cyan', `Instance: ${instance['display-name']} (${instance.id})`)
)
console.log(
  styleText('cyan', `Current public IP: ${oldPublicIp['ip-address']}`)
)
await confirmReplacement(instance, oldPublicIp)

console.log(styleText('cyan', 'Replacing ephemeral public IP...'))
const newPublicIp = replacePublicIp(compartmentId, privateIp.id, oldPublicIp.id)
console.log(styleText('green', `✓ New public IP: ${newPublicIp['ip-address']}`))
console.log(
  styleText('yellow', 'Run `bun run up` to update Pulumi-managed DNS records.')
)
