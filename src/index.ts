import * as oci from '@pulumi/oci'
import { loadConfig } from './config.ts'
import {
  NerdCoderCloudflareZones,
  ToanCloudflareZones,
} from './libs/constants.ts'
import { DnsRecords } from './resources/cloudflare.dns.ts'
import { ZoneRedirects } from './resources/cloudflare.redirect.ts'
import { OracleInstance } from './resources/oci.instance.ts'
import { Vcn } from './resources/oci.vcn.ts'

const config = loadConfig()

// Define Oracle Provider
const oracleProvider = new oci.Provider('oracle-provider')

// Create Oracle VCN
const vcn = new Vcn(
  'main-vcn',
  { compartmentId: config.oracle.compartmentId },
  { provider: oracleProvider }
)

// Create Oracle Instance
const instance = new OracleInstance(
  'free-instance',
  {
    compartmentId: config.oracle.compartmentId,
    availabilityDomain: config.oracle.availabilityDomain,
    subnetId: vcn.subnet.id,
    imageId: config.oracle.imageId,
    sshKeys: config.sshKeys,
    cloudInitConfig: {
      main: { SSH_KEYS: config.sshKeys, FILES: [] },
      mounts: {
        MOUNTS: [
          { name: 'oracleoci/oraclevdb', path: '/data' },
          { name: 'oracleoci/oraclevdc', path: '/backup' },
        ],
      },
      firewallOff: false,
      installDocker: false,
    },
  },
  { provider: oracleProvider }
)

// Export Instance Outputs
export const publicIp = instance.publicIp
export const publicIpv6 = instance.publicIpv6
export const dataVolumeDevice = instance.dataVolumeDevice
export const backupVolumeDevice = instance.backupVolumeDevice

// Create DNS Records
new DnsRecords('cloudflare-dns', {
  records: [
    {
      zoneId: ToanCloudflareZones['toan.io'],
      name: 'oracle',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['toan.io'],
      name: 'sync',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['ngao.vn'],
      name: 'games',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['mup.vn'],
      name: '@',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['toan.io'],
      name: 'oracle',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['toan.io'],
      name: 'sync',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['ngao.vn'],
      name: 'games',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['mup.vn'],
      name: '@',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['coralhub.cc'],
      name: '@',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['coralhub.cc'],
      name: '@',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['coralhub.cc'],
      name: 'api',
      content: 'coralhub.cc',
      type: 'CNAME',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['coralhub.cc'],
      name: 'restate',
      content: 'coralhub.cc',
      type: 'CNAME',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['imtp.work'],
      name: 'mira',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['imtp.work'],
      name: 'mira',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['ngao.vn'],
      name: 'social-indexer-api',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['ngao.vn'],
      name: 'social-indexer-api',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: NerdCoderCloudflareZones['nerdcoder.dev'],
      name: 'social-indexer-api',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: NerdCoderCloudflareZones['nerdcoder.dev'],
      name: 'social-indexer-api',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['toan.io'],
      name: 'saigon-tour-api',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['toan.io'],
      name: 'saigon-tour-api',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['toan.io'],
      name: 'shop-watcher-api',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: ToanCloudflareZones['toan.io'],
      name: 'shop-watcher-api',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    {
      zoneId: NerdCoderCloudflareZones['shopwatcher.org'],
      name: 'api',
      content: instance.publicIp,
      type: 'A',
      proxied: false,
    },
    {
      zoneId: NerdCoderCloudflareZones['shopwatcher.org'],
      name: 'api',
      content: instance.publicIpv6,
      type: 'AAAA',
      proxied: false,
    },
    // The apex is the shop-watcher web Worker's custom domain, created by its
    // wrangler deploy. www only exists so the redirect below can match it.
    {
      zoneId: NerdCoderCloudflareZones['shopwatcher.org'],
      name: 'www',
      content: '100::',
      type: 'AAAA',
      proxied: true,
    },
  ],
})

new ZoneRedirects('shopwatcher-org-redirects', {
  zoneId: NerdCoderCloudflareZones['shopwatcher.org'],
  redirects: [
    { fromHost: 'www.shopwatcher.org', toOrigin: 'https://shopwatcher.org' },
  ],
})
