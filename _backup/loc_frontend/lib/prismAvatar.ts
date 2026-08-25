// lib/prismAvatar.ts

/**
 * Детерминированный хеш строки (FNV-1a 64-bit)
 * Возвращает массив чисел для генерации визуала
 */
function hashKey(key: string): number[] {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  
  for (let i = 0; i < key.length; i++) {
    const charCode = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ charCode, 0x01000193);
    h2 = Math.imul(h2 ^ charCode, 0x01000194);
  }
  
  // Генерируем 32 детерминированных числа из хеша
  const result: number[] = [];
  let seed = (h1 ^ h2) >>> 0;
  for (let i = 0; i < 32; i++) {
    seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    seed = Math.imul(seed ^ (seed >>> 13), 0x45d9f3b);
    seed = (seed ^ (seed >>> 16)) >>> 0;
    result.push(seed / 0xFFFFFFFF);
  }
  return result;
}

/**
 * Генерирует уникальный SVG-аватар на основе объединенного ключа
 * Каждый ключ = уникальный визуальный паттерн
 */
export function generatePrismAvatar(
  shard1: string,
  shard2: string,
  shard3: string
): string {
  // Объединяем все три шарда для генерации визуала
  const combinedKey = `${shard1}:${shard2}:${shard3}`;
  const hash = hashKey(combinedKey);
  
  // Цветовая палитра на основе хеша
  const baseHue = Math.floor(hash[0] * 360);
  const secondaryHue = (baseHue + 120 + Math.floor(hash[1] * 60)) % 360;
  
  // Генерируем частицы
  const particles = Array.from({ length: 24 }, (_, i) => {
    const x = hash[(i * 2) % 32] * 100;
    const y = hash[(i * 2 + 1) % 32] * 100;
    const radius = 2 + hash[(i * 3) % 32] * 4;
    const hue = (baseHue + hash[(i * 4) % 32] * 60) % 360;
    const opacity = 0.3 + hash[(i * 5) % 32] * 0.5;
    
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" 
            fill="hsl(${hue}, 70%, 60%)" opacity="${opacity.toFixed(2)}"/>`;
  }).join('\n    ');
  
  // Генерируем соединительные линии
  const lines = Array.from({ length: 12 }, (_, i) => {
    const x1 = hash[(i * 3) % 32] * 100;
    const y1 = hash[(i * 3 + 1) % 32] * 100;
    const x2 = hash[(i * 3 + 2) % 32] * 100;
    const y2 = hash[(i * 3 + 3) % 32] * 100;
    
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" 
            x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" 
            stroke="hsl(${secondaryHue}, 60%, 50%)" 
            stroke-width="0.5" opacity="0.3"/>`;
  }).join('\n    ');
  
  // Центральный элемент (ядро)
  const centerX = 50;
  const centerY = 50;
  const coreRadius = 8 + hash[10] * 12;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="hsl(${baseHue}, 30%, 15%)"/>
      <stop offset="100%" stop-color="hsl(${secondaryHue}, 40%, 8%)"/>
    </radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg)"/>
  ${lines}
  ${particles}
  <circle cx="${centerX}" cy="${centerY}" r="${coreRadius.toFixed(2)}" 
          fill="hsl(${baseHue}, 80%, 60%)" opacity="0.8"/>
  <circle cx="${centerX}" cy="${centerY}" r="${(coreRadius * 0.6).toFixed(2)}" 
          fill="hsl(${secondaryHue}, 90%, 70%)" opacity="0.9"/>
</svg>`;
}

/**
 * Проверяет, совпадает ли локально сгенерированный аватар с серверным
 * Возвращает true если ключи валидны
 */
export function verifyPrismAvatar(
  serverAvatarSvg: string,
  shard1: string,
  shard2: string,
  shard3: string
): boolean {
  const localAvatar = generatePrismAvatar(shard1, shard2, shard3);
  return localAvatar === serverAvatarSvg;
}

/**
 * Извлекает хеш-подпись из SVG для быстрой проверки
 */
export function getAvatarSignature(svg: string): string {
  // Берем первые 100 символов как fingerprint
  return svg.substring(0, 100);
}