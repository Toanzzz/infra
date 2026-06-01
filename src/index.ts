import * as oci from '@pulumi/oci'
import { loadConfig } from './config'
import { ToanCloudflareZones } from './libs/constants'
import { DnsRecords } from './resources/cloudflare.dns'
import { OracleInstance } from './resources/oci.instance'
import { Vcn } from './resources/oci.vcn'

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
    },
    {
      zoneId: ToanCloudflareZones['toan.io'],
      name: 'sync',
      content: instance.publicIp,
      type: 'A',
    },
    {
      zoneId: ToanCloudflareZones['ngao.vn'],
      name: 'games',
      content: instance.publicIp,
      type: 'A',
    },
    {
      zoneId: ToanCloudflareZones['mup.vn'],
      name: '@',
      content: instance.publicIp,
      type: 'A',
    },
  ],
})
