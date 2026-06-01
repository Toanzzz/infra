# Infra AGENTS.md

## Package layout

```
Pulumi.yaml              # Pulumi project, provider defaults, shared config
Pulumi.<stack>.yaml      # Stack-specific config and encrypted secrets
package.json             # Pulumi provider dependencies and infra scripts
README.md                # Operator-facing infrastructure contract
src/
|-- config.ts            # Pulumi config keys, defaults, normalization, and validation
|-- index.ts             # Stack composition, derived values, and exported outputs
|-- libs/                # Optional stateless helpers, schemas, and constants
`-- resources/           # One resource module per infrastructure domain
templates/               # Liquid cloud-init fragments rendered by cloudinit.ts

## Commands

```sh
bun run check:types
bun run up
bun run output
bun run preview
```

Do not run `bun run up` or any other command that mutates a remote Pulumi stack unless the user explicitly asks for it. Prefer `bun run preview` for infrastructure graph validation when credentials and stack config are available.

## Code organization rules

- Keep `src/index.ts` focused on stack orchestration: read normalized config, compose resource modules, define dependencies, derive shared values, and export stack outputs.
- Put reusable infrastructure construction in `src/resources/`. Resource modules should receive all inputs through typed args and should not read Pulumi config directly. Resource modules should be named after the provider and domain they manage, such as `aws.alb.ts`, `aws.asg.ts`, `aws.iam.ts`, etc.
- Keep `src/config.ts` as the only place that creates `new pulumi.Config()` or reads stack config keys. Validate and normalize config there before it reaches resource modules.
- Keep one resource module per ownership area, such as ALB, ASG, IAM, launch template, GitHub sync, Cloudflare, and generated secrets.
- Use `pulumi.Input<T>` and `pulumi.Output<T>` correctly. Prefer `pulumi.interpolate`, `pulumi.output`, and `.apply(...)` over trying to unwrap outputs during deployment planning.
- Preserve stable logical resource names unless replacement is intentional. Renaming Pulumi resources can force deletes/recreates.

## `src/libs/` rules

`src/libs/` is optional. Create it only when the infra app has reusable stateless code that does not belong to a specific resource module.

- Put pure helpers, schemas, constants, type guards, encoders, formatters, normalizers, and deterministic validators in `src/libs/`.
- Do not create Pulumi resources, providers, invokes with deployment side effects, generated secrets, or component-like factories in `src/libs/`.
- Do not read Pulumi config, process environment variables, files, network resources, or stack state from `src/libs/`.
- Do not put cloud-init rendering, host boot workflows, GitHub sync behavior, or infrastructure ownership decisions in `src/libs/`; those belong in `src/resources/` or `src/index.ts`.
- Keep helper APIs input/output oriented and easy to test. If a helper needs Pulumi `Input` or `Output` values, it should transform values without owning resource dependencies.
- Prefer moving a helper into `src/libs/` only after it is reused or clearly independent of a resource module. Do not create placeholder files or folders.

## Pulumi config

`src/config.ts` is the source of truth for stack config.

### Config sync rules

When adding, removing, or renaming Pulumi config values:

1. Update `InfraConfigKey`, `InfraConfig`, defaults, validation, and normalization in `src/config.ts`.
2. Update `README.md` so operator-facing config docs match the real behavior.
3. Update `Pulumi.dev.yaml` and `Pulumi.prod.yaml` only when a value is required or a stack-specific example should be checked in.
4. Keep provider config in provider namespaces such as `aws:` and `github:`. Keep project config under `toan-infra:`.
5. Store sensitive values as Pulumi secrets. Do not commit plaintext secrets to `Pulumi.<stack>.yaml`.
6. Do not add ad hoc config reads inside resource modules; pass normalized values from `src/index.ts`.

## Cloud-init and host boot contract

Keep host boot logic in `templates/cloudinit/*.liquid` and rendering glue in `src/resources/cloudinit.ts`. Do not inline large cloud-init or shell scripts in unrelated resource modules.

## Validation

After infra code changes, run:

```sh
bun run check:types
```

## Scripts rules

See `scripts/AGENTS.md` for rules governing operational and dev-tooling scripts in the `scripts/` directory.
