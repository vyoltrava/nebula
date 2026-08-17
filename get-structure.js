const fs = require('fs');
const path = require('path');

function generateTree(dir, prefix = '') {
    let output = '';
    const files = fs.readdirSync(dir, { withFileTypes: true });
    // Папки, которые нужно игнорировать
    const ignore = ['node_modules', '.git', '.next', 'dist', 'build', '.vercel', 'coverage'];
    
    const filteredFiles = files.filter(f => !ignore.includes(f.name));
    
    filteredFiles.forEach((file, index) => {
        const isLast = index === filteredFiles.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        output += prefix + connector + file.name + '\n';
        
        if (file.isDirectory()) {
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            output += generateTree(path.join(dir, file.name), newPrefix);
        }
    });
    return output;
}

const tree = '📁 project-root\n' + generateTree('.');
fs.writeFileSync('project-structure.txt', tree, 'utf8');
console.log('✅ Структура успешно сохранена в файл project-structure.txt');