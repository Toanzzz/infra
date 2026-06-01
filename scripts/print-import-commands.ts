#!/usr/bin/env bun

/**
 * Utility script to automate fetching the state from Terraform Cloud
 * and generating exact Pulumi import commands.
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { styleText } from 'node:util'

console.log(
  styleText('green', '=== Step 1: Synthesizing CDKTF (if needed) ===')
)
const cloudDir = '/Users/toan/code/T/cloud'
const oracleStackDir = path.join(
  cloudDir,
  'cdktf.out',
  'stacks',
  'personal-oracle'
)
const cloudflareStackDir = path.join(
  cloudDir,
  'cdktf.out',
  'stacks',
  'personal-cloudflare'
)

if (!fs.existsSync(oracleStackDir)) {
  console.log('Synthesizing CDKTF stacks...')
  execSync('pnpm cdktf synth', { cwd: cloudDir, stdio: 'inherit' })
} else {
  console.log('CDKTF output already exists, skipping synth.')
}

function fetchState(stackDir: string, stackName: string) {
  console.log(
    styleText(
      'green',
      `\n=== Step 2: Fetching State from Cloud for ${stackName} ===`
    )
  )
  console.log('Cleaning up old terraform caches to avoid symlink issues...')
  execSync('rm -rf .terraform .terraform.lock.hcl', { cwd: stackDir })

  console.log('Running terraform init...')
  execSync('terraform init', { cwd: stackDir, stdio: 'pipe' })

  console.log('Pulling state from the cloud...')
  const stateJson = execSync('terraform state pull', {
    cwd: stackDir,
    encoding: 'utf-8',
  })
  return JSON.parse(stateJson)
}

interface TerraformState {
  resources?: Array<{
    mode: string
    type: string
    name: string
    instances?: Array<{
      attributes?: Record<string, unknown> & { id?: string; zone_id?: string }
    }>
  }>
}

let oracleState: TerraformState, cloudflareState: TerraformState
try {
  oracleState = fetchState(oracleStackDir, 'personal-oracle')
  cloudflareState = fetchState(cloudflareStackDir, 'personal-cloudflare')
} catch (e: unknown) {
  console.error(
    styleText(
      'red',
      'Failed to fetch state! Make sure you have terraform installed and you have access to Terraform Cloud.'
    )
  )
  if (e instanceof Error) {
    console.error(e.message)
  }
  process.exit(1)
}

// Map CDKTF resources to Pulumi resources
// CDKTF resources typically have names based on their ID in TS
const idMap: Record<string, string> = {}

for (const res of oracleState.resources || []) {
  if (res.mode === 'managed') {
    const instance = res.instances?.[0]
    if (instance?.attributes?.id) {
      // Map CDKTF type + name to OCID
      idMap[`${res.type}.${res.name}`] = instance.attributes.id
    }
  }
}

for (const res of cloudflareState.resources || []) {
  if (res.mode === 'managed') {
    const instance = res.instances?.[0]
    if (instance?.attributes?.id) {
      // For Cloudflare records, Pulumi expects zone_id/record_id
      const zoneId = instance.attributes.zone_id
      const recordId = instance.attributes.id
      idMap[`${res.type}.${res.name}`] = `${zoneId}/${recordId}`
    }
  }
}

// Find specific resources by their type or partial name

function findIdByIncludes(substring: string) {
  for (const key in idMap) {
    if (key.includes(substring)) return idMap[key]
  }
  return '<NOT_FOUND>'
}

const pulumiImports = [
  {
    pulumiName: 'main-vcn-vcn',
    type: 'oci:Core/vcn:Vcn',
    id: findIdByIncludes('oci_core_vcn.'),
  },
  {
    pulumiName: 'main-vcn-internet-gateway',
    type: 'oci:Core/internetGateway:InternetGateway',
    id: findIdByIncludes('oci_core_internet_gateway.'),
  },
  {
    pulumiName: 'main-vcn-default-route-table',
    type: 'oci:Core/defaultRouteTable:DefaultRouteTable',
    id: findIdByIncludes('oci_core_default_route_table.'),
  },
  {
    pulumiName: 'main-vcn-security-list',
    type: 'oci:Core/defaultSecurityList:DefaultSecurityList',
    id: findIdByIncludes('oci_core_default_security_list.'),
  },
  {
    pulumiName: 'main-vcn-public-subnet',
    type: 'oci:Core/subnet:Subnet',
    id: findIdByIncludes('oci_core_subnet.'),
  },
  {
    pulumiName: 'free-instance-instance',
    type: 'oci:Core/instance:Instance',
    id: findIdByIncludes('oci_core_instance.'),
  },
  // Need to distinguish data and backup volumes
  {
    pulumiName: 'free-instance-volume-data',
    type: 'oci:Core/volume:Volume',
    id: findIdByIncludes('volume-data'),
  },
  {
    pulumiName: 'free-instance-volume-backup',
    type: 'oci:Core/volume:Volume',
    id: findIdByIncludes('volume-backup'),
  },
  {
    pulumiName: 'free-instance-data-volume-attachment',
    type: 'oci:Core/volumeAttachment:VolumeAttachment',
    id: findIdByIncludes('data-volume-attachment'),
  },
  {
    pulumiName: 'free-instance-backup-volume-attachment',
    type: 'oci:Core/volumeAttachment:VolumeAttachment',
    id: findIdByIncludes('backup-volume-attachment'),
  },
]

// Add cloudflare records
const cfKeys = Object.keys(idMap).filter((k) =>
  k.includes('cloudflare_dns_record.')
)
cfKeys.forEach((key, index) => {
  pulumiImports.push({
    pulumiName: `cloudflare-dns-record-${index}`,
    type: 'cloudflare:index/dnsRecord:DnsRecord',
    id: idMap[key],
  })
})

console.log('\n')
console.log(
  styleText('green', '=== Step 3: Run these exact Pulumi commands ===')
)
for (const imp of pulumiImports) {
  if (imp.id !== '<NOT_FOUND>') {
    console.log(
      styleText(
        'cyan',
        `bun run pulumi import -y ${imp.type} ${imp.pulumiName} '${imp.id}'`
      )
    )
  } else {
    console.log(
      styleText('red', `# Could not find ID in state for ${imp.pulumiName}`)
    )
  }
}
