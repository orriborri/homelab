# Amazon Q MCP Setup for Homelab

This document explains how to configure Amazon Q with Model Context Protocol (MCP) to automatically load homelab-specific context and templates for Kubernetes application configurations.

## What is MCP?

Model Context Protocol (MCP) is an open protocol that standardizes how applications provide context to LLMs. It allows Amazon Q to access additional tools and resources, including custom context files that help generate better, more consistent configurations.

## Setup

### Automatic Setup (Recommended)

Run the setup script from the homelab repository:

```bash
cd /path/to/homelab
./scripts/setup-aws-q-mcp.sh
```

This script will:
1. Create the necessary directories
2. Copy the homelab context file to `~/.config/amazon-q/`
3. Configure Amazon Q MCP to load this context automatically
4. Verify the setup

### Manual Setup

If you prefer to set it up manually:

1. **Create the config directory:**
   ```bash
   mkdir -p ~/.config/amazon-q
   ```

2. **Copy the context file:**
   ```bash
   cp docs/aws-q-homelab-context.md ~/.config/amazon-q/homelab-context.md
   ```

3. **Add the MCP server:**
   ```bash
   q mcp add \
     --name homelab-context \
     --command cat \
     --args "$HOME/.config/amazon-q/homelab-context.md" \
     --scope global
   ```

4. **Verify the setup:**
   ```bash
   q mcp list
   q mcp status --name homelab-context
   ```

## Usage

Once configured, Amazon Q will automatically have access to your homelab context when you start a chat session:

```bash
q chat
```

You can then ask Amazon Q to help with:
- Generating Kubernetes application configurations
- Creating Flux CD kustomizations
- Setting up ingress and TLS certificates
- Configuring persistent storage
- Following security best practices

Example prompts:
- "Generate a configuration for a new Plex media server"
- "Create a Kubernetes deployment for Grafana with persistent storage"
- "Help me set up a new app with ingress and TLS certificates"

## Updating the Context

To update the homelab context:

1. **Edit the context file:**
   ```bash
   nano ~/.config/amazon-q/homelab-context.md
   ```

2. **Or sync from the repository:**
   ```bash
   cp docs/aws-q-homelab-context.md ~/.config/amazon-q/homelab-context.md
   ```

The changes will be automatically available in new Amazon Q chat sessions.

## Troubleshooting

### Check MCP Server Status
```bash
q mcp list
q mcp status --name homelab-context
```

### Remove and Re-add MCP Server
```bash
q mcp remove --name homelab-context
q mcp add --name homelab-context --command cat --args "$HOME/.config/amazon-q/homelab-context.md" --scope global
```

### Verify File Exists
```bash
ls -la ~/.config/amazon-q/homelab-context.md
cat ~/.config/amazon-q/homelab-context.md | head -10
```

## MCP Configuration Location

The MCP configuration is stored in:
- **Global scope**: `~/.aws/amazonq/mcp.json`
- **Workspace scope**: `<project>/.amazonq/mcp.json`

## Security Considerations

The MCP server uses a simple `cat` command to read the context file. This is safe as:
- It only reads a specific file you control
- No network access or external commands
- File is stored in your home directory with appropriate permissions

For more information about MCP security, see: https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-mcp-security.html
