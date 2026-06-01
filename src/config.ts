import * as pulumi from '@pulumi/pulumi'

export interface InfraConfig {
  oracle: {
    tenancyOcid: string
    userOcid: string
    fingerprint: string
    privateKeyPath: string
    region: string
    compartmentId: string
    availabilityDomain: string
    imageId: string
  }
  sshKeys: string[]
}

export function loadConfig(): InfraConfig {
  const pulumiConfig = new pulumi.Config()
  const oracleConfig = new pulumi.Config('oci')

  // Fallbacks to constants from the original TS codebase, assuming these might not be set in Pulumi config yet.
  // In a real Pulumi setup these would be read from Config directly.
  return {
    oracle: {
      tenancyOcid:
        oracleConfig.get('tenancyOcid') ||
        'ocid1.tenancy.oc1..aaaaaaaazuh33sgflavfx6z2ho5mp37ki3ircrz2hwqn2lynrfmn3sfahslq',
      userOcid:
        oracleConfig.get('userOcid') ||
        'ocid1.user.oc1..aaaaaaaa2rnrixk6wvmoyrobhmubqc4lhndvvetpuv6eb5eaav7p5bzqopxa',
      fingerprint:
        oracleConfig.get('fingerprint') ||
        '98:4f:20:41:e1:c2:d4:19:9c:a5:0e:aa:42:a2:45:5e',
      privateKeyPath:
        oracleConfig.get('privateKeyPath') ||
        '/Users/toan/.oci/me@toan.io_2025-02-12T18_40_14.771Z.pem',
      region: oracleConfig.get('region') || 'ap-singapore-1',
      compartmentId:
        pulumiConfig.get('oracleCompartmentId') ||
        'ocid1.tenancy.oc1..aaaaaaaazuh33sgflavfx6z2ho5mp37ki3ircrz2hwqn2lynrfmn3sfahslq',
      availabilityDomain:
        pulumiConfig.get('oracleAvailabilityDomain') ||
        'ZJxt:AP-SINGAPORE-1-AD-1',
      imageId:
        pulumiConfig.get('oracleImageId') ||
        'ocid1.image.oc1.ap-singapore-1.aaaaaaaallvdegl3lwi4fr52ewq3j2wfrvo7oclajbfyvlopadap5vch7xzq',
    },
    sshKeys: pulumiConfig.getObject<string[]>('sshKeys') || [
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILtAGscFFSfeqQhLuNN/B5eSJrVSd9FrQVZ16SK+MEmc toan@Rayleigh.local',
    ],
  }
}
