#!/usr/bin/env node
/**
 * 🔍 DEEP SCAN — Глубокий анализатор проекта trelod
 * Сканирует backend (Python) и loc_frontend (Next.js/React)
 * Ищет реальные баги, проблемы безопасности и антипаттерны
 */

const fs = require('fs');
const path = require('path');

// ════════════════════════════════════════════════════════════════
// 🎨 ЦВЕТА ДЛЯ КРАСИВОГО ВЫВОДА
// ════════════════════════════════════════════════════════════════
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const severityColors = {
  CRITICAL: colors.bgRed + colors.white,
  WARNING: colors.bgYellow + colors.bold,
  INFO: colors.bgBlue + colors.white,
};

// ════════════════════════════════════════════════════════════════
// ⚙️ КОНФИГУРАЦИЯ
// ════════════════════════════════════════════════════════════════
const SCAN_DIRS = ['backend', 'loc_frontend'];
const IGNORE_DIRS = ['node_modules', '.next', '__pycache__', '.git', 'frontend', 'uploads', 'dist', 'build'];
const SCAN_EXTENSIONS = {
  backend: ['.py'],
  loc_frontend: ['.ts', '.tsx', '.js', '.jsx'],
};

// ════════════════════════════════════════════════════════════════
// 📋 ПРАВИЛА СКАНИРОВАНИЯ
// ════════════════════════════════════════════════════════════════

const BACKEND_RULES = [
  // 🔴 КРИТИЧЕСКИЕ
  {
    name: 'SQL-инъекция (сырой text() без параметров)',
    pattern: /text\(["'][^"']*\{[^}]*\}[^"']*["']\)/,
    severity: 'CRITICAL',
    hint: 'Используй параметризованные запросы: text("SELECT * FROM user WHERE id = :id")',
    category: 'security',
  },
  {
    name: 'Голый except без логирования',
    pattern: /except\s*:\s*\n\s*(?!.*(?:log|print|raise))/,
    severity: 'CRITICAL',
    hint: 'Добавь логирование или re-raise. Пойманные исключения без следа — зло.',
    category: 'error-handling',
  },
  {
    name: 'except Exception без rollback',
    pattern: /except\s+Exception[^:]*:\s*\n(?:(?!session\.rollback|raise).)*session\.commit/,
    severity: 'CRITICAL',
    hint: 'После except ОБЯЗАТЕЛЬНО вызывай session.rollback() перед commit.',
    category: 'database',
  },
  {
    name: 'Жёстко зашитый секрет/пароль',
    pattern: /(?:password|secret|api_key|token)\s*=\s*["'][^"']{8,}["']/i,
    severity: 'CRITICAL',
    hint: 'Используй os.getenv() для всех секретов. Никогда не коммить пароли.',
    category: 'security',
  },
  {
    name: 'session.commit() без try/except',
    pattern: /^\s*session\.commit\(\)\s*$/m,
    severity: 'WARNING',
    hint: 'Оберни commit в try/except с rollback. Иначе при ошибке БД останется в подвешенном состоянии.',
    category: 'database',
  },
  {
    name: 'N+1 запрос (session.get в цикле)',
    pattern: /for\s+\w+\s+in\s+[^:]+:\s*\n\s*[^#]*session\.get\(/,
    severity: 'WARNING',
    hint: 'Используй .where(Model.id.in_(ids)) для массовых запросов.',
    category: 'performance',
  },
  {
    name: 'Отсутствует rate limit на критичном эндпоинте',
    pattern: /@(?:app\.post|app\.put|app\.delete)\([^)]*(?:login|register|password|2fa)/,
    severity: 'WARNING',
    hint: 'Добавь @limiter.limit() для защиты от брутфорса.',
    category: 'security',
    checkContext: (content, match) => {
      // Проверяем, есть ли limiter.limit в следующих 5 строках
      const idx = content.indexOf(match[0]);
      const nextLines = content.substring(idx, idx + 300);
      return !nextLines.includes('limiter.limit');
    },
  },
  {
    name: 'print() вместо logger',
    pattern: /^\s*print\(/m,
    severity: 'INFO',
    hint: 'Используй structlog или logging для продакшена.',
    category: 'logging',
  },
  {
    name: 'Синхронная функция в async эндпоинте',
    pattern: /async\s+def\s+\w+[^:]*:\s*\n(?:(?!await|async).)*time\.sleep/,
    severity: 'WARNING',
    hint: 'time.sleep() блокирует event loop. Используй asyncio.sleep().',
    category: 'performance',
  },
  {
    name: 'Отсутствует валидация входных данных',
    pattern: /def\s+\w+\([^)]*:\s*str\s*=\s*Form\(\)/,
    severity: 'INFO',
    hint: 'Проверяй длину, формат и санитизируй входные строки.',
    category: 'validation',
  },
  {
    name: 'Жёстко зашитый URL',
    pattern: /["']https?:\/\/(?!localhost|127\.0\.0\.1)[^"']+["']/,
    severity: 'INFO',
    hint: 'Используй переменные окружения для URL.',
    category: 'config',
  },
  {
    name: 'Отсутствует проверка прав доступа',
    pattern: /@(?:app\.delete|app\.put|app\.patch)\([^)]*(?:user|post|chat)/,
    severity: 'WARNING',
    hint: 'Проверь, что эндпоинт использует Depends(get_current_user) и проверяет права.',
    category: 'security',
  },
];

const FRONTEND_RULES = [
  // 🔴 КРИТИЧЕСКИЕ
  {
    name: 'getCachedUser() внутри useState',
    pattern: /useState\s*\(\s*\(\)\s*=>\s*[^)]*getCachedUser/,
    severity: 'CRITICAL',
    hint: 'Кэш не обновится! Используй const user = getCachedUser() напрямую.',
    category: 'react',
  },
  {
    name: 'dangerouslySetInnerHTML без санитизации',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html:\s*[^}]*\}\s*\}/,
    severity: 'CRITICAL',
    hint: 'XSS уязвимость! Используй DOMPurify или react-markdown.',
    category: 'security',
  },
  {
    name: 'eval() или new Function()',
    pattern: /\beval\s*\(|new\s+Function\s*\(/,
    severity: 'CRITICAL',
    hint: 'Никогда не используй eval в браузере. Это дыра в безопасности.',
    category: 'security',
  },
  {
    name: 'localStorage с токеном без шифрования',
    pattern: /localStorage\.setItem\s*\(\s*["'](?:token|auth|jwt)/i,
    severity: 'WARNING',
    hint: 'Токен в localStorage уязвим к XSS. Используй httpOnly cookies.',
    category: 'security',
  },
  {
    name: 'Отсутствует key в .map()',
    pattern: /\.map\s*\(\s*\([^)]*\)\s*=>\s*\{?\s*<\w+(?![^>]*key=)/,
    severity: 'WARNING',
    hint: 'Добавь key={uniqueId} для корректного рендеринга списков.',
    category: 'react',
  },
  {
    name: 'useEffect без cleanup (подписки/таймеры)',
    pattern: /useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*(?:addEventListener|setInterval|setTimeout)[^}]*\}\s*,\s*\[/,
    severity: 'WARNING',
    hint: 'Добавь return () => { cleanup } для предотвращения утечек памяти.',
    category: 'react',
    checkContext: (content, match) => {
      // Проверяем, есть ли return cleanup в useEffect
      const idx = content.indexOf(match[0]);
      const block = content.substring(idx, idx + 500);
      return !block.includes('return () =>') && !block.includes('return() =>');
    },
  },
  {
    name: 'fetch без обработки ошибок',
    pattern: /fetch\s*\([^)]*\)\s*\.(?:then|catch)?\s*(?!\s*\.catch)/,
    severity: 'WARNING',
    hint: 'Добавь .catch() или try/catch для обработки сетевых ошибок.',
    category: 'error-handling',
  },
  {
    name: 'console.log в продакшене',
    pattern: /^\s*console\.(log|debug|info)\s*\(/m,
    severity: 'INFO',
    hint: 'Удали или замени на условный логгер.',
    category: 'logging',
  },
  {
    name: 'Использование any в TypeScript',
    pattern: /:\s*any\b|as\s+any\b/,
    severity: 'INFO',
    hint: 'Замени any на конкретный тип или unknown с type guard.',
    category: 'typescript',
  },
  {
    name: 'Жёстко зашитая строка (не i18n)',
    pattern: /(?:placeholder|title|label|text)\s*=\s*["'][A-ZА-Я][^"']{5,}["']/,
    severity: 'INFO',
    hint: 'Используй t("key") для мультиязычности.',
    category: 'i18n',
  },
  {
    name: 'Отсутствует loading/error состояние',
    pattern: /const\s+\[\s*\w+\s*,\s*set\w+\s*\]\s*=\s*useState\s*<[^>]*>\s*\(\s*\[\s*\]\s*\)/,
    severity: 'INFO',
    hint: 'Добавь loading и error states для лучшего UX.',
    category: 'ux',
  },
  {
    name: 'Прямая мутация state',
    pattern: /(?:state|data|items)\s*\.\s*(?:push|pop|splice|shift|unshift)\s*\(/,
    severity: 'WARNING',
    hint: 'Не мутируй state напрямую! Используй setState с новым массивом.',
    category: 'react',
  },
  {
    name: 'Отсутствует type у input',
    pattern: /<input(?![^>]*type=)[^>]*>/,
    severity: 'INFO',
    hint: 'Добавь type="text" | "password" | "email" для доступности.',
    category: 'a11y',
  },
  {
    name: 'Отсутствует alt у img',
    pattern: /<img(?![^>]*alt=)[^>]*>/,
    severity: 'WARNING',
    hint: 'Добавь alt для доступности (screen readers).',
    category: 'a11y',
  },
  {
    name: 'eslint-disable без объяснения',
    pattern: /\/\/\s*eslint-disable(?:-next-line)?\s*$/,
    severity: 'INFO',
    hint: 'Добавь комментарий, почему отключаешь правило.',
    category: 'code-quality',
  },
];

// ════════════════════════════════════════════════════════════════
// 🔍 ФУНКЦИИ СКАНИРОВАНИЯ
// ════════════════════════════════════════════════════════════════

function shouldIgnore(dirName) {
  return IGNORE_DIRS.includes(dirName);
}

function getRulesForDir(dirName) {
  if (dirName === 'backend') return BACKEND_RULES;
  if (dirName === 'loc_frontend') return FRONTEND_RULES;
  return [];
}

function getExtensionsForDir(dirName) {
  return SCAN_EXTENSIONS[dirName] || [];
}

function scanFile(filePath, rules) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];

  for (const rule of rules) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(rule.pattern);
      
      if (match) {
        // Проверяем контекст, если есть checkContext
        if (rule.checkContext && !rule.checkContext(content, match, i)) {
          continue;
        }

        issues.push({
          file: filePath,
          line: i + 1,
          column: line.indexOf(match[0]) + 1,
          severity: rule.severity,
          rule: rule.name,
          hint: rule.hint,
          category: rule.category,
          code: line.trim().substring(0, 100),
        });
      }
    }
  }

  return issues;
}

function scanDirectory(dirPath, rootDir) {
  const results = [];
  const rules = getRulesForDir(rootDir);
  const extensions = getExtensionsForDir(rootDir);

  if (!fs.existsSync(dirPath)) return results;

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    if (shouldIgnore(item)) continue;

    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...scanDirectory(fullPath, rootDir));
    } else if (stat.isFile()) {
      const ext = path.extname(item);
      if (extensions.includes(ext)) {
        const issues = scanFile(fullPath, rules);
        results.push(...issues);
      }
    }
  }

  return results;
}

// ════════════════════════════════════════════════════════════════
// 📊 ФОРМАТИРОВАНИЕ ВЫВОДА
// ════════════════════════════════════════════════════════════════

function formatIssue(issue, index) {
  const sevColor = severityColors[issue.severity] || colors.white;
  const relPath = path.relative(process.cwd(), issue.file);
  
  return `
${colors.bold}${colors.cyan}#${index + 1}${colors.reset} ${sevColor} ${issue.severity} ${colors.reset} ${colors.bold}${issue.rule}${colors.reset}
   ${colors.dim}📍${colors.reset} ${relPath}:${issue.line}:${issue.column}
   ${colors.dim}📝${colors.reset} ${colors.yellow}${issue.code}${colors.reset}
   ${colors.dim}💡${colors.reset} ${colors.green}${issue.hint}${colors.reset}
   ${colors.dim}🏷️${colors.reset} ${colors.magenta}${issue.category}${colors.reset}
`;
}

function printSummary(issues) {
  const bySeverity = {
    CRITICAL: issues.filter(i => i.severity === 'CRITICAL').length,
    WARNING: issues.filter(i => i.severity === 'WARNING').length,
    INFO: issues.filter(i => i.severity === 'INFO').length,
  };

  const byCategory = {};
  issues.forEach(i => {
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
  });

  console.log('\n' + '═'.repeat(70));
  console.log(colors.bold + colors.cyan + '📊 ИТОГОВАЯ СТАТИСТИКА' + colors.reset);
  console.log('═'.repeat(70));

  console.log('\n' + colors.bold + 'По серьёзности:' + colors.reset);
  console.log(`  ${severityColors.CRITICAL} CRITICAL ${colors.reset} ${colors.bold}${bySeverity.CRITICAL}${colors.reset} — требуют немедленного исправления`);
  console.log(`  ${severityColors.WARNING} WARNING  ${colors.reset} ${colors.bold}${bySeverity.WARNING}${colors.reset} — стоит исправить`);
  console.log(`  ${severityColors.INFO} INFO     ${colors.reset} ${colors.bold}${bySeverity.INFO}${colors.reset} — улучшения кода`);

  console.log('\n' + colors.bold + 'По категориям:' + colors.reset);
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${colors.cyan}${cat.padEnd(20)}${colors.reset} ${count} проблем`);
    });

  console.log('\n' + '═'.repeat(70));
  
  if (bySeverity.CRITICAL > 0) {
    console.log(colors.bgRed + colors.white + colors.bold + 
      ` ⚠️  НАЙДЕНО ${bySeverity.CRITICAL} КРИТИЧЕСКИХ ПРОБЛЕМ! ТРЕБУЕТСЯ ВМЕШАТЕЛЬСТВО ` + colors.reset);
  } else if (bySeverity.WARNING > 0) {
    console.log(colors.bgYellow + colors.bold + 
      ` ℹ️  Найдено ${bySeverity.WARNING} предупреждений. Рекомендуется исправить. ` + colors.reset);
  } else {
    console.log(colors.bgBlue + colors.white + colors.bold + 
      ` ✅ Отлично! Критических проблем не найдено. ` + colors.reset);
  }
  
  console.log('═'.repeat(70) + '\n');
}

function printTopIssues(issues, limit = 10) {
  const critical = issues.filter(i => i.severity === 'CRITICAL');
  if (critical.length === 0) return;

  console.log('\n' + colors.bold + colors.red + '🔥 ТОП-10 КРИТИЧЕСКИХ ПРОБЛЕМ:' + colors.reset);
  console.log('─'.repeat(70));
  
  critical.slice(0, limit).forEach((issue, idx) => {
    console.log(formatIssue(issue, idx));
  });
}

// ════════════════════════════════════════════════════════════════
// 🚀 ГЛАВНАЯ ФУНКЦИЯ
// ════════════════════════════════════════════════════════════════

function main() {
  console.log('\n' + '═'.repeat(70));
  console.log(colors.bold + colors.cyan + '🔍 DEEP SCAN — Глубокий анализатор проекта trelod' + colors.reset);
  console.log('═'.repeat(70));
  console.log(colors.dim + `Сканирование директорий: ${SCAN_DIRS.join(', ')}` + colors.reset);
  console.log(colors.dim + `Игнорируемые: ${IGNORE_DIRS.join(', ')}` + colors.reset);
  console.log('─'.repeat(70) + '\n');

  const startTime = Date.now();
  let allIssues = [];
  let filesScanned = 0;

  for (const dir of SCAN_DIRS) {
    const fullPath = path.join(process.cwd(), dir);
    
    if (!fs.existsSync(fullPath)) {
      console.log(colors.yellow + `⚠️  Директория не найдена: ${dir}` + colors.reset);
      continue;
    }

    console.log(colors.bold + colors.blue + `\n📂 Сканирование: ${dir}` + colors.reset);
    
    const issues = scanDirectory(fullPath, dir);
    allIssues.push(...issues);
    
    // Подсчитываем файлы
    const countFiles = (dirPath) => {
      let count = 0;
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        if (shouldIgnore(item)) continue;
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          count += countFiles(itemPath);
        } else {
          const ext = path.extname(item);
          if (getExtensionsForDir(dir).includes(ext)) count++;
        }
      }
      return count;
    };
    
    const fileCount = countFiles(fullPath);
    filesScanned += fileCount;
    
    console.log(colors.dim + `   Проверено файлов: ${fileCount}` + colors.reset);
    console.log(colors.dim + `   Найдено проблем: ${issues.length}` + colors.reset);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '─'.repeat(70));
  console.log(colors.dim + `⏱️  Время сканирования: ${duration}s` + colors.reset);
  console.log(colors.dim + `📄 Всего проверено файлов: ${filesScanned}` + colors.reset);
  console.log(colors.dim + `🐛 Всего найдено проблем: ${allIssues.length}` + colors.reset);

  // Сортируем: CRITICAL → WARNING → INFO
  allIssues.sort((a, b) => {
    const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return order[a.severity] - order[b.severity];
  });

  // Показываем топ критических
  printTopIssues(allIssues, 10);

  // Показываем все WARNING и CRITICAL
  const important = allIssues.filter(i => i.severity !== 'INFO');
  if (important.length > 0) {
    console.log('\n' + colors.bold + colors.yellow + '⚠️  ВСЕ ПРЕДУПРЕЖДЕНИЯ И КРИТИЧЕСКИЕ ПРОБЛЕМЫ:' + colors.reset);
    console.log('─'.repeat(70));
    important.forEach((issue, idx) => {
      console.log(formatIssue(issue, idx));
    });
  }

  // Итоговая статистика
  printSummary(allIssues);

  // Экспорт в JSON для дальнейшего анализа
  const reportPath = path.join(process.cwd(), 'deep-scan-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    duration: parseFloat(duration),
    filesScanned,
    totalIssues: allIssues.length,
    issues: allIssues,
  }, null, 2));

  console.log(colors.dim + `💾 Полный отчёт сохранён: ${reportPath}` + colors.reset + '\n');

  // Exit code: 1 если есть критические проблемы
  const hasCritical = allIssues.some(i => i.severity === 'CRITICAL');
  process.exit(hasCritical ? 1 : 0);
}

// Запуск
main();