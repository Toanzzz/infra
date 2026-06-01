import * as oci from '@pulumi/oci'
import * as pulumi from '@pulumi/pulumi'
import { type CloudInitConfig, genCloudInit } from './cloudinit.ts'

export interface OracleInstanceArgs {
  compartmentId: pulumi.Input<string>
  availabilityDomain: pulumi.Input<string>
  subnetId: pulumi.Input<string>
  imageId: pulumi.Input<string>
  sshKeys: string[]
  cloudInitConfig: CloudInitConfig
}

export class OracleInstance extends pulumi.ComponentResource {
  public readonly publicIp: pulumi.Output<string>
  public readonly dataVolumeDevice: pulumi.Output<string>
  public readonly backupVolumeDevice: pulumi.Output<string>

  constructor(
    name: string,
    args: OracleInstanceArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('custom:oci:OracleInstance', name, args, opts)

    const dataVolume = new oci.core.Volume(
      `${name}-volume-data`,
      {
        compartmentId: args.compartmentId,
        availabilityDomain: args.availabilityDomain,
        displayName: 'data-volume-01',
        sizeInGbs: '50',
      },
      { parent: this }
    )

    const backupVolume = new oci.core.Volume(
      `${name}-volume-backup`,
      {
        compartmentId: args.compartmentId,
        availabilityDomain: args.availabilityDomain,
        displayName: 'backup-volume-01',
        sizeInGbs: '50',
      },
      { parent: this }
    )

    const userData = genCloudInit(`${name}-cloudinit`, args.cloudInitConfig, {
      parent: this,
    })

    const instance = new oci.core.Instance(
      `${name}-instance`,
      {
        compartmentId: args.compartmentId,
        availabilityDomain: args.availabilityDomain,
        displayName: 'free-instance',
        shape: 'VM.Standard.A1.Flex',
        sourceDetails: {
          sourceType: 'image',
          sourceId: args.imageId,
        },
        createVnicDetails: {
          subnetId: args.subnetId,
          assignPublicIp: 'true',
        },
        shapeConfig: {
          memoryInGbs: 24,
          ocpus: 4,
        },
        metadata: {
          ssh_authorized_keys: args.sshKeys.join('\n'),
          user_data: userData,
        },
      },
      { parent: this }
    )

    const dataVolumeAttachment = new oci.core.VolumeAttachment(
      `${name}-data-volume-attachment`,
      {
        instanceId: instance.id,
        volumeId: dataVolume.id,
        attachmentType: 'paravirtualized',
        device: '/dev/oracleoci/oraclevdb',
      },
      { parent: this }
    )

    const backupVolumeAttachment = new oci.core.VolumeAttachment(
      `${name}-backup-volume-attachment`,
      {
        instanceId: instance.id,
        volumeId: backupVolume.id,
        attachmentType: 'paravirtualized',
        device: '/dev/oracleoci/oraclevdc',
        isShareable: true,
      },
      { parent: this }
    )

    this.publicIp = instance.publicIp
    this.dataVolumeDevice = dataVolumeAttachment.device.apply((d) => d ?? '')
    this.backupVolumeDevice = backupVolumeAttachment.device.apply(
      (d) => d ?? ''
    )

    this.registerOutputs({
      publicIp: this.publicIp,
      dataVolumeDevice: this.dataVolumeDevice,
      backupVolumeDevice: this.backupVolumeDevice,
    })
  }
}
