import os, re

ROOT = r'c:\webvvv\nebula\l_frontend'
DIRS = ['app', 'components', 'lib', 'src', 'public']
FILES = [os.path.join(ROOT, 'next.config.ts'), os.path.join(ROOT, 'app', 'globals.css')]

for d in DIRS:
    base = os.path.join(ROOT, d)
    for dirpath, _, names in os.walk(base):
        for n in names:
            if n.endswith(('.ts', '.tsx', '.css', '.json', '.js', '.mjs')):
                FILES.append(os.path.join(dirpath, n))

NON_ASCII = re.compile(r'[^\x00-\x7F]+')
# признак порчи: Р/С + не-ASCII (типичный double-encode кириллицы)
SUSPECT = re.compile(r'[РС][^\x00-\x7F]')

def try_repair(run: str):
    """Мojibake-ран: строки UTF-8, прочитанные как cp1251. Обратно: str -> cp1251 bytes -> utf-8."""
    if not SUSPECT.search(run):
        return None
    try:
        b = run.encode('cp1251')
    except UnicodeEncodeError:
        return None
    try:
        fixed = b.decode('utf-8')
    except UnicodeDecodeError:
        return None
    if not re.search(r'[А-Яа-яЁё]', fixed):
        return None
    return fixed

report = []
for p in FILES:
    try:
        with open(p, 'rb') as f:
            raw = f.read()
        text = raw.decode('utf-8')
    except (UnicodeDecodeError, OSError):
        continue
    if not SUSPECT.search(text):
        continue
    count = [0]

    def sub(m):
        fixed = try_repair(m.group(0))
        if fixed is not None:
            count[0] += 1
            return fixed
        return m.group(0)

    new = NON_ASCII.sub(sub, text)
    if count[0]:
        with open(p, 'w', encoding='utf-8', newline='') as f:
            f.write(new)
        report.append((os.path.relpath(p, ROOT), count[0]))

with open(r'c:\webvvv\nebula\_repair_report.txt', 'w', encoding='utf-8') as f:
    for rel, c in sorted(report):
        f.write(f'{rel}\t{c}\n')
print(f'repaired files: {len(report)}, total runs: {sum(c for _, c in report)}')


