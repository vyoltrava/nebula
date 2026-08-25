# Точечная чистка дублей dark:* токенов после повторного прогона миграции
$ErrorActionPreference = 'Stop'
$root = 'c:\webvvv\nebula\l_frontend'
$files = Get-ChildItem "$root\app", "$root\components" -Recurse -Include *.tsx |
  Where-Object { $_.FullName -notmatch '\\(_backup|__tests__)\\' }

$pairs = @(
  @('dark:border-gray-200 dark:border-white/', 'dark:border-white/'),
  @('dark:bg-gray-100 dark:bg-white/',       'dark:bg-white/'),
  @('dark:bg-gray-50 dark:bg-[#',            'dark:bg-[#'),
  @('dark:hover:bg-gray-100 dark:hover:bg-white/', 'dark:hover:bg-white/'),
  @('dark:text-gray-500 dark:text-white/',   'dark:text-white/'),
  @('dark:text-gray-600 dark:text-white/',   'dark:text-white/'),
  @('dark:text-gray-700 dark:text-white/',   'dark:text-white/'),
  @('dark:text-gray-800 dark:text-white/',   'dark:text-white/'),
  @('dark:placeholder-gray-400 dark:placeholder-white/', 'dark:placeholder-white/'),
  @('dark:hover:text-gray-900 dark:text-white', 'dark:text-white'),
  @('dark:text-gray-900 dark:text-white',    'dark:text-white')
)

$fixed = 0
foreach ($f in $files) {
  $t = [System.IO.File]::ReadAllText($f.FullName)
  $orig = $t
  foreach ($p in $pairs) {
    while ($t.Contains($p[0])) { $t = $t.Replace($p[0], $p[1]) }
  }
  if ($t -cne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $t, (New-Object System.Text.UTF8Encoding($false)))
    $fixed++
    Write-Host ("FIXED: " + $f.FullName.Replace($root, ''))
  }
}
Write-Host "Total fixed: $fixed"
