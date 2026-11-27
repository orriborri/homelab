#!/usr/bin/env bash
# Fails when a Flux Kustomization file under clusters/homelab/{apps,infrastructure} is not listed in the
# entrypoint (clusters/homelab/kustomization.yaml) and is not in the allowlist of deliberately disabled ones.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
entry=clusters/homelab/kustomization.yaml
allow=scripts/flux-unregistered-allowlist.txt
status=0

for f in clusters/homelab/apps/*.yaml clusters/homelab/infrastructure/*.yaml; do
  rel=${f#clusters/homelab/}
  [[ $(basename "$rel") == kustomization.yaml ]] && continue
  grep -qxF "  - $rel" "$entry" && continue
  grep -qxF "$rel" "$allow" && continue
  echo "not registered: $rel (list it in $entry, or in $allow if it is disabled on purpose)"
  status=1
done

# Keep the allowlist honest: no entries for deleted files or files that are registered now.
while read -r rel; do
  [[ -z $rel || $rel == \#* ]] && continue
  [[ -f clusters/homelab/$rel ]] || { echo "allowlist entry has no file: $rel"; status=1; }
  if grep -qxF "  - $rel" "$entry"; then echo "allowlisted but registered: $rel (remove it from $allow)"; status=1; fi
done < "$allow"
exit $status
