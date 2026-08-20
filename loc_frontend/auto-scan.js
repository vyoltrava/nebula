const https = require('https');
const http = require('http');

// === КОНФИГУРАЦИЯ ===
const TARGET = 'trelod.vercel.app';
const PROTOCOL = 'https';
const TIMEOUT = 5000; // Таймаут запроса в мс
const REQUEST_DELAY = 300; // Задержка между запросами (мс) для избежания WAF-блокировок

// 1. Список чувствительных файлов и директорий (Fuzzing)
const sensitivePaths = [
  '/', '/login', '/admin', '/admin/chats', '/settings', 
  '/api/health', '/manifest.json', '/robots.txt', '/sitemap.xml',
  '/.env', '/.git/config', '/.gitignore', '/.well-known/security.txt',
  '/backup.zip', '/backup.sql', '/db.sql', '/dump.sql',
  '/config.json', '/config.js', '/firebase-config.json',
  '/phpinfo.php', '/info.php', '/server-status', '/debug',
  '/api/users', '/api/config', '/graphql', '/graphiql'
];

// 2. Ожидаемые заголовки безопасности
const securityHeaders = [
  'strict-transport-security', // HSTS
  'content-security-policy',   // CSP
  'x-frame-options',           // Защита от Clickjacking
  'x-content-type-options',    // Защита от MIME-sniffing
  'x-xss-protection',          // Базовая защита от XSS
  'referrer-policy',           // Контроль передачи Referer
  'permissions-policy'         // Управление доступом к API браузера
];

// 3. Паттерны для поиска утечек чувствительных данных
const sensitivePatterns = [
  { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i, name: 'Hardcoded Password' },
  { regex: /(?:api_key|apikey)\s*[:=]\s*['"][^'"]{10,}['"]/i, name: 'API Key' },
  { regex: /(?:secret|secret_key)\s*[:=]\s*['"][^'"]{8,}['"]/i, name: 'Secret Key' },
  { regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i, name: 'Private Key' },
  { regex: /aws_access_key_id/i, name: 'AWS Credentials' },
  { regex: /(?:connectionstring|db_pass)\s*[:=]\s*['"][^'"]+['"]/i, name: 'Database Connection String' }
];

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function makeRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: TARGET,
      port: PROTOCOL === 'https' ? 443 : 80,
      path: path,
      method: method,
      timeout: TIMEOUT,
      headers: {
        'User-Agent': 'SecurityScanner-Bot/1.0 (Educational)'
      }
    };

    const req = (PROTOCOL === 'https' ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data,
          method: method,
          path: path
        });
      });
    });

    req.on('error', (e) => reject({ error: e.message, path, method }));
    req.on('timeout', () => {
      req.destroy();
      reject({ error: 'Timeout', path, method });
    });

    req.end();
  });
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// === ОСНОВНАЯ ЛОГИКА ===

async function runScanner() {
  console.log(`🤖 Запуск расширенного сканера безопасности для ${PROTOCOL}://${TARGET}\n`);
  
  const report = {
    critical: [],
    warnings: [],
    info: []
  };

  // 1. Проверка базовых заголовков и методов на главной странице
  console.log('🔍 Анализ главной страницы и заголовков...');
  try {
    const mainRes = await makeRequest('/', 'GET');
    
    const missingHeaders = securityHeaders.filter(header => !mainRes.headers[header]);
    if (missingHeaders.length > 0) {
      const msg = `Отсутствуют заголовки безопасности: ${missingHeaders.join(', ')}`;
      console.log(`   ⚠️  ${msg}`);
      report.warnings.push(msg);
    } else {
      console.log(`   ✅ Все основные заголовки безопасности на месте.`);
    }

    const tech = [];
    if (mainRes.headers['x-powered-by']) tech.push(`X-Powered-By: ${mainRes.headers['x-powered-by']}`);
    if (mainRes.headers['server']) tech.push(`Server: ${mainRes.headers['server']}`);
    if (tech.length > 0) {
      const msg = `Раскрытие технологий: ${tech.join(', ')}`;
      console.log(`   ℹ️  ${msg}`);
      report.info.push(msg);
    }

    const optionsRes = await makeRequest('/', 'OPTIONS');
    const allowedMethods = optionsRes.headers['allow'] || optionsRes.headers['access-control-allow-methods'];
    if (allowedMethods) {
      console.log(`   ℹ️  Разрешенные HTTP методы: ${allowedMethods}`);
      if (/PUT|DELETE|TRACE|CONNECT/i.test(allowedMethods)) {
        const msg = `Разрешены потенциально опасные HTTP методы: ${allowedMethods}`;
        console.log(`   ⚠️  ${msg}`);
        report.warnings.push(msg);
      }
    }

  } catch (err) {
    console.log(`   ❌ Ошибка анализа главной страницы: ${err.error}`);
  }

  // 2. Фаззинг чувствительных путей
  console.log('\n🔍 Сканирование чувствительных файлов и директорий...');
  for (const path of sensitivePaths) {
    try {
      const res = await makeRequest(path, 'GET');
      
      if (res.status === 200) {
        // 1. Определяем, не HTML ли это (Soft 404 от Next.js)
        const isHtml = res.data.trim().startsWith('<') || res.data.includes('<html') || res.data.includes('__next');
        
        // 2. Если это HTML, то это не чувствительный файл
        if (isHtml && (path.includes('.env') || path.includes('.zip') || path.includes('.sql') || path.includes('config'))) {
          console.log(`🛡️  [SOFT 404] ${path}: Статус 200, но возвращается HTML. Файла не существует.`);
          report.info.push(`${path}: Файл отсутствует (Soft 404)`);
        } 
        // 3. Реальная проверка на уязвимости (только если это НЕ HTML)
        else {
          console.log(`✅ [200] ${path} (Реальный файл)`);
          
          if (res.data.length < 5 * 1024 * 1024) {
            const foundIssues = [];
            for (const pattern of sensitivePatterns) {
              if (pattern.regex.test(res.data)) {
                foundIssues.push(pattern.name);
              }
            }
            
            if (path.includes('.env') || path.includes('.git') || path.includes('backup') || path.includes('config')) {
              const msg = `[КРИТИЧНО] ${path}: РЕАЛЬНЫЙ файл доступен публично!`;
              console.log(`   🚨 ${msg}`);
              report.critical.push(msg);
            } else if (foundIssues.length > 0) {
              const msg = `[КРИТИЧНО] ${path}: Найдены утечки: ${foundIssues.join(', ')}`;
              console.log(`   🚨 ${msg}`);
              report.critical.push(msg);
            }
          }
        }
      } else if (res.status === 403 || res.status === 401) {
        console.log(`⚠️  [${res.status}] ${path} (Доступ ограничен - это хорошо)`);
      } else if (res.status === 301 || res.status === 302) {
        console.log(`🔄 [${res.status}] ${path} -> ${res.headers.location || 'Redirect'}`);
      } else {
        console.log(`❌ [${res.status}] ${path}`);
      }
      
      await delay(REQUEST_DELAY); // Вежливая задержка

    } catch (err) {
      console.log(`❌ [ОШИБКА] ${path}: ${err.error}`);
    }
  }

  // 3. Итоговый отчет
  console.log('\n' + '='.repeat(60));
  console.log('📊 ИТОГОВЫЙ ОТЧЕТ О БЕЗОПАСНОСТИ');
  console.log('='.repeat(60));
  
  if (report.critical.length > 0) {
    console.log(`\n🚨 КРИТИЧЕСКИЕ УЯЗВИМОСТИ (${report.critical.length}):`);
    report.critical.forEach(item => console.log(`  • ${item}`));
  }
  
  if (report.warnings.length > 0) {
    console.log(`\n⚠️  ПРЕДУПРЕЖДЕНИЯ (${report.warnings.length}):`);
    report.warnings.forEach(item => console.log(`  • ${item}`));
  }

  if (report.info.length > 0) {
    console.log(`\nℹ️  ИНФОРМАЦИЯ (${report.info.length}):`);
    report.info.forEach(item => console.log(`  • ${item}`));
  }

  if (report.critical.length === 0 && report.warnings.length === 0) {
    console.log('\n✅ Явных критических проблем не обнаружено.\n   (Помните: отсутствие находок не гарантирует 100% безопасность).');
  }
  
  console.log('='.repeat(60));
}

// Запуск
runScanner().catch(console.error);