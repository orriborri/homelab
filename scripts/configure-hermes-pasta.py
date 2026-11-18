#!/usr/bin/env python3
"""Merge the read-only Pasta MCP connection into an existing Hermes profile."""

from pathlib import Path
import os
import shutil
import tempfile
import yaml


path = Path('/opt/data/config.yaml')
config = yaml.safe_load(path.read_text())
entry = {
    'url': 'http://pasta-mcp.hermes.svc.cluster.local:8000/mcp/',
    'headers': {'Authorization': 'Bearer ${PASTA_MCP_TOKEN}'},
    'connect_timeout': 10,
    'timeout': 60,
    'tools': {
        'include': ['search_knowledge', 'get_changes', 'get_entity', 'get_related',
                    'get_evidence', 'get_context', 'get_timeline'],
        'resources': False,
        'prompts': False,
    },
}
servers = config.setdefault('mcp_servers', {})
if servers.get('pasta') == entry:
    print('Pasta MCP configuration already matches')
else:
    if 'pasta' in servers:
        raise SystemExit('Existing Pasta connection differs; review before replacing it')
    backup = path.with_name('config.before-pasta-mcp.yaml')
    if not backup.exists():
        shutil.copy2(path, backup)
    servers['pasta'] = entry
    original = path.stat()
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as handle:
        pending = Path(handle.name)
        os.chmod(pending, original.st_mode & 0o777)
        os.chown(pending, original.st_uid, original.st_gid)
        yaml.safe_dump(config, handle, sort_keys=False)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(pending, path)
    print('Added Pasta MCP; existing profile and model settings preserved')
