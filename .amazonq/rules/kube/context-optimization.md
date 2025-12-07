# Context Optimization Rules

## Smart Context Loading
- Load only essential files initially (cluster-config, .envrc)
- Use knowledge base for configuration patterns and templates
- Load specific app/infrastructure configs only when referenced
- Execute commands for real-time cluster status

## Query-Based Context
- **Status queries**: Execute kubectl/flux commands for current state
- **Config queries**: Use knowledge base search for patterns
- **Troubleshooting**: Load recent logs and events dynamically
- **App creation**: Load templates from knowledge base

## Memory Management
- Cache frequently accessed configs (30min TTL)
- Limit context window to 8000 tokens
- Auto-cleanup old context entries
- Prioritize recent and relevant information

## Performance Tips
- Use `kubectl get` with field selectors for targeted queries
- Prefer `flux get all -A` over loading all Flux manifests
- Load app configs on-demand when working on specific applications
- Use knowledge base search instead of loading entire directories
