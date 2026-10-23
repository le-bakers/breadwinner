"""Small supplemental current-tree credential check. Never print matched values.

Not a replacement for provider secret scanning or a Git history review.
"""
import re
import subprocess
import sys
from pathlib import Path

patterns = [
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"(?:AKIA|ASIA)[A-Z0-9]{16}"),
    re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})"),
    re.compile(rb"sb_secret_[A-Za-z0-9_-]{20,}"),
    re.compile(rb"AIza[A-Za-z0-9_-]{30,}"),
    re.compile(rb'''(?i)(?:GEMINI_API_KEY|KROGER_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["'][A-Za-z0-9_/-]{24,}["']'''),
]
root = Path(__file__).resolve().parents[1]
listed = subprocess.run(['git', '-c', f'safe.directory={root.as_posix()}', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root,
                        check=True, capture_output=True).stdout.split(b'\0')
issues = []
for raw in listed:
    if not raw:
        continue
    file = root / raw.decode('utf-8')
    if file.suffix.lower() not in {'.py', '.ts', '.js', '.json', '.yaml', '.yml', '.md', '.sql', '.txt', '.html', '.env'}:
        continue
    if not file.is_file():
        continue
    content = file.read_bytes()
    for number, line in enumerate(content.splitlines(), 1):
        if any(pattern.search(line) for pattern in patterns):
            issues.append(f'{file.relative_to(root)}:{number}: possible credential (value suppressed)')
if issues:
    print('\n'.join(issues))
    sys.exit(1)
print('No matching credential patterns in tracked and nonignored text files. Git history was not scanned.')
