#!/bin/bash

# Setup script for Amazon Q MCP homelab context
# This script configures Amazon Q to automatically load homelab-specific context

set -e

echo "🚀 Setting up Amazon Q MCP for homelab context..."

# Create config directory
mkdir -p ~/.config/amazon-q

# Copy the context file
cp "$(dirname "$0")/../docs/aws-q-homelab-context.md" ~/.config/amazon-q/homelab-context.md

echo "📄 Copied homelab context to ~/.config/amazon-q/homelab-context.md"

# Add MCP server to Amazon Q
echo "🔧 Adding MCP server to Amazon Q..."
q mcp add \
  --name homelab-context \
  --command cat \
  --args "$HOME/.config/amazon-q/homelab-context.md" \
  --scope global \
  --force

echo "✅ MCP server 'homelab-context' added successfully!"

# Verify the setup
echo "🔍 Verifying MCP server status..."
q mcp status --name homelab-context

echo ""
echo "🎉 Setup complete! Amazon Q will now have access to homelab context."
echo ""
echo "To use this context:"
echo "1. Start Amazon Q: q chat"
echo "2. Ask for help with Kubernetes app configurations"
echo "3. Amazon Q will automatically use the homelab patterns and templates"
echo ""
echo "To update the context:"
echo "1. Edit ~/.config/amazon-q/homelab-context.md"
echo "2. Or run this script again to sync from the repo"
