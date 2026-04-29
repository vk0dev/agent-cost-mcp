#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
README_PATH = PROJECT_ROOT / 'README.md'
PACKAGE_JSON_PATH = PROJECT_ROOT / 'package.json'
SMITHERY_URL = 'https://smithery.ai/servers/unfucker/agent-cost-mcp'
SMITHERY_README_MARKER = f'**Smithery:** verified live third-party listing at `{SMITHERY_URL}`'


def load_text(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def check_smithery_presence(readme_text: str) -> str:
    return 'present' if SMITHERY_README_MARKER in readme_text else 'missing'


def check_readme_alignment(readme_text: str) -> tuple[str, list[str]]:
    problems: list[str] = []
    required_phrases = [
        '## Marketplace / Discovery',
        SMITHERY_README_MARKER,
        'Glama and mcp.so are **not** listed here as live presence',
    ]
    for phrase in required_phrases:
        if phrase not in readme_text:
            problems.append(f'missing README marker: {phrase}')

    forbidden_live_claims = [
        'Glama: verified live',
        'mcp.so: verified live',
        'dev.tools: verified live',
    ]
    for phrase in forbidden_live_claims:
        if phrase in readme_text:
            problems.append(f'unsupported live claim present: {phrase}')

    return ('pass' if not problems else 'fail', problems)


def check_repo_identity() -> str:
    package = json.loads(load_text(PACKAGE_JSON_PATH))
    if package.get('name') == '@vk0/agent-cost-mcp' and package.get('homepage') == 'https://vk0dev.github.io/agent-cost-mcp':
        return 'pass'
    return 'fail'


def build_report() -> dict[str, object]:
    readme_text = load_text(README_PATH)
    readme_alignment, readme_problems = check_readme_alignment(readme_text)
    report: dict[str, object] = {
        'project': 'agent-cost-mcp',
        'marketplace_presence_invariants': {
            'smithery': check_smithery_presence(readme_text),
            'readme_marketplace_alignment': readme_alignment,
            'glama': 'manual_only',
            'mcp_so': 'manual_only',
            'dev_tools': 'manual_only',
            'repo_identity_alignment': check_repo_identity(),
        },
    }
    if readme_problems:
        report['alert'] = 'README marketplace claim exceeds verified surface state'
        report['readme_alignment_problems'] = readme_problems
    return report


def main() -> int:
    json.dump(build_report(), sys.stdout, indent=2)
    sys.stdout.write('\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
