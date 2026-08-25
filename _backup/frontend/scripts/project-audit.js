const fs = require('fs');
const path = require('path');

const dirsToScan = ['src', 'components', 'lib', 'app']; // Папки вашего проекта
const ignoreDirs = ['node_modules', '.next', '.git', 'out', 'build'];

let report = {
    monoliths: [],
    missingTransitions: [],
    useEffectLeaks: [],
    typeAnys: [],
    cryptoRisks: [],
    stats: { totalFiles: 0, totalLines: 0 }
};

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            if (!ignoreDirs.includes(f)) walkDir(dirPath, callback);
        } else {
            if (/\.(tsx|ts|jsx|js)$/.test(f)) callback(path.join(dir, f));
        }
    });
}

function analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    report.stats.totalFiles++;
    report.stats.totalLines += lines.length;

    const relativePath = filePath.replace(process.cwd(), '').replace(/\\/g, '/');

    // 1. Компоненты-монолиты (больше 400 строк)
    if (lines.length > 400) {
        report.monoliths.push({ file: relativePath, lines: lines.length });
    }

    // 2. Поиск hover-эффектов без transition (UX/Анимации)
    // Ищем строки, где есть hover:bg- или hover:text-, но в той же строке/блоке нет transition
    const hoverRegex = /hover:(bg|text|border|opacity|scale)-[a-zA-Z0-9\-\/]+/g;
    const transitionRegex = /transition(-[a-zA-Z0-9\-]+)?/;
    
    lines.forEach((line, idx) => {
        if (hoverRegex.test(line) && !transitionRegex.test(line)) {
            // Проверяем соседние строки (вдруг transition на строке выше/ниже в шаблонной строке)
            const context = lines.slice(Math.max(0, idx - 2), idx + 3).join(' ');
            if (!transitionRegex.test(context)) {
                report.missingTransitions.push({ file: relativePath, line: idx + 1, snippet: line.trim().substring(0, 80) });
            }
        }
    });

    // 3. Потенциальные утечки памяти (addEventListener / setInterval без return в useEffect)
    if (content.includes('addEventListener') || content.includes('setInterval')) {
        const useEffectMatches = content.match(/useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/g) || [];
        useEffectMatches.forEach(effect => {
            if ((effect.includes('addEventListener') || effect.includes('setInterval')) && !effect.includes('return () =>')) {
                report.useEffectLeaks.push({ file: relativePath, snippet: effect.substring(0, 100).replace(/\n/g, ' ') });
            }
        });
    }

    // 4. Злоупотребление типом `any` (Скрытые баги)
    const anyMatches = content.match(/:\s*any(\[\])?/g);
    if (anyMatches && anyMatches.length > 5) {
        report.typeAnys.push({ file: relativePath, count: anyMatches.length });
    }

    // 5. Крипто-риски (Ищем localStorage для ключей)
    if (content.includes('localStorage') && (content.includes('key') || content.includes('token') || content.includes('secret') || content.includes('password'))) {
        report.cryptoRisks.push({ file: relativePath, warning: "Использование localStorage для чувствительных данных (ключей/токенов). XSS может их украсть." });
    }
}

// Запуск
console.log('🔍 Сканирование проекта...\n');
dirsToScan.forEach(dir => walkDir(dir, analyzeFile));

// Вывод отчета
console.log('=== 📊 ОТЧЕТ АУДИТА ===');
console.log(`Всего файлов: ${report.stats.totalFiles} | Всего строк: ${report.stats.totalLines}\n`);

console.log('🏗 1. КОМПОНЕНТЫ-МОНОЛИТЫ (>400 строк):');
report.monoliths.length ? report.monoliths.forEach(m => console.log(`   - ${m.file} (${m.lines} строк)`)) : console.log('   ✅ Не найдено');

console.log('\n✨ 2. ОТСУТСТВИЕ ПЛАВНЫХ АНИМАЦИЙ (hover без transition):');
report.missingTransitions.length ? report.missingTransitions.slice(0, 10).forEach(m => console.log(`   - ${m.file}:${m.line} -> ${m.snippet}`)) : console.log('   ✅ Не найдено');
if (report.missingTransitions.length > 10) console.log(`   ... и еще ${report.missingTransitions.length - 10} мест.`);

console.log('\n⚠️  3. ПОТЕНЦИАЛЬНЫЕ УТЕЧКИ ПАМЯТИ (useEffect без cleanup):');
report.useEffectLeaks.length ? report.useEffectLeaks.forEach(l => console.log(`   - ${l.file} -> ${l.snippet}...`)) : console.log('   ✅ Не найдено');

console.log('\n🔴 4. КРИПТОГРАФИЧЕСКИЕ РИСКИ:');
report.cryptoRisks.length ? report.cryptoRisks.forEach(r => console.log(`   - ${r.file}: ${r.warning}`)) : console.log('   ✅ Не найдено');

console.log('\n🦺 5. ИЗБЫТОК ТИПА `any` (>5 на файл):');
report.typeAnys.length ? report.typeAnys.forEach(t => console.log(`   - ${t.file} (${t.count} раз)`)) : console.log('   ✅ Не найдено');

console.log('\n======================');
console.log('Скопируйте этот вывод и отправьте его AI для разбора!');