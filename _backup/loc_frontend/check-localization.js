const fs = require('fs');
const path = require('path');

const dirs = ['app', 'components'];

function getFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getFiles(fullPath, files);
        } else if (file.endsWith('.tsx')) {
            files.push(fullPath);
        }
    });
    return files;
}

const localized = [];
const notLocalized = [];

dirs.forEach(dir => {
    const files = getFiles(dir);
    files.forEach(filePath => {
        const code = fs.readFileSync(filePath, 'utf8');
        if (code.includes('useTranslation')) {
            localized.push(filePath);
        } else {
            notLocalized.push(filePath);
        }
    });
});

console.log('\n========================================');
console.log(`✅ ЛОКАЛИЗОВАНО (${localized.length} файлов):`);
console.log('========================================');
localized.forEach(f => console.log('  ' + f));

console.log('\n========================================');
console.log(`❌ НЕ ЛОКАЛИЗОВАНО (${notLocalized.length} файлов):`);
console.log('========================================');
notLocalized.forEach(f => console.log('  ' + f));

console.log('\n========================================');
console.log(`Итого: ${localized.length + notLocalized.length} файлов`);
console.log(`Готово: ${localized.length} | Осталось: ${notLocalized.length}`);
console.log('========================================\n');