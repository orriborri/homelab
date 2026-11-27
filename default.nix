{ pkgs ? import (fetchTarball "https://github.com/NixOS/nixpkgs/archive/2786a2a72088ecf32aea5b3ec52099e6a7cff78f.tar.gz") {} }:

pkgs.mkShell {
  name = "homelab";
  buildInputs = with pkgs; [
    # Kubernetes
    kubectl
    kustomize
    kubernetes-helm
    fluxcd
    talosctl
    k9s
    kubectx
    stern
    kubeconform
    cmctl
    kubectl-cnpg

    # Secrets
    gnupg
    sops

    # General
    bashInteractive
    pre-commit
    git
    jq
    yq-go
    go
  ];

  shellHook = ''
    export KUBECONFIG="''${KUBECONFIG:-$PWD/kubeconfig}"
    export TALOSCONFIG="''${TALOSCONFIG:-$PWD/_out/talosconfig}"
  '';
}
