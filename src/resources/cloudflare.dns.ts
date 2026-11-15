import * as cloudflare from '@pulumi/cloudflare'
import * as pulumi from '@pulumi/pulumi'

export interface DnsRecordArgs {
  zoneId: string
  name: string
  type: string
  content: pulumi.Input<string>
  proxied: boolean
}

export interface DnsRecordsArgs {
  records: DnsRecordArgs[]
}

function recordResourceName(componentName: string, record: DnsRecordArgs): string {
  const host = record.name === '@' ? 'apex' : record.name
  return `${componentName}-${record.zoneId.slice(0, 8)}-${host}-${record.type}`
}

export class DnsRecords extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: DnsRecordsArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('custom:cloudflare:DnsRecords', name, args, opts)

    args.records.forEach((record, index) => {
      new cloudflare.DnsRecord(
        recordResourceName(name, record),
        {
          name: record.name,
          type: record.type,
          content: record.content as pulumi.Output<string>,
          zoneId: record.zoneId,
          proxied: record.proxied,
          comment: '[Terraform] Generated',
          // Cloudflare stores proxied records with automatic TTL (1).
          ttl: record.proxied ? 1 : 3600,
        },
        {
          parent: this,
          // Keep the old parent=root alias, and map each record off its former
          // index-based name so reordering/removal no longer shifts ownership.
          aliases: [
            { parent: pulumi.rootStackResource },
            { name: `${name}-record-${index}`, parent: this },
          ],
          deleteBeforeReplace: true,
        }
      )
    })

    this.registerOutputs()
  }
}
