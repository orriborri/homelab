# Second brain

The second brain is independent of Hermes runtime state and Pasta executable
code. Pasta collects source evidence; Hermes can use that evidence to propose
JDex note updates. Reviewed publication is a separate step.

## Storage and ownership

`apps/second-brain` owns the `hermes` namespace, the existing `pasta-workspace`
20 GiB NFS claim, and an idempotent directory initialization Job. The claim name
is retained to preserve its data. Namespace and claim have Flux pruning disabled;
do not delete or recreate them to rename this storage. Existing repository files
at the volume root are left in place but are no longer used at startup.

The dedicated tree beneath the volume root is:

```text
second-brain/
  vault/       # Canonical JDex documents; initially empty category folders
  evidence/    # Retained originals, including gmail/ attachments and messages
  proposals/   # Generated updates awaiting reviewed publication
  registry/    # Private source registry and local routing projection
```

Both applications see `/second-brain`. Hermes mounts vault, evidence and registry
read-only, with proposals writable. Pasta mounts the tree read-write for source
retention and its existing feed/daily-note generation. Its configuration disables
entity/discovery metadata writes with `write_vault_metadata = false`.

Pasta's `pasta-state` claim uses `syno-storage` block storage and contains
`/var/lib/pasta`: authentication, sync cursors, raw knowledge records and derived
indexes. Do not move SQLite, Tantivy or LanceDB onto NFS. Back up both state and
the shared document tree; raw evidence and sync state are not disposable indexes.
The applications run one replica with `Recreate` to avoid concurrent writers.

## JDex registry import

The source is the existing private OneDrive `jdex-registry.json` under
`00-09 System & migration/00 System management/00.00 JDex - index — entire system`.
Keep the downloaded registry outside this repository. Validate it first:

```sh
python3 scripts/import-second-brain-registry.py /second-brain --check < /private/jdex-registry.json
```

Run the same importer without `--check` as UID/GID 10000 in a trusted maintenance
environment with the volume mounted at `/second-brain`. The importer validates
IDs and paths, retains the complete source as `registry/jdex-registry.source.json`,
creates empty folders matching its canonical OneDrive paths, and writes
`registry/jdex-registry.json` for local routing. It refuses to replace a differing
registry. It does not copy documents, move OneDrive files, allocate IDs, or enable
automation. All local routing entries start with `state: review_required` and
`publication_enabled: false`; resolve those decisions before publication.

## Pasta rollout prerequisites

The Pasta Flux Kustomization is registered but suspended until these are met:

1. Build `apps/pasta/Dockerfile` and publish a pullable image; pin its digest in
   both container entries. The proposed GHCR tag has not been verified pullable.
   For a private image, provision an image-pull Secret and reference it explicitly.
   The image contains pinned binaries and `/opt/llm-wiki`, not a persistent source
   checkout. Its build requires access to `orriborri/pasta`.
2. Provision `pasta-secrets` using SOPS and the existing Flux decryption pattern.
   Supply the selected embedding provider configuration and, for the file keyring,
   `GOG_KEYRING_PASSWORD`. Never commit plaintext credentials. Add the encrypted
   Secret to Pasta's Kustomization and SOPS decryption to its Flux definition.
3. Complete Gmail OAuth for the configured mailbox using the image's `gog`
   executable. Persist its credential store under `/var/lib/pasta/gog` and use
   read-only Gmail authorization. A ChatGPT/Gmail connector login does not supply
   credentials to this container.
4. Remove `spec.suspend: true` from `clusters/homelab/apps/pasta.yaml`, publish,
   and verify a complete fetch/search/retained-attachment cycle.

The configured Gmail schedule is 15 minutes. In this pinned Pasta revision,
enabling a source schedule triggers the shared fetch cycle, which also attempts
other supported sources; this is not an isolated Gmail-only scheduler.

## Hermes integration and publication

Hermes startup never clones or initializes Pasta. Each application depends on
the storage Kustomization, not on the other application's readiness.

The shared files alone do not configure knowledge MCP or automatic synthesis.
The pinned `kb-mcp` is a stdio server, so a separate pod cannot be connected by
inventing an HTTP Service. A supported remote adapter or a deliberately packaged
local MCP runtime is still needed; do not share the live block-backed database
over NFS or grant Hermes arbitrary Kubernetes exec to work around this.

Once that connection is implemented, run the pinned wiki toolkit against
`/second-brain/proposals`, using `/second-brain/registry/jdex-registry.json`.
The cycle is change feed, plan, semantic synthesis, validate/apply, then cursor
advance after completion receipts. Generated facts cite `pasta:evidence:<id>`.
Generated notes must not be re-ingested as original evidence. Publishing reviewed
proposals into canonical vault notes needs a separate controlled writer; Hermes's
canonical vault mount is intentionally read-only during this initial rollout.

Acceptance requires one real email with an attachment to be retained, searchable,
retrievable by evidence ID and usable in a cited JDex proposal. Restart Pasta and
verify no duplicate ingestion; stop Pasta and verify Hermes stays ready.
