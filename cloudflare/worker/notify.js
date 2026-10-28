/**
 * notify.js — Executive Notification & Daily Digest Engine.
 *
 * Delivers high-priority alerts and daily autonomous operations summaries to the owner via:
 *   1. Telegram Bot (`env.TELEGRAM_BOT_TOKEN` + `env.TELEGRAM_CHAT_ID`) when configured.
 *   2. Internal Admin Bot Conversation in D1 (`chats` table, `userId = 'system-autonomous-bot'`)
 *      so every alert and daily report is always visible inside the Web Admin Chat even
 *      without external credentials.
 */

const BOT_UID = 'system-autonomous-bot';
const BOT_NAME = '🤖 Автомат Удирдлагын Бот';

/**
 * Send a notification to the store owner via Telegram (if configured) + D1 Admin Chat.
 */
export async function notifyOwner(env, { title, body, level = 'info', notifyAdminChat = true }) {
  const emoji = level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
  const fullText = `${emoji} ${title}\n\n${body}`;

  // 1. Send via Telegram Bot if configured
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: fullText,
          disable_web_page_preview: true,
        }),
      });
    } catch (e) {
      console.error('Telegram notify failed:', e?.message);
    }
  }

  // 2. Record in D1 Admin Chat so the owner sees it in AdminChat UI
  if (notifyAdminChat && env.DB) {
    try {
      const now = new Date().toISOString();
      const chat = await env.DB.prepare('SELECT id FROM chats WHERE userId = ?').bind(BOT_UID).first();
      let chatId = chat?.id;
      const preview = `${emoji} ${title}`.slice(0, 80);
      if (!chatId) {
        chatId = 'system-autonomous-bot-chat';
        await env.DB.prepare(
          'INSERT OR REPLACE INTO chats (id,userId,userName,lastMessage,lastMessageAt,unreadByAdmin,unreadByUser,needsAdmin,createdAt) VALUES (?,?,?,?,?,?,?,?,?)'
        ).bind(chatId, BOT_UID, BOT_NAME, preview, now, 1, 0, level === 'critical' ? 1 : 0, now).run();
      } else {
        await env.DB.prepare(
          'UPDATE chats SET lastMessage = ?, lastMessageAt = ?, unreadByAdmin = unreadByAdmin + 1, needsAdmin = CASE WHEN ? = 1 THEN 1 ELSE needsAdmin END WHERE id = ?'
        ).bind(preview, now, level === 'critical' ? 1 : 0, chatId).run();
      }
      await env.DB.prepare(
        'INSERT INTO messages (chat_id,text,isFromAdmin,createdAt,read,pinned,liked) VALUES (?,?,?,?,?,?,?)'
      ).bind(chatId, fullText, 0, now, 0, 0, 0).run();
    } catch (e) {
      console.error('D1 bot chat notify failed:', e?.message);
    }
  }
}

/**
 * Compile and send the daily 1-page Executive Summary to the owner.
 */
export async function sendDailyExecutiveReport(env) {
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [ordersRow, confirmedRow, chatsRow, escalatedRow, activeProductsRow, marketingRow, errorsRow] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE createdAt >= ?').bind(sinceIso).first().catch(() => ({ n: 0 })),
    env.DB.prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS rev FROM orders WHERE createdAt >= ? AND trackingStage NOT IN ('received','cancelled') AND status != 'Cancelled'"
    ).bind(sinceIso).first().catch(() => ({ n: 0, rev: 0 })),
    env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE createdAt >= ? AND isFromAdmin = 1').bind(sinceIso).first().catch(() => ({ n: 0 })),
    env.DB.prepare("SELECT COUNT(*) AS n FROM chats WHERE needsAdmin = 1 AND userId != ?").bind(BOT_UID).first().catch(() => ({ n: 0 })),
    env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active'").first().catch(() => ({ n: 0 })),
    env.DB.prepare("SELECT data FROM settings WHERE id = 'marketing_posts'").first().catch(() => null),
    env.DB.prepare("SELECT data FROM settings WHERE id = 'telemetry_errors'").first().catch(() => null),
  ]);

  let recentPosts = 0;
  if (marketingRow?.data) {
    try {
      const parsed = JSON.parse(marketingRow.data);
      const list = Array.isArray(parsed?.posts) ? parsed.posts : [];
      recentPosts = list.filter((p) => p.publishedAt >= sinceIso).length;
    } catch { /* ignore */ }
  }

  let recentErrors = 0;
  if (errorsRow?.data) {
    try {
      const parsed = JSON.parse(errorsRow.data);
      const list = Array.isArray(parsed?.errors) ? parsed.errors : [];
      recentErrors = list.filter((e) => e.lastSeen >= sinceIso).length;
    } catch { /* ignore */ }
  }

  const totalOrders = Number(ordersRow?.n) || 0;
  const confirmedOrders = Number(confirmedRow?.n) || 0;
  const revenueMNT = Math.round(Number(confirmedRow?.rev) || 0);
  const aiReplies = Number(chatsRow?.n) || 0;
  const pendingEscalations = Number(escalatedRow?.n) || 0;
  const activeProducts = Number(activeProductsRow?.n) || 0;

  const dateStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const lines = [
    `📅 Огноо: ${dateStr} (Сүүлийн 24 цаг)`,
    `────────────────────────`,
    `💰 Борлуулалт (Баталгаажсан): ${revenueMNT.toLocaleString()}₮ (${confirmedOrders}/${totalOrders} захиалга)`,
    `📦 Идэвхтэй барааны сан: ${activeProducts.toLocaleString()} бараа`,
    `🤖 AI Чатботын өгсөн хариулт: ${aiReplies} мессеж`,
    `📣 Автомат Маркетинг: ${recentPosts} пост/видео нийтлэгдсэн`,
    `🛡️ Системийн алдаа (Watchdog): ${recentErrors === 0 ? '0 (Хэвийн)' : `${recentErrors} бүртгэгдсэн`}`,
    `────────────────────────`,
    pendingEscalations > 0
      ? `⚠️ Таны оролцоо шаардлагатай чат: ${pendingEscalations} байна (Админ чат хэсгийг шалгана уу).`
      : `✨ Таны оролцоо шаардлагатай асуудал байхгүй байна! Бүх систем 100% автомат ажиллаж байна.`,
  ];

  await notifyOwner(env, {
    title: `ӨДРИЙН АВТОМАТ ТАЙЛАН (${dateStr})`,
    body: lines.join('\n'),
    level: pendingEscalations > 0 ? 'warning' : 'success',
  });

  return {
    date: dateStr,
    totalOrders,
    confirmedOrders,
    revenueMNT,
    aiReplies,
    pendingEscalations,
    activeProducts,
    recentPosts,
    recentErrors,
  };
}
