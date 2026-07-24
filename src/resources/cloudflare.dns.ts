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

export class DnsRecords extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: DnsRecordsArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('custom:cloudflare:DnsRecords', name, args, opts)

    args.records.forEach((record, index) => {
      new cloudflare.DnsRecord(
        `${name}-record-${index}`,
        {
          name: record.name,
          type: record.type,
          content: record.content as pulumi.Output<string>,
          zoneId: record.zoneId,
          proxied: record.proxied,
          comment: '[Terraform] Generated',
          ttl: 3600,
        },
        {
          parent: this,
          aliases: [{ parent: pulumi.rootStackResource }],
        }
      )
    })

    this.registerOutputs()
  }
}
