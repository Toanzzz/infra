import * as oci from '@pulumi/oci'
import * as pulumi from '@pulumi/pulumi'

export interface VcnArgs {
  compartmentId: pulumi.Input<string>
}

export class Vcn extends pulumi.ComponentResource {
  public readonly vcn: oci.core.Vcn
  public readonly subnet: oci.core.Subnet

  constructor(
    name: string,
    args: VcnArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('custom:oci:Vcn', name, args, opts)

    const vcn = new oci.core.Vcn(
      `${name}-vcn`,
      {
        compartmentId: args.compartmentId,
        cidrBlocks: ['10.0.0.0/16'],
        displayName: 'main-vcn',
        dnsLabel: 'mainvcn',
        isIpv6enabled: true,
      },
      {
        parent: this,
        aliases: [{ parent: pulumi.rootStackResource }],
      }
    )

    const ig = new oci.core.InternetGateway(
      `${name}-internet-gateway`,
      {
        compartmentId: args.compartmentId,
        vcnId: vcn.id,
        displayName: 'internet-gateway',
      },
      {
        parent: this,
        aliases: [{ parent: pulumi.rootStackResource }],
      }
    )

    // biome-ignore lint/correctness/noUnusedVariables: Need to instantiate it
    const rt = new oci.core.DefaultRouteTable(
      `${name}-default-route-table`,
      {
        compartmentId: args.compartmentId,
        manageDefaultResourceId: vcn.defaultRouteTableId,
        displayName: 'default-route-table',
        routeRules: [
          {
            networkEntityId: ig.id,
            destination: '0.0.0.0/0',
            destinationType: 'CIDR_BLOCK',
          },
        ],
      },
      {
        parent: this,
        aliases: [{ parent: pulumi.rootStackResource }],
      }
    )

    // biome-ignore lint/correctness/noUnusedVariables: Need to instantiate it
    const securityList = new oci.core.DefaultSecurityList(
      `${name}-security-list`,
      {
        compartmentId: args.compartmentId,
        manageDefaultResourceId: vcn.defaultSecurityListId,
        egressSecurityRules: [
          {
            protocol: 'all',
            destination: '0.0.0.0/0',
            destinationType: 'CIDR_BLOCK',
            description: 'Allow all outbound traffic',
          },
        ],
        ingressSecurityRules: [
          {
            protocol: '6', // TCP
            source: '0.0.0.0/0',
            sourceType: 'CIDR_BLOCK',
            tcpOptions: { max: 22, min: 22 },
            description: 'Allow SSH from anywhere',
          },
          {
            protocol: '6', // TCP
            source: '0.0.0.0/0',
            sourceType: 'CIDR_BLOCK',
            tcpOptions: { max: 80, min: 80 },
            description: 'Allow HTTP from anywhere',
          },
          {
            protocol: '6', // TCP
            source: '0.0.0.0/0',
            sourceType: 'CIDR_BLOCK',
            tcpOptions: { max: 443, min: 443 },
            description: 'Allow HTTPS from anywhere',
          },
          {
            protocol: '6', // TCP
            source: '0.0.0.0/0',
            sourceType: 'CIDR_BLOCK',
            tcpOptions: { max: 22000, min: 22000 },
            description: 'Allow Syncthing TCP file transfers from anywhere',
          },
          {
            protocol: '17', // UDP
            source: '0.0.0.0/0',
            sourceType: 'CIDR_BLOCK',
            udpOptions: { max: 22000, min: 22000 },
            description: 'Allow Syncthing UDP file transfers from anywhere',
          },
        ],
      },
      {
        parent: this,
        aliases: [{ parent: pulumi.rootStackResource }],
      }
    )

    const subnet = new oci.core.Subnet(
      `${name}-public-subnet`,
      {
        compartmentId: args.compartmentId,
        vcnId: vcn.id,
        cidrBlock: '10.0.0.0/24',
        displayName: 'public-subnet',
        dnsLabel: 'public',
        securityListIds: [vcn.defaultSecurityListId],
        ipv6cidrBlock: '2603:c024:4513:ec0f::/64',
        routeTableId: vcn.defaultRouteTableId,
      },
      {
        parent: this,
        aliases: [{ parent: pulumi.rootStackResource }],
      }
    )

    this.vcn = vcn
    this.subnet = subnet

    this.registerOutputs({
      vcn: this.vcn,
      subnet: this.subnet,
    })
  }
}
