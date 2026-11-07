# Historical Amazon Q context setup (requires replacement)

The repository contains [homelab context](aws-q-homelab-context.md) and a historical [setup script](../scripts/setup-aws-q-mcp.sh). The script registers `cat` as an MCP server. The [MCP stdio specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/draft/basic/transports/stdio.mdx) requires protocol messages on standard streams. Printing a Markdown file does not implement that protocol, so this does not provide a functioning MCP context server. Do not use the script as a verified setup procedure.

Provide the context file through your client's supported context or file attachment mechanism, or configure an actual MCP server that exposes the file as a resource. Verify the current client documentation and CLI syntax before configuring it. No Amazon Q client, MCP connection, or local client configuration was tested during this repository documentation audit.
