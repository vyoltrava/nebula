const fs = require("fs");
const p = "app/messages/[id]/page.tsx";
let s = fs.readFileSync(p, "utf8");

if (!s.includes("const { t, locale } = useI18n()")) {
  s = s.replace(
    "export default function ChatPage() {\n  const params = useParams();",
    "export default function ChatPage() {\n  const { t, locale } = useI18n();\n  const params = useParams();"
  );
}

const reps = [
  ['setSecretError("Собеседник ещё не был в сети. Ключи создадутся автоматически.");', 'setSecretError(t("messages.secretWaitOnline"));'],
  ['setSecretError("Собеседник ещё не заходил. Чат будет готов когда он войдёт.");', 'setSecretError(t("messages.secretWaitVisit"));'],
  ['setSecretError("Ваши ключи не загружены. Перезагрузите страницу.");', 'setSecretError(t("messages.keysNotLoaded"));'],
  ['setSecretError("Ошибка инициализации шифрования");', 'setSecretError(t("messages.encryptInitError"));'],
  ['alert("Сообщение переслано");', 'alert(t("messages.forwarded"));'],
  ['({ detail: "Ошибка" })', '({ detail: t("common.error") })'],
  ['alert(err.detail || "Не удалось переслать");', 'alert(err.detail || t("messages.forwardFailed"));'],
  ['alert("Ошибка сети");', 'alert(t("common.networkError"));'],
  ['alert("Не удалось получить доступ к микрофону");', 'alert(t("messages.micFailed"));'],
  ['alert("Шифрование ещё не готово");', 'alert(t("messages.encryptNotReady"));'],
  ['alert("Ошибка: ключ сессии потерян");', 'alert(t("messages.sessionKeyLost"));'],
  ['alert("Не удалось отправить зашифрованное голосовое");', 'alert(t("messages.voiceEncryptFailed"));'],
  ['alert("Не удалось отправить голосовое сообщение");', 'alert(t("messages.voiceFailed"));'],
  ['if (!confirm(`Удалить ${selectedMessages.size} сообщений?`)) return;', 'if (!confirm(t("messages.deleteNConfirm", { n: selectedMessages.size }))) return;'],
  ['alert("Ошибка при удалении сообщений");', 'alert(t("messages.deleteMessagesFailed"));'],
  ['confirmMsg = "Покинуть группу? Вы больше не будете получать сообщения из неё.";', 'confirmMsg = t("messages.leaveGroupConfirm");'],
  ['confirmMsg = "⚠️ Удалить группу для ВСЕХ участников?\\nВсе сообщения будут стёрты. Это действие нельзя отменить.";', 'confirmMsg = t("messages.deleteGroupConfirm");'],
  ['confirmMsg = "Удалить чат? Все сообщения будут удалены. Это действие нельзя отменить.";', 'confirmMsg = t("messages.deleteChatAllConfirm");'],
  ['alert(err.detail || "Не удалось удалить чат");', 'alert(err.detail || t("messages.deleteChatFailed"));'],
  ['let placeholder = "текст";', 'let placeholder = t("compose.mdText");'],
  ['placeholder = "жирный";', 'placeholder = t("compose.mdBold");'],
  ['placeholder = "курсив";', 'placeholder = t("compose.mdItalic");'],
  ['placeholder = "код";', 'placeholder = t("compose.mdCode");'],
  ['placeholder = "текст ссылки";', 'placeholder = t("compose.mdLink");'],
  ['placeholder = "спойлер";', 'placeholder = t("compose.mdSpoiler");'],
  ['alert("Не удалось отправить шифрованное медиа");', 'alert(t("messages.mediaEncryptFailed"));'],
  ['alert("Ошибка шифрования");', 'alert(t("messages.encryptError"));'],
  ['alert("Нет доступа к чату");', 'alert(t("messages.noChatAccess"));'],
  ['alert("Не удалось отправить сообщение");', 'alert(t("messages.sendFailed"));'],
  ['if (!confirm("Удалить сообщение?")) return;', 'if (!confirm(t("messages.deleteMsgConfirm"))) return;'],
  ['alert("Редактирование пока недоступно для секретных чатов");', 'alert(t("messages.editSecretUnavailable"));'],
  ['alert("Редактирование недоступно в секретных чатах");', 'alert(t("messages.editSecretOff"));'],
  ['alert(err?.detail || "Не удалось поставить реакцию");', 'alert(err?.detail || t("messages.reactionFailed"));'],
  ['alert(err?.detail || "Не удалось отправить стикер");', 'alert(err?.detail || t("messages.stickerFailed"));'],
  ['label: "Ответить"', 'label: t("messages.reply")'],
  ['label: "Выбрать"', 'label: t("messages.select")'],
  ['label: "Копировать"', 'label: t("messages.copy")'],
  ['label: "Переслать"', 'label: t("messages.forward")'],
  ['label: "Редактировать"', 'label: t("messages.edit")'],
  ['label: "Удалить"', 'label: t("messages.delete")'],
  ['label: "Закрепить"', 'label: t("messages.pin")'],
  ['label: "Открепить"', 'label: t("messages.unpin")'],
  ['alert(e?.message || "Не удалось закрепить");', 'alert(e?.message || t("messages.pinFailed"));'],
  ['alert(e?.message || "Не удалось открепить");', 'alert(e?.message || t("messages.unpinFailed"));'],
  ['data.ciphertext === "[encrypted_media]" ? "🔒 Вложение" : (data.text || "Новое сообщение")', 'data.ciphertext === "[encrypted_media]" ? `🔒 ${t("messages.encryptedMedia")}` : (data.text || t("messages.newMessage"))'],
  ['alert("Этот чат был удалён");', 'alert(t("messages.chatDeleted"));'],
  ["if (d.toDateString() === today.toDateString()) dateLabel = 'Сегодня';", 'if (d.toDateString() === today.toDateString()) dateLabel = t("common.today");'],
  ["else if (d.toDateString() === yesterday.toDateString()) dateLabel = 'Вчера';", 'else if (d.toDateString() === yesterday.toDateString()) dateLabel = t("common.yesterday");'],
  ['title="Назад"', 'title={t("common.back")}'],
  ['<span className="hidden sm:inline ml-1 text-sm">Назад</span>', '<span className="hidden sm:inline ml-1 text-sm">{t("common.back")}</span>'],
  ['alt={chatInfo.name || "Группа"}', 'alt={chatInfo.name || t("common.group")}'],
  ['? <span className="text-[#8b5cf6]">✎ {typingUserName} печатает...</span>', '? <span className="text-[#8b5cf6]">✎ {t("messages.typingName", { name: typingUserName })}</span>'],
  [': `${chatInfo.members_count} участник${chatInfo.members_count === 1 ? "" : (chatInfo.members_count < 5 ? "а" : "ов")} · подробнее`', ': (chatInfo.members_count === 1 ? t("messages.membersOne", { n: chatInfo.members_count }) : chatInfo.members_count < 5 ? t("messages.membersFew", { n: chatInfo.members_count }) : t("messages.membersMore", { n: chatInfo.members_count }))'],
  ['Избранное', '{t("messages.saved")}'],
  ['Личные заметки и ссылки', '{t("messages.notesHint")}'],
  ['? "✎ печатает..."', '? `✎ ${t("messages.typing")}`'],
  ['? "● в сети"', '? t("messages.onlineDot")'],
  ['{chatInfo ? "Загрузка..." : "Чат не найден"}', '{chatInfo ? t("common.loading") : t("messages.chatNotFound")}'],
  ['title="Настроить реакцию"', 'title={t("messages.setReaction")}'],
  ['title="Медиа"', 'title={t("messages.media")}'],
  ['title="Настройки группы"', 'title={t("messages.groupSettings")}'],
  ['title="Ещё"', 'title={t("common.more")}'],
  ['<SmilePlus size={15} /> Быстрая реакция', '<SmilePlus size={15} /> {t("messages.quickReaction")}'],
  ['<ImageIcon size={15} /> Медиа файлы', '<ImageIcon size={15} /> {t("messages.mediaFiles")}'],
  ['<Settings size={15} /> Настройки группы', '<Settings size={15} /> {t("messages.groupSettings")}'],
  ['<Users size={15} /> Участники', '<Users size={15} /> {t("messages.membersTitle")}'],
  ['{isGroup ? (chatInfo?.my_role === "owner" ? "Удалить группу" : "Покинуть группу") : "Удалить чат"}', '{isGroup ? (chatInfo?.my_role === "owner" ? t("messages.deleteGroup") : t("messages.leaveGroup")) : t("messages.deleteChat")}'],
  ['{pinnedMessages.length} закреплённ{pinnedMessages.length === 1 ? "ое" : "ых"}', '{pinnedMessages.length === 1 ? t("messages.pinnedOne", { n: pinnedMessages.length }) : t("messages.pinnedMany", { n: pinnedMessages.length })}'],
  ["alert('Сообщение не найдено. Возможно, оно было удалено или загружено не полностью.');", 'alert(t("messages.msgNotFound"));'],
  ["{msg.text || (msg.media_type === 'image' ? '📷 Фото' : msg.media_type === 'audio' ? '🎙️ Голосовое' : msg.media_type === 'video' ? '🎬 Видео' : ' Вложение')}", "{msg.text || (msg.media_type === 'image' ? `📷 ${t('common.photo')}` : msg.media_type === 'audio' ? `🎙️ ${t('common.audio')}` : msg.media_type === 'video' ? `🎬 ${t('common.video')}` : ` ${t('common.attachment')}`)}"],
  ['placeholder={isSecret ? "Поиск в расшифрованных..." : "Поиск в сообщениях..."}', 'placeholder={isSecret ? t("messages.searchDecrypted") : t("messages.searchInChat")}'],
  ['{filteredMessages.length} из {messages.length} сообщений', '{t("messages.ofMessages", { n: filteredMessages.length, m: messages.length })}'],
  ['{selectedMessages.size} выбрано', '{t("messages.selectedN", { n: selectedMessages.size })}'],
  ['<span className="hidden xs:inline">Удалить</span>', '<span className="hidden xs:inline">{t("common.delete")}</span>'],
  ['<p className="font-bold text-emerald-300 mb-0.5 sm:mb-1">Секретный чат</p>', '<p className="font-bold text-emerald-300 mb-0.5 sm:mb-1">{t("profile.secretChat")}</p>'],
  ['Сообщения зашифрованы end-to-end. Сервер не может их прочитать.\n                      Ключи хранятся только на устройствах участников.', '{t("messages.secretHint")}'],
  ['<p className="text-xs sm:text-sm text-amber-300 font-bold">Ожидание собеседника</p>', '<p className="text-xs sm:text-sm text-amber-300 font-bold">{t("messages.waitingPeer")}</p>'],
  ['Проверить снова', '{t("messages.checkAgain")}'],
  ['Попробовать снова', '{t("messages.tryAgain")}'],
  ['{lt.name} · печатает вживую', '{lt.name} · {t("messages.liveTyping")}'],
  ['Вложения ({files.length}/5)', '{t("messages.attachmentsN", { n: files.length })}'],
  ['Очистить', '{t("messages.clear")}'],
  ['title="Отменить запись"', 'title={t("messages.cancelRec")}'],
  ['title="Действия"', 'title={t("messages.actions")}'],
  ['placeholder={isSecret ? (secretState === "ready" ? "Зашифрованное сообщение..." : "Ожидание шифрования...") : isGroup ? "Сообщение группе..." : "Сообщение..."}', 'placeholder={isSecret ? (secretState === "ready" ? t("messages.encryptedPlaceholder") : t("messages.waitingEncrypt")) : isGroup ? t("messages.groupPlaceholder") : t("messages.msgPlaceholder")}'],
  ['<span>Форматирование текста</span>', '<span>{t("messages.formatText")}</span>'],
  ['title={r.locked ? `Нужен ${r.minLevel} уровень` : r.packName}', 'title={r.locked ? t("messages.needLevel", { n: r.minLevel }) : r.packName}'],
  ['{stickerPacks.length === 0 ? "Загрузка паков..." : "Нет доступных реакций"}', '{stickerPacks.length === 0 ? t("messages.loadingPacks") : t("messages.noReactions")}'],
  ['title="Все реакции"', 'title={t("messages.allReactions")}'],
  ['{ key: "image", label: "Фото", icon: <ImageIcon size={12} /> }', '{ key: "image", label: t("common.photo"), icon: <ImageIcon size={12} /> }'],
  ['{ key: "video", label: "Видео", icon: <Film size={12} /> }', '{ key: "video", label: t("common.video"), icon: <Film size={12} /> }'],
  ['{ key: "video_note", label: "Квадраты", icon: <Video size={12} /> }', '{ key: "video_note", label: t("messages.squares"), icon: <Video size={12} /> }'],
  ['{ key: "audio", label: "Голосовые", icon: <Mic size={12} /> }', '{ key: "audio", label: t("messages.voices"), icon: <Mic size={12} /> }'],
  ['title={`Голосовое`}', 'title={t("common.audio")}'],
  ['alert(err.detail || "Не удалось отправить зашифрованное видео");', 'alert(err.detail || t("messages.videoEncryptFailed"));'],
  ['return "[Ключ не загружен]";', 'return t("messages.keyNotLoaded");'],
];

let n = 0;
for (const [a, b] of reps) {
  if (s.includes(a)) {
    s = s.split(a).join(b);
    n++;
  } else {
    console.log("MISS:", a.slice(0, 80));
  }
}
fs.writeFileSync(p, s);
console.log("replaced groups", n, "/", reps.length);
