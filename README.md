# Toan's Personal Infrastructure

Pulumi TypeScript infrastructure for my personal deployment surface.

This stack provisions Oracle Cloud (OCI) resources (a VCN and a free-tier instance with attached data/backup volumes) and synchronizes Cloudflare DNS records to point to the dynamically provisioned instance.

## Cost-Oriented Defaults

The default OCI shape utilizes the Oracle Cloud "Always Free" tier where possible. The instance is configured with cloud-init to mount multiple block volumes (`/data` and `/backup`) for persistent storage, using your configured SSH keys for access.

## Edge proxy

Caddy runs as a container (`projects/caddy/compose.yml`) and fronts everything on the host.

```sh
mise run host:sync-caddy t-oracle
```

That ships the compose file plus `hosts/<host>/caddy/Caddyfile`, validates the config on the host,
and applies it with `caddy reload` so in-flight requests survive.

Upstreams are addressed one of two ways, chosen per site in the Caddyfile:

| Target | Address as | Requires |
|---|---|---|
| Container on the `edge` network | `<service>:<port>`, or a `dynamic a` block when the upstream is scaled during deploys | The stack joins `edge` |
| Host port | `host.docker.internal:<port>` | Published on `0.0.0.0`; a `127.0.0.1`-only publish is unreachable |

`edge` is shared by every stack that wants to be routable by name, and is created once with
`docker network create edge`. Prefix service aliases with the stack name (`coralhub-api`, not `api`):
compose registers the bare service name too, so an unprefixed name collides as soon as a second
stack joins with the same service name, and the proxy silently round-robins between them.

## Application deploys

`projects/<app>/` holds compose files deployed by the `app-*` tasks. CoralHub, Social Indexer,
and Saigon Tour are the exceptions: their compose files live in the
[coralhub](https://github.com/nerd-coder/coralhub),
[social-indexer](https://github.com/nerd-coder/social-indexer), and
[saigon-tour](https://github.com/Toanzzz/saigon-tour) repos and are deployed from there.
This repo owns only their Caddy sites and DNS records. CoralHub and Social Indexer secrets are
managed here:

```sh
mise run secrets-coralhub          # Doppler -> t-oracle:~/apps/coralhub/.env
mise run secrets-social-indexer    # Doppler -> t-oracle:~/apps/social-indexer/.env
```

Saigon Tour writes its own host `.env` (`t-oracle:~/apps/saigon-tour/.env`) with
`bun run credentials` in its repo.

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

# Guided setup for all Pulumi secrets
mise run credentials
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

The Pulumi stack creates and updates DNS records only. Create one
**user-owned API token** with access to both Cloudflare accounts used by this
stack:

- The existing account containing the zones currently managed by this project.
- NerdCoder account `d6bddb74e0e492ddb7854faeaeca690a`, containing
  `nerdcoder.dev` and `socom.vn`.

| Scope | Resource | Access Level | Reason |
|-------|----------|--------------|--------|
| Zone | DNS | Write | Create, update, and delete the managed A, AAAA, and CNAME records. |

The `nerdcoder.dev` and `socom.vn` zones are in Cloudflare account
`d6bddb74e0e492ddb7854faea690a`:

| Zone | Zone ID |
|---|---|
| `nerdcoder.dev` | `d077134ba69695de326a489dc26102c1` |
| `socom.vn` | `df8823b29695d7c0b4e1aca2667e3a45` |

In the token creation form:

1. Select **Zone → DNS → Write**.
2. Under **Zone Resources**, choose **Specific zone resources**.
3. Add the existing zones managed by this project from
   `src/libs/constants.ts`.
4. Add `nerdcoder.dev` and `socom.vn` under the NerdCoder account
   `d6bddb74e0e492ddb7854faeaeca690a`.
5. Leave account-wide, Workers, R2, KV, Pages, SSL, analytics, billing, and
   user permissions unselected.
6. Set an expiration date and name it something descriptive, such as
   `toan-infra-pulumi-dns`.

This pre-fills the correct DNS permission:

- [Create a user-owned DNS Write token](https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=%2A&zoneId=all&name=toan-infra-pulumi-dns)

The template starts with all accounts and all zones selected; narrow the
resource selectors to the zones above in **both accounts** before creating the
token. Cloudflare template URLs only pre-fill the form and do not create the
token.

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
