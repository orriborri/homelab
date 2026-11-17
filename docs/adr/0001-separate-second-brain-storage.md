# 0001: Separate second-brain storage from application runtimes

- Status: Accepted
- Date: 2026-11-17

## Context

Pasta should retain mail and other source material for a JDex second brain.
Hermes should search that evidence and synthesize cited note proposals. A Pasta
repository initialization failure blocked Hermes startup; mixing executable
source code with durable knowledge also obscured ownership and recovery.

## Decision

Keep a dedicated second-brain document tree with vault, evidence, proposals and
registry directories. Keep application databases and runtime state separately
on block storage. Package Pasta tools in a pinned image. Start Hermes without
Pasta initialization or a dependency on Pasta readiness. Hermes reads canonical
documents and evidence, and writes proposals; publication remains reviewed work.

Retain namespace ownership with Hermes. Disable pruning on the storage Flux
Kustomization and protect namespace/data claims. Do not transfer a live namespace
between application Kustomizations: the initial transfer deleted the namespace
and required recovery from the retained block volume and archived NFS directory.

## Alternatives considered

- A shared source checkout used during startup couples application availability
  to Git ownership, credentials and network access.
- A new empty vault without the existing registry would lose the established
  classification scheme; import the private registry and preserve its disabled
  publication/automation settings instead.
- Storing databases alongside shared documents would expose them to filesystem
  semantics and concurrent writers they are not designed to support.

## Consequences

Source collection and the assistant can fail independently. Backups must cover
both retained evidence and application state. Shared files alone do not supply
an MCP transport or synthesis scheduler. Pasta rollout remains suspended until
its image and Gmail credentials are provisioned. See [operations and remaining
integration work](../second-brain.md) and [storage manifests](../../apps/second-brain/).
