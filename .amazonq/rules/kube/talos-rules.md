# Talos Linux Rules

## Common Commands
- Use `talosctl` for node management
- Always specify `--nodes` or use `--endpoints` for multi-node operations
- Config file location: `/home/orre/homelab/_out/talosconfig`

## Best Practices
- Check node health with: `talosctl health --nodes <node-ip>`
- View logs with: `talosctl logs --nodes <node-ip> <service-name>`
- Apply config changes: `talosctl apply-config --nodes <node-ip> --file <config.yaml>`
- Upgrade nodes: `talosctl upgrade --nodes <node-ip> --image <image>`

## Troubleshooting
- Check system services: `talosctl services --nodes <node-ip>`
- View dmesg: `talosctl dmesg --nodes <node-ip>`
- Get node config: `talosctl get machineconfig --nodes <node-ip>`
