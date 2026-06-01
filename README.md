# Toan's Personal Infrastructure

Pulumi TypeScript infrastructure for my personal deployment surface.

This stack provisions Oracle Cloud (OCI) resources (a VCN and a free-tier instance with attached data/backup volumes) and synchronizes Cloudflare DNS records to point to the dynamically provisioned instance.

## Cost-Oriented Defaults

The default OCI shape utilizes the Oracle Cloud "Always Free" tier where possible. The instance is configured with cloud-init to mount multiple block volumes (`/data` and `/backup`) for persistent storage, using your configured SSH keys for access.

## Commands

Run these from the infra directory:

```sh
bun install
bun run check:types
bun run preview
bun run up
bun run output
```

## Deployment Instructions

To deploy the infrastructure, you need to configure your Pulumi stack variables.

### 1. Pulumi Configuration

Configure your stack configuration (e.g., `Pulumi.dev.yaml` or `Pulumi.prod.yaml`) with the required variables and credentials. Note that if these aren't set, `src/config.ts` has some sensible fallbacks configured.

```sh
# Required Oracle Cloud (OCI) Configuration
pulumi config set --secret oci:tenancyOcid <your-tenancy-ocid>
pulumi config set --secret oci:userOcid <your-user-ocid>
pulumi config set --secret oci:fingerprint <your-fingerprint>
pulumi config set oci:privateKeyPath <your-private-key-path>
pulumi config set oci:region <your-region> # e.g. ap-singapore-1

# Required Cloudflare Configuration
pulumi config set --secret cloudflare:apiToken <your-cloudflare-api-token>

# Required Project Configuration
pulumi config set toan-infra:oracleCompartmentId <your-compartment-id>
pulumi config set toan-infra:oracleAvailabilityDomain <your-availability-domain>
pulumi config set toan-infra:oracleImageId <your-image-id>

# Provide your SSH keys (JSON array of strings)
pulumi config set --path 'toan-infra:sshKeys[0]' "ssh-ed25519 AAAAC3... user@host"
```

### 2. Provider Permissions

Ensure your tokens and keys have the following minimum permissions:

#### Oracle Cloud (OCI)

The user associated with the provided `userOcid` and API key must have permissions to manage resources within the target compartment.

| Service | Permissions | Reason |
|---------|-------------|--------|
| Networking | `Manage VCNs`, `Manage Subnets`, `Manage Security Lists`, `Manage Route Tables`, `Manage Internet Gateways` | Provision the VCN and necessary networking components. |
| Compute | `Manage Instances`, `Manage Volume Attachments` | Manage the free tier host and its lifecycle. |
| Block Storage | `Manage Volumes` | Provision the block volumes used for `/data` and `/backup` mounts. |

#### Cloudflare (`cloudflare:apiToken`)

Cloudflare API token permissions should be configured in the Cloudflare dashboard.

| Scope | Resource | Access Level | Reason |
|-------|----------|--------------|--------|
| Zone | DNS | Read/Write | Manage DNS A records to route traffic for configured domains (`toan.io`, `ngao.vn`, etc.) to the Oracle instance's public IP. |

### 3. Deploy

Once configured, preview and deploy the stack:

```sh
bun run preview
bun run up
```

## Alternative Auth Options

Instead of setting the auth credentials in Pulumi config, you can export them as environment variables in your shell before running Pulumi commands:

```sh
export OCI_TENANCY_OCID="your_tenancy_ocid"
export OCI_USER_OCID="your_user_ocid"
export OCI_FINGERPRINT="your_fingerprint"
export OCI_PRIVATE_KEY_PATH="your_private_key_path"
export OCI_REGION="your_region"
export CLOUDFLARE_API_TOKEN="your_cloudflare_api_token"
```
