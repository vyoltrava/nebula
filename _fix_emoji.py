import re, os, glob

# Mojibake: Cyrillic char + run of CP1251-decoded UTF-8 bytes.
# Continuation bytes map to U+0080-U+045F / U+2010-U+203A etc.; require at least one U+0080-U+00FF.
pat = re.compile(r'[\u0400-\u04FF][\u0080-\u00FF\u2010-\u203A\u20AC\u2122\u0192\u02C6\u02DC\u2015\u02DD\u0400-\u045F]*')

def ok(h):
    try:
        t = h.encode('cp1251').decode('utf-8')
        return t != h and all(ord(c) >= 0x20 or c in '\n\t' for c in t)
    except Exception:
        return False

fixed_files = 0
total = 0
for ext in ('tsx', 'ts', 'py'):
    for f in glob.glob(f'**/*.{ext}', recursive=True):
        if 'node_modules' in f or os.path.basename(f).startswith('_'):
            continue
        try:
            s = open(f, encoding='utf-8').read()
        except Exception:
            continue
        hits = set(pat.findall(s))
        good = {h for h in hits if ok(h)}
        if not good:
            continue
        out = s
        for h in good:
            out = out.replace(h, h.encode('cp1251').decode('utf-8'))
        open(f, 'w', encoding='utf-8', newline='').write(out)
        fixed_files += 1
        total += len(good)
        print(f'FIXED {f}: {len(good)} seqs')
print(f'--- files fixed: {fixed_files}, sequences: {total}')
