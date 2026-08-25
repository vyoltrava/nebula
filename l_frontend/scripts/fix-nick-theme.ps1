# 🌗 v2: однострочные EOL-независимые замены (ники по теме)
$ErrorActionPreference = 'Stop'
$root = 'c:\webvvv\nebula\l_frontend'

$HOOK = 'const { resolvedTheme } = useTheme();'

function Import-Line([string]$t) {
  $wrong = 'import { nickGlowStyle } from "@/lib/nickGlow";'
  $right = 'import { resolveNickColor } from "@/lib/nickGlow";'
  if ($t.Contains($wrong)) { return $t.Replace($wrong, $right) }
  if ($t.Contains($right)) { return $t }
  $idx = $t.IndexOf('"use client";')
  $nl = $t.IndexOf("`n", $idx)
  $ins = 'import { useTheme } from "next-themes";' + "`n" + $right + "`n"
  return $t.Insert($nl + 1, $ins)
}

function Insert-Hook([string]$t, [string]$anchor) {
  if ($t.Contains($HOOK)) { return $t }
  $idx = $t.IndexOf($anchor)
  if ($idx -lt 0) { Write-Host 'HOOK ANCHOR MISS'; return $t }
  return $t.Insert($idx, '  ' + $HOOK + "`n")
}

foreach ($f in @(
  "$root\app\admin\technical\page.tsx",
  "$root\app\messages\[id]\page.tsx",
  "$root\app\messages\page.tsx",
  "$root\components\admin\section\TechUsersSection.tsx"
)) {
  $t = [System.IO.File]::ReadAllText($f)
  $orig = $t
  $t = Import-Line $t
  $t = Insert-Hook $t '  function glowStyle(user: any)'
  $o = 'const c = getGlowColor(user);'
  $n = 'const c = resolveNickColor(getGlowColor(user), resolvedTheme);'
  $c = ([regex]::Matches($t, [regex]::Escape($o))).Count
  $t = $t.Replace($o, $n)
  if ($t -cne $orig) {
    [System.IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ("OK: " + (Split-Path $f -Leaf) + " (color x$c)")
  } else { Write-Host ("NOCHANGE: " + (Split-Path $f -Leaf)) }
}

$f = "$root\app\user\[id]\page.tsx"
$t = [System.IO.File]::ReadAllText($f)
$orig = $t
$t = Import-Line $t
$t = Insert-Hook $t '  function glowStyle(user: any)'
$o = 'const c = getGlowColor(user);'
$n = 'const c = resolveNickColor(getGlowColor(user), resolvedTheme);'
$c = ([regex]::Matches($t, [regex]::Escape($o))).Count
$t = $t.Replace($o, $n)
if ($t -cne $orig) {
  [System.IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "OK: user[id] (color x$c)"
} else { Write-Host 'NOCHANGE: user[id]' }

$f = "$root\components\Post.tsx"
$t = [System.IO.File]::ReadAllText($f)
$orig = $t
$t = Import-Line $t
$a1 = 'role?: { name: string; color: string } | null): React.CSSProperties | undefined {'
$b1 = 'role?: { name: string; color: string } | null, theme?: string): React.CSSProperties | undefined {'
$c1 = ([regex]::Matches($t, [regex]::Escape($a1))).Count
$t = $t.Replace($a1, $b1)
$a2 = 'const color = getGlowColor(is_admin, is_moderator, role);'
$b2 = 'const color = resolveNickColor(getGlowColor(is_admin, is_moderator, role), theme);'
$c2 = ([regex]::Matches($t, [regex]::Escape($a2))).Count
$t = $t.Replace($a2, $b2)
if ($t -cne $orig) {
  [System.IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "OK: Post.tsx (sig x$c1, color x$c2)"
} else { Write-Host 'NOCHANGE: Post' }
