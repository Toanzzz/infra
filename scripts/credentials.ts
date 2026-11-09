#!/usr/bin/env bun

/**
 * Guided Pulumi credential setup.
 *
 * Usage:
 *   mise run credentials
 *
 * Prompts for the Pulumi secrets used by this project, verifies each stored
 * value with Pulumi, and never places secrets in command arguments or output.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { styleText } from 'node:util'

const SECRET_KEYS = [
  'cloudflare:apiToken',
  'oci:tenancyOcid',
  'oci:userOcid',
  'oci:fingerprint',
  'oci:privateKey',
] as const
type SecretKey = (typeof SECRET_KEYS)[number]

const CLOUDFLARE_TOKEN_TEMPLATE =
  'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=%2A&zoneId=all&name=toan-infra-pulumi-dns'

/** Runs Pulumi and returns its result without exposing command output. */
function runPulumi(
  args: string[],
  input?: string
): ReturnType<typeof spawnSync> {
  return spawnSync('pulumi', args, {
    input,
    encoding: 'utf8',
    stdio:
      input === undefined
        ? ['ignore', 'pipe', 'inherit']
        : ['pipe', 'pipe', 'inherit'],
  })
}

/** Reads existing config keys without decrypting their values. */
function existingKeys(): Set<string> {
  const result = runPulumi(['config', '--json'])
  if (result.status !== 0)
    throw new Error('Could not read the selected Pulumi stack')
  const config = JSON.parse(String(result.stdout || '{}')) as Record<
    string,
    unknown
  >
  return new Set(Object.keys(config))
}

/** Reads a visible line from stdin. */
async function prompt(message: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const answer = await new Promise<string>((resolve) =>
    readline.question(message, resolve)
  )
  readline.close()
  return answer.trim()
}

/** Reads a secret in raw mode and echoes stars, including pasted characters. */
async function promptSecret(message: string): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error('Secret prompts require an interactive terminal')
  process.stdout.write(message)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  let value = ''
  let stars = 0
  return await new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3) {
          cleanup()
          reject(new Error('Cancelled'))
          return
        }
        if (byte === 13 || byte === 10) {
          cleanup()
          process.stdout.write('\n')
          resolve(value.trim())
          return
        }
        if (byte === 127 || byte === 8) {
          if (stars > 0) {
            value = value.slice(0, -1)
            stars -= 1
            process.stdout.write('\b \b')
          }
          continue
        }
        value += String.fromCharCode(byte)
        stars += 1
        process.stdout.write('*')
      }
    }
    const cleanup = () => {
      process.stdin.off('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
    }
    process.stdin.on('data', onData)
  })
}

/** Verifies that Pulumi can decrypt a configured secret. */
function verify(key: SecretKey): boolean {
  return runPulumi(['config', 'get', key]).status === 0
}

/** Stores one secret through Pulumi stdin, then verifies it. */
function store(key: SecretKey, value: string): boolean {
  if (!value) throw new Error(`No value supplied for ${key}`)
  const result = runPulumi(['config', 'set', '--secret', key], `${value}\n`)
  return result.status === 0 && verify(key)
}

/** Explains the required cross-account Cloudflare token and prints its template. */
function explainCloudflareToken(): void {
  console.log(`
Cloudflare token requirements:
  - User-owned token
  - Zone → DNS → Write
  - Zone → Single Redirect → Edit (the www.shopwatcher.org redirect)
  - Select the existing project zones from src/libs/constants.ts
  - Also select nerdcoder.dev, shopwatcher.org and socom.vn in account
    d6bddb74e0e492ddb7854faeaeca690a
  - Leave Workers, R2, KV, Pages, SSL, analytics, billing, and user scopes off

Token template:
  ${CLOUDFLARE_TOKEN_TEMPLATE}

The link pre-fills the permission only. Select the required zones in both
Cloudflare accounts before creating the token.
`)
}

/** Walks through existing and missing Pulumi secrets. */
async function main(): Promise<void> {
  const keys = existingKeys()
  console.log(styleText('cyan', 'Pulumi credentials'))
  console.log(
    'Selected stack secrets: Cloudflare DNS access and OCI provider access.\n'
  )

  for (const key of SECRET_KEYS) {
    if (keys.has(key)) {
      const keep = await prompt(`${key} is already set. Keep it? [Y/n] `)
      if (keep.toLowerCase() !== 'n' && verify(key)) {
        console.log(styleText('green', `✓ Kept and verified ${key}`))
        continue
      }
      if (key === 'cloudflare:apiToken' && keep.toLowerCase() === 'n')
        explainCloudflareToken()
    }

    const value =
      key === 'oci:privateKey'
        ? readFileSync(
            await prompt('OCI private key file path: '),
            'utf8'
          ).trim()
        : await promptSecret(`${key}: `)
    const verified = store(key, value)
    console.log(
      verified
        ? styleText('green', `✓ Stored and verified ${key}`)
        : styleText('yellow', `! Stored ${key}; verification failed`)
    )
  }

  process.stdin.pause()
  process.stdin.unref()
}

try {
  await main()
} catch (error) {
  console.error(
    styleText('red', `Error: ${error instanceof Error ? error.message : error}`)
  )
  process.exit(1)
}
