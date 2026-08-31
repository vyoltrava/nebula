import os, re

FILES = [
    r"C:\webvvv\nebula\l_frontend\components\stat\PremiumUsernamesTab.tsx",
    r"C:\webvvv\nebula\l_frontend\app\stat\page.tsx",
    r"C:\webvvv\nebula\l_frontend\components\settings\ShopSettings.tsx",
    r"C:\webvvv\nebula\l_frontend\app\admin\roles\page.tsx",
    r"C:\webvvv\nebula\l_frontend\app\owner-panel\page.tsx",
    r"C:\webvvv\nebula\l_frontend\components\Sidebar.tsx",
]

# типичные символы иероглифов mojibake UTF-8<->CP1251/CP1252
GARBLED = ["Ð", "â", "ã", "É", "Ï", "Â", "Â", "«", "»", "±", "¾"]

for f in FILES:
    if not os.path.exists(f):
        print("MISSING", f)
        continue
    with open(f, "rb") as fh:
        data = fh.read()
    txt = None
    for enc in ["utf-8", "cp1251", "cp1252", "latin-1"]:
        try:
            txt = data.decode(enc)
            break
        except Exception:
            continue
    if txt is None:
        print("UNDECODEABLE", f)
        continue
    if any(ch in txt for ch in GARBLED):
        print("=== GARBLED:", os.path.basename(f))
        # покажем каждую строку с иероглифом
        for i, line in enumerate(txt.split("\n"), 1):
            if any(ch in line for ch in GARBLED):
                print(f"  L{i}: {line.strip()[:120]}")
    else:
        print("OK:", os.path.basename(f))
