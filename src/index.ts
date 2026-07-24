import * as oci from '@pulumi/oci'
import { loadConfig } from './config.ts'
import { ToanCloudflareZones } from './libs/constants.ts'
import { DnsRecords } from './resources/cloudflare.dns.ts'
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
      caddy: false,
      firewallOff: false,
      installDocker: false,
    },
  },
  { provider: oracleProvider }
)

// Export Instance Outputs
export const publicIp = instance.publicIp
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
  ],
})
