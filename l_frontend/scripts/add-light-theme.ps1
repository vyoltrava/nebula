# ============================================================
#  One-shot миграция: тёмная тема -> Light/Dark (Tailwind dual classes)
#  Добавляет light-вариант к жёстко заданным тёмным классам.
#  Guard-ы защищают белый текст на цветных/акцентных подложках.
#  Запуск: powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/add-light-theme.ps1
#  Точечно: ... -OnlyFiles @("MessageBubble.tsx","AuthGuard.tsx")
# ============================================================
param(
  [string[]]$OnlyFiles = @()
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$targets = Get-ChildItem "$root\app", "$root\components" -Recurse -Include *.tsx, *.ts |
  Where-Object { $_.FullName -notmatch '\\(_backup|__tests__|node_modules)\\' }

if ($OnlyFiles.Count -gt 0) {
  $targets = $targets | Where-Object { $OnlyFiles -contains $_.Name }
}


# Префикс вариантности (hover:/focus:/...) — колон внутри, вся группа опциональна
$P = '((?:(?:hover|focus|active|group-hover):)?)'

# Строки с этими маркерами НЕ трогаем в text-* правилах (там белый текст
# лежит на цветной подложке и должен остаться белым в обеих темах)
$accentGuard = @(
  'bg-violet','bg-purple','bg-indigo','from-purple','from-violet','from-indigo',
  'via-purple','via-violet','to-purple','to-violet',
  'bg-blue-5','bg-red-5','bg-green-5','bg-emerald-5','bg-rose-5','bg-pink-5','bg-cyan-5',
  'bg-[#8b5cf6]','bg-[#7c3aed]','bg-[#7b3ff2]','bg-[#e74c3c]','bg-[#2ecc71]',
  'bg-[#f39c12]','bg-[#3498db]','bg-[#3b82f6]',
  'badge-founder','badge-developer','style='
)
# Строки с этими маркерами не трогаем в bg-white/N правилах (оверлеи поверх фото)
$overlayGuard = @('inset-0','backdrop-blur','object-cover')

function Test-Guard([string]$line, [string[]]$markers) {
  $lower = $line.ToLower()
  foreach ($m in $markers) { if ($lower.Contains($m)) { return $true } }
  return $false
}

function Get-LightHex([string]$hexLower) {
  if (@('101010','0d0d10','050508','0f1225','050714','121212','171717') -contains $hexLower) { return 'gray-50' }
  if (@('1c1c1f','1e1e23','22222a','26262b','2a2a2f') -contains $hexLower) { return 'gray-100' }
  if (@('1f1f23','1a1a1a','18181b') -contains $hexLower) { return 'white' }
  return $null
}

$totalFiles = 0
foreach ($f in $targets) {
  $text = [System.IO.File]::ReadAllText($f.FullName)

  # ---------- Правила без guard-ов ----------

  # Сплошные тёмные фоны (+ суффикс /прозрачность):
  # bg-[#171717]/80 -> bg-gray-50 dark:bg-[#171717]/80
  $text = [regex]::Replace($text, $P + 'bg-\[#([0-9a-fA-F]{3,8})\](/\d{1,3})?', {
    param($m)
    $light = Get-LightHex ($m.Groups[2].Value.ToLower())
    if ($light) {
      $p = $m.Groups[1].Value; $op = $m.Groups[3].Value
      "${p}bg-$light dark:${p}bg-[#$($m.Groups[2].Value)]$op"
    } else { $m.Value }
  })

  # Границы: border-white/10 -> border-gray-200 dark:border-white/10
  $text = [regex]::Replace($text, $P + 'border-white/(\d{1,3})(?![\d.])', {
    param($m)
    $n = [int]$m.Groups[2].Value
    $light = if ($n -ge 40) { 'gray-300' } else { 'gray-200' }
    "$($m.Groups[1].Value)border-$light dark:$($m.Groups[1].Value)border-white/$n"
  })
  $text = [regex]::Replace($text, $P + 'border-white/\[(0?\.\d+)\]', {
    param($m)
    "$($m.Groups[1].Value)border-gray-200 dark:$($m.Groups[1].Value)border-white/[$($m.Groups[2].Value)]"
  })

  # Разделители: divide-white/10 -> divide-gray-200 dark:divide-white/10
  $text = [regex]::Replace($text, 'divide-white/(\d{1,3})(?![\d.])', {
    param($m)
    $n = [int]$m.Groups[1].Value
    $light = if ($n -ge 40) { 'gray-300' } else { 'gray-200' }
    "divide-$light dark:divide-white/$n"
  })

  # Placeholder: placeholder-white/25 -> placeholder-gray-400 dark:placeholder-white/25
  $text = [regex]::Replace($text, 'placeholder-white/(\d{1,3})(?![\d.])', {
    param($m) "placeholder-gray-400 dark:placeholder-white/$($m.Groups[1].Value)"
  })

  # Светлые акцентные тексты/поверхности плохо видны на белом:
  # text-cyan-400 -> text-cyan-600 dark:text-cyan-400 (оттенки 300/400 -> 600 для light)
  # Не трогает: классы с /альфой и уже готовые dark:* цепочки
  $accentShadeP = '(?<![:\w-])((?:(?:hover|group-hover|focus|active):)?)((?:text|bg|border|ring|from|via|to|decoration|fill|stroke)-)((?:red|green|blue|yellow|cyan|sky|teal|emerald|lime|amber|orange|purple|violet|fuchsia|pink|indigo)-)(300|400)(?![\w/-])'
  $text = [regex]::Replace($text, $accentShadeP, {
    param($m)
    "$($m.Groups[1].Value)$($m.Groups[2].Value)$($m.Groups[3].Value)600 dark:$($m.Groups[1].Value)$($m.Groups[2].Value)$($m.Groups[3].Value)$($m.Groups[4].Value)"
  })

  # ---------- Правила c построчными guard-ами ----------
  $lines = $text.Split("`n")
  $result = New-Object System.Collections.Generic.List[string]
  foreach ($raw in $lines) {
    $line = $raw.TrimEnd("`r")
    $cr = if ($raw.EndsWith("`r")) { "`r" } else { "" }
    $orig = $line

    # Полупрозрачные белые подложки: bg-white/5 -> bg-gray-100 dark:bg-white/5
    if (-not (Test-Guard $line $overlayGuard)) {
      $line = [regex]::Replace($line, $P + 'bg-white/(\d{1,2})(?![\d.])', {
        param($m)
        $n = [int]$m.Groups[2].Value
        if ($n -gt 30) { return $m.Value } # плотные frost-оверлеи не трогаем
        $light = if ($n -ge 21) { 'gray-200' } else { 'gray-100' }
        "$($m.Groups[1].Value)bg-$light dark:$($m.Groups[1].Value)bg-white/$n"
      })
    }

    # Текст с альфой: text-white/60 -> text-gray-500 dark:text-white/60
    if (-not (Test-Guard $line $accentGuard)) {
      $line = [regex]::Replace($line, '((?:(?:hover|group-hover|focus):)?)text-white/(\d{1,3})(?![\d.])', {
        param($m)
        $n = [int]$m.Groups[2].Value
        $light = if ($n -ge 70) { 'gray-800' } elseif ($n -ge 46) { 'gray-600' } else { 'gray-500' }
        "$($m.Groups[1].Value)text-$light dark:$($m.Groups[1].Value)text-white/$n"
      })
      # Чистый текст: text-white -> text-gray-900 dark:text-white
      $line = [regex]::Replace($line, '(?<![-\w])text-white(?![-/\w])', 'text-gray-900 dark:text-white')
    }

    $result.Add($line + $cr)
  }
  $newText = $result -join "`n"

  if ($newText -cne $text) {
    [System.IO.File]::WriteAllText($f.FullName, $newText, (New-Object System.Text.UTF8Encoding($false)))
    $totalFiles++
  }
}
Write-Host "Files modified: $totalFiles"
