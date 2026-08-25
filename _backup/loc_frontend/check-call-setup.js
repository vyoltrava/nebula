// check-call-setup.js
const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const FRONTEND_DIR = 'loc_frontend'; // ← Ваша структура
const BACKEND_DIR = 'backend';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = [];

function check(description, condition, file, fix) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ${GREEN}✅${RESET} ${description}`);
  } else {
    failedChecks.push({ description, file, fix });
    console.log(`  ${RED}❌${RESET} ${description}`);
    if (fix) console.log(`     ${YELLOW}→ ${fix}${RESET}`);
  }
}

function readFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

console.log(`\n${BOLD}🔍 Проверка настройки WebRTC звонков${RESET}`);
console.log(`${BLUE}📂 Frontend: ${FRONTEND_DIR}/${RESET}`);
console.log(`${BLUE}📂 Backend:  ${BACKEND_DIR}/${RESET}\n`);

// ===== 1. useWebRTC.ts =====
console.log(`${BOLD}📁 ${FRONTEND_DIR}/src/hooks/useWebRTC.ts${RESET}`);
const webrtc = readFile(`${FRONTEND_DIR}/src/hooks/useWebRTC.ts`);
if (!webrtc) {
  check('Файл существует', false, 'useWebRTC.ts', `Создай файл ${FRONTEND_DIR}/src/hooks/useWebRTC.ts`);
} else {
  check('Файл существует', true);
  check('Экспортирует useWebRTC', webrtc.includes('export function useWebRTC'));
  check('Есть ICE_SERVERS', webrtc.includes('ICE_SERVERS'));
  check('Есть setupPeerConnection', webrtc.includes('setupPeerConnection'));
  check('Есть onicecandidate', webrtc.includes('onicecandidate'));
  check('Есть onconnectionstatechange', webrtc.includes('onconnectionstatechange'));
  check('Есть handleSignal', webrtc.includes('handleSignal'));
  check('Обрабатывает call_offer', webrtc.includes("'call_offer'") || webrtc.includes('"call_offer"'));
  check('Обрабатывает call_answer', webrtc.includes("'call_answer'") || webrtc.includes('"call_answer"'));
  check('Обрабатывает call_ice_candidate', webrtc.includes('call_ice_candidate'));
  check('Есть localStreamRef (актуальный stream)', webrtc.includes('localStreamRef'), 'useWebRTC.ts', 'Добавь const localStreamRef = useRef<MediaStream | null>(null)');
  check('Есть логирование 🔌 Connection', webrtc.includes('Connection'), 'useWebRTC.ts', 'Добавь console.log в onconnectionstatechange');
}

// ===== 2. CallContext.tsx =====
console.log(`\n${BOLD}📁 ${FRONTEND_DIR}/lib/CallContext.tsx${RESET}`);
const callCtx = readFile(`${FRONTEND_DIR}/lib/CallContext.tsx`);
if (!callCtx) {
  check('Файл существует', false, 'CallContext.tsx', `Создай файл ${FRONTEND_DIR}/lib/CallContext.tsx`);
} else {
  check('Файл существует', true);
  check('Экспортирует CallContext', callCtx.includes('export const CallContext'));
  check('Экспортирует useCall', callCtx.includes('export function useCall'));
  check('Есть initiateCall в типе', callCtx.includes('initiateCall'));
  check('Есть acceptCall в типе', callCtx.includes('acceptCall'));
}

// ===== 3. CallModal.tsx =====
console.log(`\n${BOLD}📁 ${FRONTEND_DIR}/components/CallModal.tsx${RESET}`);
const callModal = readFile(`${FRONTEND_DIR}/components/CallModal.tsx`);
if (!callModal) {
  check('Файл существует', false, 'CallModal.tsx', `Создай файл ${FRONTEND_DIR}/components/CallModal.tsx`);
} else {
  check('Файл существует', true);
  check('Импортирует useCall', callModal.includes('useCall'));
  check('Имеет localVideoRef', callModal.includes('localVideoRef'));
  check('Имеет remoteVideoRef', callModal.includes('remoteVideoRef'));
  check('Рендерит видео элементы', callModal.includes('<video') || callModal.includes('<audio'));
  check('Есть кнопка accept', callModal.includes('acceptCall'));
  check('Есть кнопка reject', callModal.includes('rejectCall'));
  check('Есть кнопка end', callModal.includes('endCall'));
}

// ===== 4. CallButton.tsx =====
console.log(`\n${BOLD}📁 ${FRONTEND_DIR}/components/CallButton.tsx${RESET}`);
const callBtn = readFile(`${FRONTEND_DIR}/components/CallButton.tsx`);
if (!callBtn) {
  check('Файл существует', false, 'CallButton.tsx', `Создай файл ${FRONTEND_DIR}/components/CallButton.tsx`);
} else {
  check('Файл существует', true);
  check('Есть проп onCall', callBtn.includes('onCall'), 'CallButton.tsx', 'Добавь onCall: (userId: number, callType: CallType) => void в CallButtonProps');
  check('Вызывает onCall по клику', callBtn.includes('onCall(') || callBtn.includes('onCall ('));
}

// ===== 5. WebSocketProvider.tsx =====
console.log(`\n${BOLD}📁 ${FRONTEND_DIR}/components/WebSocketProvider.tsx${RESET}`);
const wsProvider = readFile(`${FRONTEND_DIR}/components/WebSocketProvider.tsx`);
if (!wsProvider) {
  check('Файл существует', false);
} else {
  check('Файл существует', true);
  check('Импортирует useWebRTC', wsProvider.includes('useWebRTC'));
  check('Импортирует CallContext', wsProvider.includes('CallContext'));
  check('Импортирует CallModal', wsProvider.includes('CallModal'));
  check('Оборачивает в CallContext.Provider', wsProvider.includes('CallContext.Provider'));
  check('Рендерит <CallModal />', wsProvider.includes('<CallModal'));
  check('Подписан на call_incoming', wsProvider.includes('call_incoming'));
  check('Подписан на call_offer', wsProvider.includes('call_offer'));
  check('Подписан на call_answer', wsProvider.includes('call_answer'));
  check('Подписан на call_ice_candidate', wsProvider.includes('call_ice_candidate'));
  check('Передаёт sendSignal в useWebRTC', wsProvider.includes('useWebRTC('));
  check('Отправляет через socket.send', wsProvider.includes('socket.send'), 'WebSocketProvider.tsx', 'Добавь socket.send(data) в sendSignal');
}

// ===== 6. websocket.ts =====
console.log(`\n${BOLD}📁 ${FRONTEND_DIR}/lib/websocket.ts${RESET}`);
const wsLib = readFile(`${FRONTEND_DIR}/lib/websocket.ts`);
if (!wsLib) {
  check('Файл существует', false);
} else {
  check('Файл существует', true);
  check('Есть метод send(data)', wsLib.includes('send(data') || wsLib.includes('send (data'), 'websocket.ts', 'Добавь в NebulaSocket: send(data: any) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data)); }');
  check('Игнорирует pong в onmessage', wsLib.includes('pong'), 'websocket.ts', 'Добавь if (event.data === "pong") return; в onmessage');
}

// ===== 7. ChatPage (messages/[id]/page.tsx) =====
console.log(`\n${BOLD}📁 ${FRONTEND_DIR}/app/messages/[id]/page.tsx${RESET}`);
const chatPage = readFile(`${FRONTEND_DIR}/app/messages/[id]/page.tsx`);
if (!chatPage) {
  check('Файл существует', false);
} else {
  check('Файл существует', true);
  check('Импортирует useCall', chatPage.includes('useCall'), 'page.tsx', "Добавь import { useCall } from '@/lib/CallContext';");
  check('Импортирует CallButton', chatPage.includes('CallButton'), 'page.tsx', "Добавь import CallButton from '@/components/CallButton';");
  check('Вызывает useCall()', chatPage.includes('useCall()'));
  check('Рендерит CallButton', chatPage.includes('<CallButton'));
  check('Передаёт onCall проп', chatPage.includes('onCall='), 'page.tsx', 'Добавь onCall={(uid, type) => initiateCall(uid, type, ...)}');
}

// ===== 8. backend/main.py =====
console.log(`\n${BOLD}📁 ${BACKEND_DIR}/main.py${RESET}`);
const mainPy = readFile(`${BACKEND_DIR}/main.py`);
if (!mainPy) {
  check('Файл существует', false);
} else {
  check('Файл существует', true);
  check('Импортирует CallSignaling', mainPy.includes('CallSignaling'), 'main.py', 'Добавь from websocket_manager import CallSignaling');
  check('Обрабатывает call_ сообщения', mainPy.includes("startswith(\"call_\")") || mainPy.includes("startswith('call_')"), 'main.py', 'Добавь if msg_type.startswith("call_"): await CallSignaling.handle_call_message(...)');
  check('Обрабатывает ping', mainPy.includes('ping'), 'main.py', 'Добавь if text == "ping": await websocket.send_text("pong")');
  check('Использует receive_text (не receive_json)', mainPy.includes('receive_text'), 'main.py', 'Замени receive_json() на receive_text() + json.loads()');
}

// ===== 9. backend/websocket_manager.py =====
console.log(`\n${BOLD}📁 ${BACKEND_DIR}/websocket_manager.py${RESET}`);
const wsManager = readFile(`${BACKEND_DIR}/websocket_manager.py`);
if (!wsManager) {
  check('Файл существует', false);
} else {
  check('Файл существует', true);
  check('Есть класс CallSignaling', wsManager.includes('class CallSignaling'));
  check('Есть active_calls', wsManager.includes('active_calls'));
  check('Обрабатывает call_initiate', wsManager.includes('call_initiate'));
  check('Обрабатывает call_accept', wsManager.includes('call_accept'));
  check('Обрабатывает call_offer', wsManager.includes('call_offer'));
  check('Обрабатывает call_answer', wsManager.includes('call_answer'));
  check('Обрабатывает call_ice_candidate', wsManager.includes('call_ice_candidate'));
  check('Обрабатывает call_end', wsManager.includes('call_end'));
  check('Использует manager.send_to_user', wsManager.includes('manager.send_to_user'), 'websocket_manager.py', 'Замени websocket.send_json на manager.send_to_user для корректной отправки');
  check('НЕ использует get_user_websocket (несуществующий)', !wsManager.includes('get_user_websocket'), 'websocket_manager.py', 'Удали все вызовы get_user_websocket — такого метода нет');
}

// ===== ИТОГ =====
console.log(`\n${'═'.repeat(60)}`);
console.log(`${BOLD}📊 ИТОГ: ${passedChecks}/${totalChecks} проверок пройдено${RESET}`);
console.log(`${'═'.repeat(60)}\n`);

if (failedChecks.length === 0) {
  console.log(`${GREEN}${BOLD}🎉 ВСЁ НАСТРОЕНО ПРАВИЛЬНО!${RESET}`);
  console.log(`${YELLOW}Если звонки всё ещё не работают — проблема в TURN/NAT.${RESET}`);
  console.log(`Открой chrome://webrtc-internals и смотри состояние ICE.`);
} else {
  console.log(`${RED}${BOLD}⚠️  НАЙДЕНО ${failedChecks.length} ПРОБЛЕМ:${RESET}\n`);
  
  const byFile = {};
  failedChecks.forEach(f => {
    const key = f.file || 'unknown';
    if (!byFile[key]) byFile[key] = [];
    byFile[key].push(f);
  });
  
  Object.entries(byFile).forEach(([file, issues]) => {
    console.log(`${BOLD}${YELLOW}📄 ${file}${RESET}`);
    issues.forEach(i => {
      console.log(`   ${RED}✗${RESET} ${i.description}`);
      if (i.fix) console.log(`     ${GREEN}→ ${i.fix}${RESET}`);
    });
    console.log('');
  });
}