#!/usr/bin/env python3
"""Regenerate skills/manifest.json from .claude/commands/*.md.

skills/index.html reads each command file's own content at request time — this
manifest is only the list of filenames, so the page never needs a hand-edited
list of "which skills exist." Add or remove a file in .claude/commands/ and
the next commit updates the manifest to match.

Run standalone, or via the pre-commit hook (which stages the result).
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
COMMANDS_DIR = ROOT / '.claude' / 'commands'
OUT = ROOT / 'skills' / 'manifest.json'

files = sorted(p.name for p in COMMANDS_DIR.glob('*.md')) if COMMANDS_DIR.is_dir() else []
OUT.write_text(json.dumps(files, indent=2) + '\n')
