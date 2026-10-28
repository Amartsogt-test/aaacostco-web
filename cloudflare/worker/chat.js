/**
 * chat.js — Phase-3 support chat (user side), on D1. Firestore onSnapshot realtime is
 * replaced by polling: the client calls GET /api/chat every few seconds. Admin-side chat
 * (broadcast, pin/like, all-conversations) can stay on Firebase or migrate later.
 *
 *   GET  /api/chat               (authed) — the user's conversation + messages
 *   POST /api/chat/message  { text }  (authed) — send a message
 */

function shapeMsg(m) {
  let text = m.text || '';
  let metadata = null;
  if (typeof text === 'string' && text.startsWith('{"__meta":')) {
    try {
      const parsed = JSON.parse(text);
      text = parsed.text || '';
      metadata = parsed.__meta || null;
    } catch { /* normal text */ }
  }
  const attachment = metadata?.attachment || (metadata?.type === 'image' || metadata?.type === 'audio' ? metadata : null);
  return {
    id: m.id,
    text,
    sender: m.isFromAdmin ? 'admin' : 'user',
    isFromAdmin: !!m.isFromAdmin,
    createdAt: m.createdAt,
    timestamp: m.createdAt,
    read: !!m.read,
    pinned: !!m.pinned,
    liked: !!m.liked,
    ...(metadata ? { metadata } : {}),
    ...(attachment ? { attachment } : {}),
  };
}

export async function getChat(env, user, markRead = false) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  const chat = await env.DB.prepare('SELECT * FROM chats WHERE userId = ?').bind(user.uid).first();
  if (!chat) return { status: 200, data: { conversation: null, messages: [] } };
  const { results } = await env.DB.prepare(
    'SELECT * FROM (SELECT * FROM messages WHERE chat_id = ? ORDER BY createdAt DESC, id DESC LIMIT 200) ORDER BY createdAt ASC, id ASC'
  ).bind(chat.id).all();
  // Only execute a D1 write when unreadByUser > 0 AND the caller requested markRead (or has unread messages).
  const unreadByUser = Number(chat.unreadByUser) || 0;
  if (markRead && unreadByUser > 0) {
    await env.DB.prepare('UPDATE chats SET unreadByUser = 0 WHERE id = ?').bind(chat.id).run();
  }
  return {
    status: 200,
    data: {
      conversation: {
        id: chat.id,
        userName: chat.userName,
        lastMessage: chat.lastMessage,
        unreadByUser: markRead ? 0 : unreadByUser,
        unreadByAdmin: Number(chat.unreadByAdmin) || 0,
        needsAdmin: !!chat.needsAdmin,
      },
      messages: (results || []).map(shapeMsg),
    },
  };
}

// ---- admin side ----
import { requireAdmin } from './auth.js';

/** GET /api/admin/chats — all conversations (admin), newest activity first. */
export async function listAdminChats(env, user) {
  requireAdmin(user);
  const { results } = await env.DB.prepare('SELECT * FROM chats ORDER BY lastMessageAt DESC LIMIT 300').all();
  return {
    status: 200,
    data: {
      conversations: (results || []).map((c) => ({
        ...c,
        unreadCount: Number(c.unreadByAdmin) || 0,
        needsAdmin: !!c.needsAdmin,
      })),
    },
  };
}

/** GET /api/admin/chat/:id — one conversation's messages (admin); marks admin-read only if unread. */
export async function getAdminChat(env, chatId, user) {
  requireAdmin(user);
  const [chat, { results }] = await Promise.all([
    env.DB.prepare('SELECT unreadByAdmin, needsAdmin FROM chats WHERE id = ?').bind(chatId).first(),
    env.DB.prepare(
      'SELECT * FROM (SELECT * FROM messages WHERE chat_id = ? ORDER BY createdAt DESC, id DESC LIMIT 200) ORDER BY createdAt ASC, id ASC'
    ).bind(chatId).all(),
  ]);
  if (chat && (Number(chat.unreadByAdmin) > 0 || Number(chat.needsAdmin) > 0)) {
    await env.DB.prepare('UPDATE chats SET unreadByAdmin = 0, needsAdmin = 0 WHERE id = ?').bind(chatId).run();
  }
  return { status: 200, data: { messages: (results || []).map(shapeMsg) } };
}

/** POST /api/admin/chat/message { chatId, text, metadata, attachment } — admin reply. */
export async function adminSendMessage(body, env, user) {
  requireAdmin(user);
  const chatId = (body?.chatId || '').toString();
  const rawText = (body?.text || '').toString().trim();
  const attachment = body?.attachment && typeof body.attachment === 'object' ? body.attachment : null;
  let metadata = body?.metadata && typeof body.metadata === 'object' ? { ...body.metadata } : null;
  if (attachment) {
    metadata = { ...(metadata || {}), attachment };
  }
  if (!chatId || (!rawText && !metadata)) return { status: 400, data: { error: 'chatId/text шаардлагатай.' } };
  const storedText = metadata ? JSON.stringify({ __meta: metadata, text: rawText }) : rawText;
  const previewText = rawText || (attachment?.type === 'image' ? '📷 Зураг' : attachment?.type === 'audio' ? '🎤 Дуут мессеж' : metadata?.productName || 'Мессеж');
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO messages (chat_id,text,isFromAdmin,createdAt,read,pinned,liked) VALUES (?,?,?,?,?,?,?)')
      .bind(chatId, storedText, 1, now, 0, 0, 0),
    env.DB.prepare('UPDATE chats SET lastMessage = ?, lastMessageAt = ?, unreadByUser = unreadByUser + 1, needsAdmin = 0 WHERE id = ?')
      .bind(previewText, now, chatId),
  ]);
  return { status: 200, data: { ok: true } };
}

/** POST /api/admin/chat/pin { messageId, pinned } — pin/unpin a message. */
export async function pinMessage(body, env, user) {
  requireAdmin(user);
  const id = (body?.messageId || '').toString();
  if (!id) return { status: 400, data: { error: 'messageId шаардлагатай.' } };
  await env.DB.prepare('UPDATE messages SET pinned = ? WHERE id = ?').bind(body?.pinned ? 1 : 0, id).run();
  return { status: 200, data: { ok: true } };
}

/** POST /api/admin/chat/like { messageId, liked } — like/unlike a message. */
export async function likeMessage(body, env, user) {
  requireAdmin(user);
  const id = (body?.messageId || '').toString();
  if (!id) return { status: 400, data: { error: 'messageId шаардлагатай.' } };
  await env.DB.prepare('UPDATE messages SET liked = ? WHERE id = ?').bind(body?.liked ? 1 : 0, id).run();
  return { status: 200, data: { ok: true } };
}

/** POST /api/admin/chat/broadcast { text } — send an announcement to every conversation using D1 batch. */
export async function broadcastMessage(body, env, user) {
  requireAdmin(user);
  const text = (body?.text || '').toString().trim();
  if (!text) return { status: 400, data: { error: 'Хоосон зар.' } };
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare('SELECT id FROM chats').all();
  const stmts = [];
  for (const c of results || []) {
    stmts.push(
      env.DB.prepare('INSERT INTO messages (chat_id,text,isFromAdmin,createdAt,read,pinned,liked) VALUES (?,?,?,?,?,?,?)')
        .bind(c.id, text, 1, now, 0, 0, 0),
      env.DB.prepare('UPDATE chats SET lastMessage = ?, lastMessageAt = ?, unreadByUser = unreadByUser + 1 WHERE id = ?')
        .bind(text, now, c.id)
    );
  }
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  return { status: 200, data: { ok: true, sent: (results || []).length } };
}

import { handleAutonomousChatTurn } from './ai-agent.js';

export async function sendMessage(body, env, user) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  const rawText = (body?.text || '').toString().trim();
  const attachment = body?.attachment && typeof body.attachment === 'object' ? body.attachment : null;
  let metadata = body?.metadata && typeof body.metadata === 'object' ? { ...body.metadata } : null;
  if (attachment) {
    metadata = { ...(metadata || {}), attachment };
  }
  if (!rawText && !metadata) return { status: 400, data: { error: 'Хоосон мессеж.' } };
  // Prevent non-admin users from spoofing sender: 'admin'
  const isFromAdmin = body?.sender === 'admin' && user?.isAdmin ? 1 : 0;
  const storedText = metadata ? JSON.stringify({ __meta: metadata, text: rawText }) : rawText;
  const previewText = rawText || (attachment?.type === 'image' ? '📷 Зураг' : attachment?.type === 'audio' ? '🎤 Дуут мессеж' : metadata?.productName || 'Барааны лавлагаа');
  const now = new Date().toISOString();

  let chat = await env.DB.prepare('SELECT id FROM chats WHERE userId = ?').bind(user.uid).first();
  let chatId = chat?.id;
  if (!chatId) {
    chatId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO chats (id,userId,userName,lastMessage,lastMessageAt,unreadByAdmin,unreadByUser,needsAdmin,createdAt) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(chatId, user.uid, user.name || user.phone || 'Хэрэглэгч', previewText, now, isFromAdmin ? 0 : 1, isFromAdmin ? 1 : 0, isFromAdmin ? 0 : 1, now).run();
  } else if (isFromAdmin) {
    await env.DB.prepare('UPDATE chats SET lastMessage = ?, lastMessageAt = ?, unreadByUser = unreadByUser + 1 WHERE id = ?')
      .bind(previewText, now, chatId).run();
  } else {
    await env.DB.prepare('UPDATE chats SET lastMessage = ?, lastMessageAt = ?, unreadByAdmin = unreadByAdmin + 1, needsAdmin = 1 WHERE id = ?')
      .bind(previewText, now, chatId).run();
  }
  await env.DB.prepare('INSERT INTO messages (chat_id,text,isFromAdmin,createdAt,read,pinned,liked) VALUES (?,?,?,?,?,?,?)')
    .bind(chatId, storedText, isFromAdmin, now, 0, 0, 0).run();

  // Trigger 24/7 Autonomous AI Sales & Support Agent on customer messages
  // (Skip when client is already running its own quick-reply or product card sequence)
  const skipAutoAgent =
    isFromAdmin ||
    metadata?.type === 'product' ||
    rawText === 'Оператор дуудлаа. Түр хүлээгээрэй.' ||
    rawText === 'Оператортой чатлах' ||
    rawText === 'Link-ээр бараа, үйлчилгээ захиалах';

  if (!skipAutoAgent && env.AUTO_CHAT_DISABLED !== 'true') {
    await handleAutonomousChatTurn(env, { chatId, user, text: rawText, metadata });
  }

  return { status: 200, data: { ok: true, chatId } };
}
