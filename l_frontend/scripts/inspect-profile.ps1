# Инспектор профиля: белые тексты, кнопки, ник
$f = 'c:\webvvv\nebula\l_frontend\app\user\[id]\page.tsx'
$lines = [System.IO.File]::ReadAllLines($f)

Write-Host '=== getGlowColor / glowStyle (L125-160) ==='
for ($i = 124; $i -lt 160 -and $i -lt $lines.Count; $i++) {
  Write-Host ("{0}: {1}" -f ($i + 1), $lines[$i].TrimEnd())
}

Write-Host ''
Write-Host '=== ALL text-white OCCURRENCES ==='
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -like '*text-white*') {
    $t = $lines[$i].Trim()
    if ($t.Length -gt 170) { $t = $t.Substring(0, 170) }
    Write-Host ("L{0}: {1}" -f ($i + 1), $t)
  }
}

Write-Host ''
Write-Host '=== BUTTONS WITH CLASSES (context) ==='
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -like '*<button*' -or ($lines[$i] -like '*className=*' -and $lines[$i] -like '*rounded-full border*')) {
    $t = $lines[$i].Trim()
    if ($t.Length -gt 190) { $t = $t.Substring(0, 190) }
    Write-Host ("L{0}: {1}" -f ($i + 1), $t)
  }
}

Write-Host ""
Write-Host "=== NICK AREA L595-615 ==="
for ($i = 594; $i -lt 615 -and $i -lt $lines.Count; $i++) {
  Write-Host ("{0}: {1}" -f ($i + 1), $lines[$i].TrimEnd())
}
Write-Host ""
Write-Host "=== FOLLOW BUTTONS FULL ==="
foreach ($n in @(623,624,625,626,674,675,676,677)) {
  Write-Host ("L{0}: {1}" -f $n, $lines[$n-1].TrimEnd())
}
