# export-files.ps1
$outputFile = "project-files.txt"

# Очистить или создать файл
if (Test-Path $outputFile) { Remove-Item $outputFile }
New-Item -Path $outputFile -ItemType File

# Функция для добавления файла в вывод
function Add-File {
    param($filePath)
    if (Test-Path $filePath) {
        "`n" + "="*80 >> $outputFile
        "FILE: $filePath" >> $outputFile
        "="*80 >> $outputFile
        Get-Content $filePath -Encoding UTF8 >> $outputFile
    } else {
        "`n⚠️ Файл не найден: $filePath" >> $outputFile
    }
}

# Бэкенд
Add-File "backend/models.py"
Add-File "backend/database.py"
Add-File "backend/main.py"

# Фронтенд
Add-File "app/messages/page.tsx"
Add-File "app/messages/[id]/page.tsx"
Add-File "components/Avatar.tsx"
Add-File "components/CreateGroupModal.tsx"
Add-File "lib/api.ts"
Add-File "lib/types.ts"

Write-Host "✅ Файл создан: $outputFile"