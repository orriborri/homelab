# Overwriting SOPS encrypted secrets in the configuration

The repository contains a number of secrets that have been encrypted using my GPG key with Mozilla SOPS. You (and your cluster) won't be able to read these encrypted values, and attempting to deploy them as such will probably fail.

Thankfully you can still open these yaml files containing the secrets, and see what keys (as in key/value pair) they contain.
Search for `sops:` to find remaining encrypted secrets.

## Before replacing secrets

For an existing installation with the private key, edit with `sops path/to/secrets.yaml`; do not remove encryption metadata.

The steps below are for replacing the original owner's secrets in a new installation. Work locally and never commit plaintext. The repository's `.sops.yaml` selects fields to encrypt but does not specify a recipient. Supply your recipient explicitly, for example `sops --encrypt --in-place --pgp YOUR_KEY_FINGERPRINT path/to/secrets-file.yaml`, or configure your own creation-rule recipient. Provision the corresponding private key in the `sops-gpg` Secret in `flux-system`, which the Flux Kustomizations reference. This guide does not verify that a live cluster has that key.

## The procedure for each replacement secrets file is as follows:

- Open up the secrets file in your text editor and remove the entire `sops:` section at the end.

- Replace all encrypted values under `data` or `stringData` (preserve Kubernetes Secret base64 encoding when using `data`) with their plain-text representations. If you're not sure what the values refer to, search for them in the repo. Remove any secrets that you don't think you will need.

- Re-encrypt the file using your GPG key by running: `sops --encrypt --in-place --pgp YOUR_KEY_FINGERPRINT path/to/secrets-file.yaml`

- Next time you can edit the file using `sops path/to/secrets-file.yaml`