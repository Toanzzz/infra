import * as oci from '@pulumi/oci'
import { loadConfig } from './config'
import { DnsRecords } from './resources/cloudflare.dns'
import { OracleInstance } from './resources/oci.instance'
import { Vcn } from './resources/oci.vcn'

const config = loadConfig()

// Define Oracle Provider
const oracleProvider = new oci.Provider('oracle-provider', {
  tenancyOcid: config.oracle.tenancyOcid,
  userOcid: config.oracle.userOcid,
  privateKeyPath: config.oracle.privateKeyPath,
  fingerprint: config.oracle.fingerprint,
  region: config.oracle.region,
})

// Create Oracle VCN
const vcn = new Vcn(
  'main-vcn',
  {
    compartmentId: config.oracle.compartmentId,
  },
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

// Cloudflare Zone IDs mapping
const ToanCloudflareZones = {
  'imtp.work': '420c28c8db47ba3e52b902b31c2eeffa',
  'mup.vn': '7d082a7b2a770348ad458ca61c8b6af9',
  'ngao.vn': '7e8153c1b657e4296ac6178a9bce980b',
  'skyrise.today': '66ab49ed919f6054661afb3479576dd8',
  'toan.io': '4a695e58a00b981b5a6fc8e21522a6ae',
  'truyen.club': 'a5bb9881fc0dc91a4f4fa89bc1884c9e',
  'truyenhay.tv': '4994890018ba772bcc2d2ea896004a1f',
  'truyentranh.vn': 'd8a4c189e4e84b47110844859077687c',
}

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
