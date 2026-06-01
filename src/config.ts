import * as pulumi from '@pulumi/pulumi'

const DEFAULT_ORACLE_IMAGE_ID =
  'ocid1.image.oc1.ap-singapore-1.aaaaaaaallvdegl3lwi4fr52ewq3j2wfrvo7oclajbfyvlopadap5vch7xzq'
const DEFAULT_ORACLE_AVAILABILITY_DOMAIN = 'ZJxt:AP-SINGAPORE-1-AD-1'

export interface InfraConfig {
  oracle: {
    compartmentId: string
    availabilityDomain: string
    imageId: string
  }
  sshKeys: string[]
}

export function loadConfig(): InfraConfig {
  const pulumiConfig = new pulumi.Config()
  const oracleConfig = new pulumi.Config('oci')

  return {
    oracle: {
      compartmentId: oracleConfig.get('tenancyOcid') ?? '',
      availabilityDomain:
        pulumiConfig.get('oracleAvailabilityDomain') ||
        DEFAULT_ORACLE_AVAILABILITY_DOMAIN,
      imageId: pulumiConfig.get('oracleImageId') || DEFAULT_ORACLE_IMAGE_ID,
    },
    sshKeys: pulumiConfig.getObject<string[]>('sshKeys') || [],
  }
}
