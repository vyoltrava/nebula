const fs = require('fs');
const path = require('path');

// Папки, где лежит твой React код (добавь свои, если есть)
const dirsToScan = ['components', 'src', 'app']; 

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    // Рекурсивно лезем внутрь папок
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        scanDir(filePath);
      }
    } 
    // Проверяем только TS/TSX файлы
    else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // 🔥 ПАТТЕРН 1: Смертельный грех с кэшем (кнопка удалить не появляется)
        if (/useState\s*\(\s*\(\)\s*=>\s*[^)]*getCachedUser/.test(line)) {
          console.log(`\n❌ ОШИБКА: Кэш в useState (не обновляется)!`);
          console.log(`📍 Файл: ${filePath}:${index + 1}`);
          console.log(`📝 Строка: ${line.trim()}`);
          console.log(`💡 Фикс: Убери useState. Пиши просто: const user = getCachedUser();`);
        }
        
        // ⚠️ ПАТТЕРН 2: Сравнение ID без приведения к строке
        if (/\.id\s*===\s*[a-zA-Z]/.test(line) && !/String\(/.test(line) && !/===\s*null/.test(line)) {
          console.log(`\n⚠️ ВНИМАНИЕ: Сравнение ID (может быть баг с типами)!`);
          console.log(`📍 Файл: ${filePath}:${index + 1}`);
          console.log(`📝 Строка: ${line.trim()}`);
          console.log(`💡 Фикс: Оберни в String(): String(a.id) === String(b.id)`);
        }
      });
    }
  }
}

console.log('🚀 Сканируем код на скрытые баги...\n');
dirsToScan.forEach(scanDir);
console.log('\n✅ Готово!');