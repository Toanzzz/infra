import * as cloudflare from '@pulumi/cloudflare'
import * as pulumi from '@pulumi/pulumi'

export interface HostRedirectArgs {
  /** Host whose requests are redirected, e.g. `www.example.com`. */
  fromHost: string
  /** Origin the path and query are appended to, e.g. `https://example.com`. */
  toOrigin: string
}

export interface ZoneRedirectsArgs {
  zoneId: string
  redirects: HostRedirectArgs[]
}

/**
 * Permanent host redirects for one zone, in its single-redirect entry point
 * ruleset. A zone has one ruleset per phase, so every redirect for the zone
 * belongs in the same component. The source host needs a proxied DNS record.
 */
export class ZoneRedirects extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: ZoneRedirectsArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('custom:cloudflare:ZoneRedirects', name, args, opts)

    new cloudflare.Ruleset(
      `${name}-ruleset`,
      {
        zoneId: args.zoneId,
        name: 'Host redirects',
        kind: 'zone',
        phase: 'http_request_dynamic_redirect',
        rules: args.redirects.map((redirect) => ({
          description: `${redirect.fromHost} -> ${redirect.toOrigin}`,
          expression: `(http.host eq "${redirect.fromHost}")`,
          action: 'redirect',
          actionParameters: {
            fromValue: {
              statusCode: 301,
              preserveQueryString: true,
              targetUrl: {
                expression: `concat("${redirect.toOrigin}", http.request.uri.path)`,
              },
            },
          },
          enabled: true,
        })),
      },
      { parent: this }
    )

    this.registerOutputs()
  }
}
