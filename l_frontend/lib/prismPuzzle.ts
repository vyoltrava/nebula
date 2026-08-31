// lib/prismPuzzle.ts

// Шифрование/расшифровка AES-256-GCM через crypto.ts
import { encryptMessage, decryptMessage } from "./crypto";

interface PrismObject {
  id: number;
  type: 'star' | 'circle' | 'triangle' | 'diamond' | 'hexagon' | 'moon' | 'sun' | 'lightning';
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  opacity: number;
}

// Генерация псевдослучайных чисел из сида (детерминированная)
function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return () => {
    hash = (hash * 9301 + 49297) % 233280;
    return hash / 233280;
  };
}

// Генерация SVG с объектами (та же логика что на бэкенде)
export function generatePrismPuzzleSVG(masterKey: Uint8Array): {
  svg: string;
  objects: PrismObject[];
} {
  // Используем первые 8 байт ключа как сид
  const seed = Array.from(masterKey.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const random = seededRandom(seed);
  
  const objects: PrismObject[] = [];
  const types: PrismObject['type'][] = ['star', 'circle', 'triangle', 'diamond', 'hexagon', 'moon', 'sun', 'lightning'];
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];
  
  // Генерируем 100 объектов
  for (let i = 0; i < 100; i++) {
    objects.push({
      id: i,
      type: types[Math.floor(random() * types.length)],
      x: random() * 800,
      y: random() * 600,
      size: 20 + random() * 40,
      color: colors[Math.floor(random() * colors.length)],
      rotation: random() * 360,
      opacity: 0.3 + random() * 0.7,
    });
  }
  
  // Генерируем SVG
  const svgObjects = objects.map(obj => {
    const transform = `translate(${obj.x}, ${obj.y}) rotate(${obj.rotation})`;
    
    switch (obj.type) {
      case 'star':
        return `<polygon points="0,-${obj.size} ${obj.size*0.3},-${obj.size*0.3} ${obj.size},0 ${obj.size*0.3},${obj.size*0.3} 0,${obj.size} -${obj.size*0.3},${obj.size*0.3} -${obj.size},0 -${obj.size*0.3},-${obj.size*0.3}" fill="${obj.color}" opacity="${obj.opacity}" transform="${transform}"/>`;
      case 'circle':
        return `<circle cx="${obj.x}" cy="${obj.y}" r="${obj.size/2}" fill="${obj.color}" opacity="${obj.opacity}"/>`;
      case 'triangle':
        return `<polygon points="${obj.x},${obj.y-obj.size/2} ${obj.x+obj.size/2},${obj.y+obj.size/2} ${obj.x-obj.size/2},${obj.y+obj.size/2}" fill="${obj.color}" opacity="${obj.opacity}"/>`;
      case 'diamond':
        return `<polygon points="${obj.x},${obj.y-obj.size/2} ${obj.x+obj.size/2},${obj.y} ${obj.x},${obj.y+obj.size/2} ${obj.x-obj.size/2},${obj.y}" fill="${obj.color}" opacity="${obj.opacity}"/>`;
      default:
        return `<rect x="${obj.x-obj.size/2}" y="${obj.y-obj.size/2}" width="${obj.size}" height="${obj.size}" fill="${obj.color}" opacity="${obj.opacity}" transform="${transform}"/>`;
    }
  }).join('\n');
  
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <circle cx="100" cy="100" r="150" fill="white" opacity="0.1"/>
  <circle cx="700" cy="500" r="200" fill="white" opacity="0.1"/>
  ${svgObjects}
  <text x="400" y="50" font-family="Arial" font-size="24" fill="white" opacity="0.8" text-anchor="middle">PRISM PUZZLE</text>
  <text x="400" y="570" font-family="Arial" font-size="16" fill="white" opacity="0.6" text-anchor="middle">Find your object</text>
</svg>`;
  
  return { svg, objects };
}

// Выбор объекта пользователем (возвращает зашифрованный ключ)
export function selectObject(objectId: number, objects: PrismObject[]): string {
  const obj = objects.find(o => o.id === objectId);
  if (!obj) throw new Error('Object not found');
  
  // Ключ = координаты + ID + цвет (уникальный для каждого объекта)
  const keyData = `${obj.id}_${obj.x.toFixed(2)}_${obj.y.toFixed(2)}_${obj.color}`;
  return btoa(keyData);
}

// Верификация выбора
export function verifyObjectSelection(
  selectedKey: string,
  masterKey: Uint8Array
): boolean {
  const { objects } = generatePrismPuzzleSVG(masterKey);
  const decoded = atob(selectedKey);
  const [id, x, y, color] = decoded.split('_');
  
  const obj = objects.find(o => o.id === parseInt(id));
  if (!obj) return false;
  
  // Проверяем, что координаты и цвет совпадают
  return obj.x.toFixed(2) === x && obj.y.toFixed(2) === y && obj.color === color;
}

// Шифрование сообщения мастер-ключом (AES-256-GCM, тот же формат что и crypto.ts)
export { encryptMessage, decryptMessage };