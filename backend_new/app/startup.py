# ============================================================
# app/startup.py - DB bootstrap & migrations (runs once at startup)
# Extracted from original main.py verbatim.
# ============================================================

from app.deps import *  # noqa: F401,F403  (init_db, engine, Session, text, ...)


def run_app_startup():
    init_db()

    # ============================================================
    # БЛОК 1: ПОЛЬЗОВАТЕЛИ, АВТОРИЗАЦИЯ И БЕЙДЖИ
    # ============================================================
    with engine.connect() as conn:
        try:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS selected_badge_id INTEGER;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS custom_badge_url VARCHAR;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS cover_url VARCHAR;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS bio VARCHAR(500);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS live_text_enabled BOOLEAN DEFAULT TRUE;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS live_text_broadcast BOOLEAN DEFAULT TRUE;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS prism_anchor VARCHAR;'))
            
            # 2FA и Email
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_secret VARCHAR;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS email VARCHAR(255);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON "user"(email) WHERE email IS NOT NULL;'))
            
            # E2EE
            conn.execute(text('ALTER TABLE userkey ADD COLUMN IF NOT EXISTS is_pending BOOLEAN DEFAULT TRUE;'))
            conn.execute(text("UPDATE userkey SET is_pending = FALSE WHERE public_key NOT LIKE 'pending_%';"))

            # Таблица бейджей
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS badge (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(60) NOT NULL,
                    icon_url VARCHAR NOT NULL,
                    glow_color VARCHAR(20),
                    effect_type VARCHAR(20) DEFAULT 'none',
                    role_id INTEGER REFERENCES role(id) ON DELETE SET NULL,
                    user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
                    is_selectable BOOLEAN DEFAULT FALSE,
                    enable_ring BOOLEAN DEFAULT TRUE,
                    enable_glow BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.commit()
            print("✅ Блок 1: Пользователи и бейджи обновлены")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Блок 1 warning: {e}")

    # ============================================================
    # БЛОК 2: РОЛИ И КАТЕГОРИИ РОЛЕЙ
    # ============================================================
    with engine.connect() as conn:
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS rolecategory (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(60) NOT NULL,
                    color VARCHAR(20) DEFAULT '#8b5cf6',
                    description VARCHAR(200),
                    "order" INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS description VARCHAR;'))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS is_staff BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES rolecategory(id) ON DELETE SET NULL;'))
            conn.commit()
            print("✅ Блок 2: Роли и категории обновлены")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Блок 2 warning: {e}")

    # ============================================================
    # БЛОК 3: ПОСТЫ И ВЗАИМОДЕЙСТВИЯ
    # ============================================================
    with engine.connect() as conn:
        try:
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS media_type VARCHAR;'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS repost_of_id INTEGER REFERENCES post(id) ON DELETE SET NULL;'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS echo_parent_id INTEGER REFERENCES post(id) ON DELETE SET NULL;'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;'))
            
            # Каскадные удаления для постов
            conn.execute(text('ALTER TABLE "like" DROP CONSTRAINT IF EXISTS like_post_id_fkey;'))
            conn.execute(text('ALTER TABLE "like" ADD CONSTRAINT like_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_post_id_fkey;'))
            conn.execute(text('ALTER TABLE notification ADD CONSTRAINT notification_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE posttag DROP CONSTRAINT IF EXISTS posttag_post_id_fkey;'))
            conn.execute(text('ALTER TABLE posttag ADD CONSTRAINT posttag_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE bookmark DROP CONSTRAINT IF EXISTS bookmark_post_id_fkey;'))
            conn.execute(text('ALTER TABLE bookmark ADD CONSTRAINT bookmark_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE postview DROP CONSTRAINT IF EXISTS postview_post_id_fkey;'))
            conn.execute(text('ALTER TABLE postview ADD CONSTRAINT postview_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE post DROP CONSTRAINT IF EXISTS post_reply_to_id_fkey;'))
            conn.execute(text('ALTER TABLE post ADD CONSTRAINT post_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.commit()
            print("✅ Блок 3: Посты обновлены")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Блок 3 warning: {e}")

    # ============================================================
    # БЛОК 4: ЧАТЫ, СООБЩЕНИЯ И ПОДДЕРЖКА
    # ============================================================
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS is_secret BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS is_prism BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS is_saved BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS name VARCHAR(80);"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS avatar_url VARCHAR;"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES \"user\"(id);"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS pinned_by INTEGER REFERENCES \"user\"(id);"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;"))
            
            conn.execute(text("ALTER TABLE chatmember ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'member';"))
            conn.execute(text("ALTER TABLE chatmember ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();"))
            
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS media_url VARCHAR;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS media_type VARCHAR;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS ciphertext TEXT;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS forwarded_from_id INTEGER REFERENCES message(id) ON DELETE SET NULL;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES message(id) ON DELETE SET NULL;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS pinned_by INTEGER REFERENCES \"user\"(id);"))
            
            conn.execute(text('ALTER TABLE notification ADD COLUMN IF NOT EXISTS message_id INTEGER REFERENCES message(id) ON DELETE SET NULL;'))
            
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS support_message (
                    id SERIAL PRIMARY KEY,
                    ticket_id INTEGER NOT NULL REFERENCES supportticket(id) ON DELETE CASCADE,
                    sender_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                    text TEXT,
                    media_url VARCHAR,
                    media_type VARCHAR,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text('ALTER TABLE supportmessage ALTER COLUMN text DROP NOT NULL;'))
            conn.execute(text('ALTER TABLE supportmessage ADD COLUMN IF NOT EXISTS media_url VARCHAR;'))
            conn.execute(text('ALTER TABLE supportmessage ADD COLUMN IF NOT EXISTS media_type VARCHAR;'))
            conn.commit()
            print("✅ Блок 4: Чаты и сообщения обновлены")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Блок 4 warning: {e}")

    # ============================================================
    # БЛОК 5: СТИКЕРЫ, РЕАКЦИИ И ПРЕДУПРЕЖДЕНИЯ
    # ============================================================
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE stickerpack DROP COLUMN IF EXISTS emojis;"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS sticker_pack (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(60) NOT NULL,
                    min_level INTEGER DEFAULT 1,
                    is_active BOOLEAN DEFAULT TRUE,
                    is_builtin BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS sticker (
                    id SERIAL PRIMARY KEY,
                    pack_id INTEGER NOT NULL REFERENCES sticker_pack(id) ON DELETE CASCADE,
                    type VARCHAR(10) NOT NULL,
                    content VARCHAR(500) NOT NULL,
                    "order" INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS message_reaction (
                    id SERIAL PRIMARY KEY,
                    message_id INTEGER NOT NULL REFERENCES message(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                    sticker_id INTEGER REFERENCES sticker(id) ON DELETE CASCADE,
                    emoji VARCHAR(16),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text('ALTER TABLE message_reaction ADD COLUMN IF NOT EXISTS sticker_id INTEGER;'))
            
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS warning (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                    issuer_id INTEGER NOT NULL REFERENCES "user"(id),
                    reason VARCHAR(500) NOT NULL,
                    active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    expires_at TIMESTAMPTZ
                );
            """))
            conn.commit()
            print("✅ Блок 5: Стикеры и предупреждения обновлены")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Блок 5 warning: {e}")

    # ============================================================
    # БЛОК 6: ФОРУМ ПРЕДЛОЖЕНИЙ И СТАТИСТИКА КОМАНДЫ
    # ============================================================
    with engine.connect() as conn:
        try:
            # 1. Создаем таблицы
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS suggestion_category (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(60) NOT NULL,
                    description VARCHAR(200),
                    icon VARCHAR(30) DEFAULT 'message-square',
                    color VARCHAR(20) DEFAULT '#8b5cf6',
                    "order" INTEGER DEFAULT 0,
                    is_archived BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS suggestion_thread (
                    id SERIAL PRIMARY KEY,
                    category_id INTEGER REFERENCES suggestion_category(id) ON DELETE CASCADE,
                    author_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
                    title VARCHAR(200) NOT NULL,
                    content TEXT NOT NULL,
                    is_pinned BOOLEAN DEFAULT FALSE,
                    status VARCHAR(20) DEFAULT 'pending',
                    views_count INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ
                );
            """))
            # 🛡️ УДАЛЕНО ДУБЛИРУЮЩЕЕ СОЗДАНИЕ suggestion_comment отсюда, оно было внизу твоего кода
            
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS team_statistic (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
                    action_type VARCHAR(50) NOT NULL,
                    target_type VARCHAR(50),
                    target_id INTEGER,
                    details TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS role_history (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
                    old_role_id INTEGER REFERENCES role(id) ON DELETE SET NULL,
                    new_role_id INTEGER REFERENCES role(id) ON DELETE SET NULL,
                    changed_by INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
                    changed_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            
            # 2. Создаем дефолтные категории (ЯВНО указываем is_archived=FALSE, чтобы избежать NotNullViolation)
            conn.execute(text("""
                INSERT INTO suggestion_category (name, description, icon, color, "order", is_archived)
                VALUES 
                    ('Сайт', 'Предложения по улучшению сайта', 'globe', '#8b5cf6', 0, FALSE),
                    ('Сервер', 'Предложения по серверу', 'server', '#10b981', 1, FALSE),
                    ('Реализовано', 'Уже внедрённые предложения', 'check-circle', '#22c55e', 99, FALSE)
                ON CONFLICT DO NOTHING;
            """))
            
            conn.commit()
            print("✅ Блок 6: Форум предложений и статистика созданы")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Блок 6 warning: {e}")

    # ============================================================
    # БЛОК 7: СИСТЕМНЫЕ ТАБЛИЦЫ И НАСТРОЙКИ
    # ============================================================
    with engine.connect() as conn:
        try:
            conn.execute(text('DROP TABLE IF EXISTS readprogress;'))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS lastreadpost (
                    user_id INTEGER PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
                    post_id INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
                    saved_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS theme (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(80) NOT NULL,
                    type VARCHAR(20) NOT NULL,
                    colors TEXT DEFAULT '[]',
                    speed FLOAT DEFAULT 24.0,
                    intensity FLOAT DEFAULT 0.22,
                    blur INTEGER DEFAULT 80,
                    is_default BOOLEAN DEFAULT FALSE,
                    min_level INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_by INTEGER REFERENCES "user"(id),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS system_setting (
                    key VARCHAR(50) PRIMARY KEY,
                    value TEXT DEFAULT '',
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text("INSERT INTO system_setting (key, value) VALUES ('themes_enabled', 'false') ON CONFLICT (key) DO NOTHING;"))
            
            conn.execute(text('CREATE TABLE IF NOT EXISTS pushsubscription (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE, endpoint VARCHAR UNIQUE NOT NULL, p256dh VARCHAR NOT NULL, auth VARCHAR NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS siterules (id SERIAL PRIMARY KEY, content TEXT NOT NULL DEFAULT \'{}\', updated_by INTEGER REFERENCES "user"(id), updated_at TIMESTAMPTZ DEFAULT NOW());'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS bookmark (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES "user"(id), post_id INTEGER REFERENCES post(id) ON DELETE CASCADE, created_at TIMESTAMPTZ, UNIQUE(user_id, post_id));'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS updateread (user_id INTEGER REFERENCES "user"(id), update_id INTEGER REFERENCES "update"(id), read_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_id, update_id));'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS iplog (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES "user"(id), ip_address VARCHAR NOT NULL, user_agent VARCHAR, action VARCHAR, created_at TIMESTAMPTZ);'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS ipblock (id SERIAL PRIMARY KEY, ip_address VARCHAR UNIQUE NOT NULL, reason VARCHAR, blocked_by INTEGER REFERENCES "user"(id), created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ);'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS actionlog (id SERIAL PRIMARY KEY, actor_id INTEGER REFERENCES "user"(id), action VARCHAR NOT NULL, target_type VARCHAR, target_id INTEGER, details VARCHAR, ip_address VARCHAR, created_at TIMESTAMPTZ);'))
            
            conn.execute(text('ALTER TABLE updateread DROP CONSTRAINT IF EXISTS updateread_update_id_fkey;'))
            conn.execute(text('ALTER TABLE updateread ADD CONSTRAINT updateread_update_id_fkey FOREIGN KEY (update_id) REFERENCES "update"(id) ON DELETE CASCADE;'))
            
            conn.commit()
            print("✅ Блок 7: Системные таблицы созданы")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Блок 7 warning: {e}")

    # ============================================================
    # БЛОК 8: ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
    # ============================================================
    with engine.connect() as conn:
        try:
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_sticker_pack ON sticker(pack_id, "order");'))
            conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_reaction_unique ON message_reaction(message_id, user_id, COALESCE(sticker_id, 0), COALESCE(emoji, ''));'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_reaction_message ON message_reaction(message_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_lastreadpost_user ON lastreadpost(user_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_chat_is_prism ON chat(is_prism);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_chat_pinned ON chat(pinned_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_chat_is_group ON chat(is_group);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_chat_owner ON chat(owner_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_chatmember_user ON chatmember(user_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_message_reply ON message(reply_to_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_message_pinned ON message(chat_id, pinned, pinned_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_message_chat ON message(chat_id, created_at);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_warning_user ON warning(user_id, active);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_repost ON post(repost_of_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_echo_parent ON post(echo_parent_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_author ON post(author_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_reply ON post(reply_to_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_created ON post(created_at DESC);'))
            
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_suggestion_thread_category ON suggestion_thread(category_id, is_pinned DESC, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_suggestion_thread_status ON suggestion_thread(status);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_team_statistic_user ON team_statistic(user_id, created_at DESC);'))
            
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_iplog_user ON iplog(user_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_ipblock_ip ON ipblock(ip_address);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_actionlog_created ON actionlog(created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_like_post ON "like"(post_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_follow_follower ON follow(follower_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_follow_followee ON follow(followee_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_postview_post ON postview(post_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_postview_viewer ON postview(viewer_hash);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, read);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_push_user ON pushsubscription(user_id);'))
            
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_author_created ON post(author_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_message_chat_id_desc ON message(chat_id, id DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_posttag_tag ON posttag(tag_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_notification_user_created ON notification(user_id, created_at DESC);'))
            conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username_lower ON "user" (LOWER(username));'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_user_display_name_lower ON "user" (LOWER(display_name));'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_bookmark_user_created ON bookmark(user_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_like_user_created ON "like"(user_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_follow_follower_followee ON follow(follower_id, followee_id);'))
            
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_suggestion_status ON suggestion(status);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_suggestion_pinned ON suggestion(is_pinned DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_theme_active ON theme(is_active, min_level);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_support_message_ticket ON support_message(ticket_id, created_at);'))
            
            conn.commit()
            print("✅ Блок 8: Все индексы созданы")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Блок 8 warning: {e}")

    # ============================================================
    # БЛОК 9: ФИНАЛЬНАЯ ОЧИСТКА И ПРОВЕРКИ
    # ============================================================
    with engine.connect() as conn:
        try:
            # Добавление updated_at к supportticket
            conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='supportticket' AND column_name='updated_at'
                    ) THEN
                        ALTER TABLE supportticket ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
                        UPDATE supportticket SET updated_at = created_at WHERE updated_at IS NULL;
                    END IF;
                END $$;
            """))
            
            # Приведение юзернеймов к нижнему регистру и сброс sequence
            conn.execute(text('UPDATE "user" SET username = LOWER(username) WHERE username != LOWER(username);'))
            conn.execute(text("""
                SELECT setval(pg_get_serial_sequence('"user"', 'id'), COALESCE((SELECT MAX(id) FROM "user"), 0) + 1, false);
            """))
            
            conn.commit()
            print("✅ Блок 9: Финальная очистка и проверки завершены успешно")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Блок 9 warning: {e}")
