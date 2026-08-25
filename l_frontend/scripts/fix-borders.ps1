# 🌗 Обводки: border-gray-200 -> border-line (тёплый беж) в dual-парах
# + добивка нейтральных кнопок, пропущенных guard-ом (raw text-white/N рядом с цветным hover)
$ErrorActionPreference = 'Stop'
$root = 'c:\webvvv\nebula\l_frontend'
$files = Get-ChildItem "$root\app", "$root\components" -Recurse -Include *.tsx |
  Where-Object { $_.FullName -notmatch '\\(_backup|__tests__)\\' }

$totBorder = 0; $totDivide = 0; $totText = 0; $nf = 0
foreach ($f in $files) {
  $t = [System.IO.File]::ReadAllText($f.FullName)
  $orig = $t

  $c = ([regex]::Matches($t, [regex]::Escape('border-gray-200 dark:border-white/'))).Count
  $totBorder += $c
  $t = $t.Replace('border-gray-200 dark:border-white/', 'border-line dark:border-white/')

  $c2 = ([regex]::Matches($t, [regex]::Escape('divide-gray-200 dark:divide-white/'))).Count
  $totDivide += $c2
  $t = $t.Replace('divide-gray-200 dark:divide-white/', 'divide-line dark:divide-white/')

  # Нейтральные кнопки: raw text-white/N на строке с цветным hover:bg-*-500/10
  # и БЕЗ цветных подложек (фиолетовые/градиенты остаются белыми)
  $lines = $t.Split("`n")
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($raw in $lines) {
    $line = $raw.TrimEnd("`r")
    $cr = if ($raw.EndsWith("`r")) { "`r" } else { "" }
    if ($line -match '(?<![-:\w])text-white/(\d{1,3})(?![\d.])' -and
        $line -match 'hover:bg-(?:red|emerald|blue|orange|cyan|pink|green|teal|sky|amber)-\d00?/' -and
        $line -notmatch 'purple|violet|indigo|from-|via-|to-|#8b5cf6|#8B5CF6|style=') {
      $line = [regex]::Replace($line, '(?<![-:\w])text-white/(\d{1,3})(?![\d.])', {
        param($m)
        $n = [int]$m.Groups[1].Value
        $light = if ($n -ge 66) { 'gray-600' } elseif ($n -ge 36) { 'gray-500' } else { 'gray-400' }
        "text-$light dark:$($m.Value)"
      })
    }
    $out.Add($line + $cr)
  }
  $t = $out -join "`n"

  if ($t -cne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $t, (New-Object System.Text.UTF8Encoding($false)))
    $nf++
  }
}
Write-Host "Files: $nf | border->line: $totBorder | divide->line: $totDivide"
