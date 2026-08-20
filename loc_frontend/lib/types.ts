// ============================================================
// ТИПЫ ДЛЯ ЧАТОВ И СООБЩЕНИЙ
// ============================================================

export interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  is_moderator: boolean;
  is_banned: boolean;
  is_system: boolean;
  bio: string | null;
  last_seen: string | null;
  cover_url: string | null;
  role: Role | null;
  permissions: string[];
  level: number;
}

export interface Role {
  id: number;
  name: string;
  color: string;
  level: number;
  description: string;
  is_staff: boolean;
  position: number;
  permissions: string[];
}

export interface ChatMember {
  user: User;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export interface Chat {
  id: number;
  is_group: boolean;
  is_secret: boolean;
  name: string | null;
  avatar_url: string | null;
  owner_id: number | null;
  members_count: number;
  members: ChatMember[];
  my_role: 'owner' | 'admin' | 'member' | null;
  last_message: {
    text: string;
    is_encrypted: boolean;
    sender_id: number;
    created_at: string;
  } | null;
  unread_count: number;
  other?: User;
  pinned?: boolean;        // 🆕
  pinned_at?: string | null; // 🆕
}

export interface Message {
  id: number;
  chat_id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar: string | null;
  text: string | null;
  ciphertext: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | 'gif' | 'audio' | null;
  read: boolean;
  edited: boolean;
  edited_at: string | null;
  created_at: string;
  pinned?: boolean; // 🆕
  pinned_at?: string | null; // 🆕
  pinned_by?: number | null; // 🆕
}

export interface PinnedMessage {
  id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar: string | null;
  text: string | null;
  ciphertext: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | 'gif' | 'audio' | null;
  pinned_at: string;
  pinned_by: number;
  created_at: string;
}

export interface CreateGroupData {
  name: string;
  user_ids: number[];
}