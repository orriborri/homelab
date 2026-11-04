# Flux bootstrap

The new Talos cluster starts with Flux reconciling only its own controllers.
`clusters/homelab/kustomization.yaml` includes `flux-system`; the infrastructure
and application registration files remain in Git for staged activation.

## Bootstrap settings

- Repository: `orriborri/homelab`, branch `main`.
- Reconciliation path: `./clusters/homelab`.
- Flux version: `v2.10.0`, matching the checked-in controller manifests.
- Namespace: `flux-system`.
- Components: source, Kustomize, Helm, and notification controllers.
- Kubernetes credentials: local `.talos-local/kubeconfig`.

The bootstrap command commits the generated synchronization manifests and
configures a read-only GitHub SSH deploy key. Run it with a valid `GITHUB_TOKEN`
whose permissions allow repository writes and deploy-key management:

```bash
flux bootstrap github \
  --kubeconfig .talos-local/kubeconfig \
  --owner orriborri --repository homelab --personal \
  --branch main --path clusters/homelab --version v2.10.0
```

The initial environment token was rejected by GitHub. The stored GitHub CLI login
was valid and was used for bootstrap instead. Credentials remain local or in
Kubernetes Secrets; token and private-key values are not committed.

## Activate infrastructure and applications later

The encrypted configuration cannot yet be decrypted with the available local
keyring. Before restoring workload registrations:

1. Import the private GPG key that decrypts the repository's SOPS files, or replace
   their contents and encrypt them with an available key. See [SOPS](sops.md).
2. Provision its private key as Secret `sops-gpg` in namespace `flux-system`.
3. Review `cluster-config.yaml`, decrypt and review `cluster-secrets.yaml`, and
   provision `cluster-secrets` before enabling the substitution patch below.
4. Restore `cluster-config.yaml` and `cluster-secrets.yaml` to the root
   Kustomization, while retaining `flux-system`.
5. Restore the following patch in `clusters/homelab/flux-system/kustomization.yaml`.
   Keep it outside generated `gotk-sync.yaml` so bootstrap does not overwrite it.
6. Enable infrastructure registrations in dependency order, then applications,
   after checking NAS storage, DNS, external credentials, and address allocations.

```yaml
patches:
  - patch: |
      apiVersion: kustomize.toolkit.fluxcd.io/v1
      kind: Kustomization
      metadata:
        name: flux-system
        namespace: flux-system
      spec:
        decryption:
          provider: sops
          secretRef:
            name: sops-gpg
        postBuild:
          substitute: {}
          substituteFrom:
            - kind: Secret
              name: cluster-secrets
```

Do not enable all existing registrations merely to test Flux. They include real
DNS integrations, storage requirements, encrypted credentials, and applications
that are not prerequisites for Flux itself.

## Verify reconciliation

```bash
flux --kubeconfig .talos-local/kubeconfig get all -A
kubectl --kubeconfig .talos-local/kubeconfig -n flux-system get pods
kubectl --kubeconfig .talos-local/kubeconfig -n flux-system \
  get gitrepositories,kustomizations
```

Both the `flux-system` GitRepository and Kustomization should report `Ready=True`
at the current Git revision. All four controller deployments should be available.
No homelab workloads are expected at this bootstrap stage.
