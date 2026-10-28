/**
 * social-webhook.js — Meta (Facebook Page & Instagram) Autonomous Comment & Messenger Seller.
 *
 * Endpoints:
 *   GET  /api/webhooks/meta   — Meta Hub challenge verification (`hub.verify_token`)
 *   POST /api/webhooks/meta   — Handles:
 *     1. Facebook Page & Instagram Post Comments ("үнэ", "хэд вэ", "захиалъя", etc.):
 *        - Extracts product code from post/comment or finds the matching product in D1
 *        - Replies publicly to the comment
 *        - Sends a Private Reply DM with the full MNT price breakdown + checkout link
 *     2. Facebook Messenger & Instagram Direct Messages:
 *        - Runs `generateAutonomousReply` (D1 catalog + order RAG)
 *        - Replies directly via Graph API `/me/messages`
 *        - Mirrors the conversation into D1 `chats` & `messages` so it is visible in AdminChat
 */

import { generateAutonomousReply } from './ai-agent.js';

const GRAPH_API = 'https://graph.facebook.com/v21.0';
const COMMENT_TRIGGER_REGEX = /үнэ|хэд|захиал|авъя|авах|байна уу|хүргэлт|мэдээлэл|price|une|hed|zahial|avya/i;

/**
 * GET /api/webhooks/meta — Meta webhook verification handshake.
 */
export function verifyMetaWebhook(url, env) {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = env.META_VERIFY_TOKEN || 'costco-mn-meta-verify-2026';

  if (mode === 'subscribe' && token === expected) {
    return new Response(challenge || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

/**
 * POST /api/webhooks/meta — Process incoming Facebook Page & Instagram events.
 */
export async function handleMetaWebhook(body, env) {
  const pageToken = env.FB_PAGE_ACCESS_TOKEN;
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entry of entries) {
    // 1. Messenger / Instagram Direct Messages (`entry.messaging`)
    const messagingList = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const evt of messagingList) {
      if (evt.message?.is_echo) continue;
      const senderId = evt.sender?.id;
      const text = evt.message?.text;
      if (!senderId || !text) continue;

      await handleSocialDirectMessage(env, {
        senderId,
        text,
        platform: body.object === 'instagram' ? 'instagram' : 'facebook',
        pageToken,
      });
    }

    // 2. Page Feed Comments (`entry.changes`)
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const chg of changes) {
      const val = chg.value || {};
      // Skip comments authored by the Page itself
      if (val.item === 'comment' && val.verb === 'add' && val.from?.id && val.from.id !== entry.id) {
        await handleSocialComment(env, {
          commentId: val.comment_id || val.id,
          postId: val.post_id,
          senderId: val.from.id,
          senderName: val.from.name || 'Facebook Хэрэглэгч',
          message: val.message || '',
          pageToken,
        });
      }
    }
  }

  return { status: 200, data: { received: true } };
}

async function handleSocialDirectMessage(env, { senderId, text, platform, pageToken }) {
  const socialUid = `social_${platform}_${senderId}`;
  const socialName = `${platform === 'instagram' ? 'IG' : 'FB'} #${String(senderId).slice(-4)}`;

  const aiResult = await generateAutonomousReply(env, {
    user: { uid: socialUid, name: socialName },
    text,
  });

  // Record in D1 `chats` + `messages` so AdminChat has unified visibility
  const now = new Date().toISOString();
  try {
    let chat = await env.DB.prepare('SELECT id FROM chats WHERE userId = ?').bind(socialUid).first();
    let chatId = chat?.id;
    if (!chatId) {
      chatId = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO chats (id,userId,userName,lastMessage,lastMessageAt,unreadByAdmin,unreadByUser,needsAdmin,createdAt) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(chatId, socialUid, socialName, aiResult.reply.slice(0, 100), now, aiResult.escalate ? 1 : 0, 0, aiResult.escalate ? 1 : 0, now).run();
    } else {
      await env.DB.prepare(
        'UPDATE chats SET lastMessage = ?, lastMessageAt = ?, needsAdmin = ? WHERE id = ?'
      ).bind(aiResult.reply.slice(0, 100), now, aiResult.escalate ? 1 : 0, chatId).run();
    }
    await env.DB.batch([
      env.DB.prepare('INSERT INTO messages (chat_id,text,isFromAdmin,createdAt,read,pinned,liked) VALUES (?,?,?,?,?,?,?)')
        .bind(chatId, text, 0, now, 1, 0, 0),
      env.DB.prepare('INSERT INTO messages (chat_id,text,isFromAdmin,createdAt,read,pinned,liked) VALUES (?,?,?,?,?,?,?)')
        .bind(chatId, aiResult.reply, 1, now, 0, 0, 0),
    ]);
  } catch (e) {
    console.error('Social chat D1 log error:', e?.message);
  }

  // Send reply via Meta Graph API if token is configured
  if (pageToken) {
    try {
      await fetch(`${GRAPH_API}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: aiResult.reply },
        }),
      });
    } catch (e) {
      console.error('Graph API message send error:', e?.message);
    }
  }
}

async function handleSocialComment(env, { commentId, postId, senderName, message, pageToken }) {
  if (!commentId || !COMMENT_TRIGGER_REGEX.test(message)) return;

  // Look up if postId is mapped to a specific product in `settings/marketing_posts`
  let product = null;
  try {
    const row = await env.DB.prepare("SELECT data FROM settings WHERE id = 'marketing_posts'").first();
    if (row?.data) {
      const parsed = JSON.parse(row.data);
      const matchPost = (parsed?.posts || []).find((p) => p.fbPostId === postId || (postId && postId.includes(p.fbPostId)));
      if (matchPost?.productId) {
        product = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(String(matchPost.productId)).first();
      }
    }
  } catch { /* ignore */ }

  // Also check if comment itself has a product code or keyword
  const aiResult = await generateAutonomousReply(env, {
    user: { uid: `comment_${commentId}`, name: senderName },
    text: message,
    metadata: product ? { productId: product.id } : null,
  });

  const publicReply = product
    ? `Сайн байна уу, ${senderName}! 😊 Танд чатаар (Messenger) "${product.name_mn || product.name}" барааны үнэ болон шууд захиалах холбоосыг илгээлээ 📩. Мөн https://costco.mn/product/${product.id} холбоосоор шууд захиалах боломжтой!`
    : `Сайн байна уу, ${senderName}! 😊 Танд чатаар (Messenger) дэлгэрэнгүй мэдээлэл болон захиалах холбоосыг илгээлээ 📩. Манай бүх барааг https://costco.mn сайтаас үзээрэй!`;

  if (pageToken) {
    try {
      // 1. Public comment reply
      await fetch(`${GRAPH_API}/${encodeURIComponent(commentId)}/comments?access_token=${encodeURIComponent(pageToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: publicReply }),
      });

      // 2. Private Messenger DM with full product quote
      await fetch(`${GRAPH_API}/${encodeURIComponent(commentId)}/private_replies?access_token=${encodeURIComponent(pageToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiResult.reply }),
      });
    } catch (e) {
      console.error('Graph API comment reply error:', e?.message);
    }
  }
}
