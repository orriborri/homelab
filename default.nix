{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "homelab";
  buildInputs = with pkgs; [
    gnupg
    kubectl
    sops
    fluxcd
    talosctl
    pre-commit
    git
    kubernetes-helm
    k9s
  ];
}
