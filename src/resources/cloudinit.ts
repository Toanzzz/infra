import * as fs from 'node:fs'
import * as path from 'node:path'
import * as cloudinit from '@pulumi/cloudinit'
import type * as pulumi from '@pulumi/pulumi'
import { Liquid } from 'liquidjs'

const engine = new Liquid()

export interface CloudInitConfig {
  main?: { SSH_KEYS: string[]; FILES?: { path: string; content: string }[] }
  mounts?: { MOUNTS: { name: string; path: string }[] }
  caddy?: boolean
  firewallOff?: boolean
  installDocker?: boolean
}

export function genCloudInit(
  _name: string,
  config: CloudInitConfig,
  _opts?: pulumi.CustomResourceOptions
): pulumi.Output<string> {
  const parts: pulumi.Input<cloudinit.types.input.ConfigPart>[] = []

  // biome-ignore lint/suspicious/noExplicitAny: Can be any object
  const renderTemplate = (templateName: string, data: any) => {
    const templatePath = path.resolve(
      __dirname,
      `../../templates/cloudinit/${templateName}.liquid`
    )
    const templateContent = fs.readFileSync(templatePath, 'utf-8')
    return engine.parseAndRenderSync(templateContent, data)
  }

  if (config.main) {
    parts.push({
      filename: 'cloudinit.yaml',
      contentType: 'text/cloud-config',
      content: renderTemplate('cloudinit', config.main),
      mergeType: 'list(append)+dict(no_replace,recurse_list)',
    })
  }

  if (config.mounts) {
    parts.push({
      filename: 'cloudinit-mounts.yaml',
      contentType: 'text/cloud-config',
      content: renderTemplate('cloudinit-mounts', config.mounts),
      mergeType: 'list(append)+dict(no_replace,recurse_list)',
    })
  }

  if (config.caddy) {
    parts.push({
      filename: 'install-caddy.yaml',
      contentType: 'text/cloud-config',
      content: renderTemplate('install-caddy', {}),
      mergeType: 'list(append)+dict(no_replace,recurse_list)',
    })
  }

  if (config.firewallOff) {
    parts.push({
      filename: 'disable-firewall.yaml',
      contentType: 'text/cloud-config',
      content: renderTemplate('disable-firewall', {}),
      mergeType: 'list(append)+dict(no_replace,recurse_list)',
    })
  }

  if (config.installDocker) {
    parts.push({
      filename: 'install-docker.yaml',
      contentType: 'text/cloud-config',
      content: renderTemplate('install-docker', {}),
      mergeType: 'list(append)+dict(no_replace,recurse_list)',
    })
  }

  const init = cloudinit.getConfigOutput({
    gzip: false,
    base64Encode: true,
    parts: parts,
  })

  return init.rendered
}
