/**
 * ai-agent.js — 24/7 Autonomous AI Sales & Customer Support Agent on Cloudflare D1.
 *
 * Capabilities:
 *   1. Live Catalog RAG: Searches `products_fts` / `products` in D1 when a customer asks
 *      about a product, brand, or category, and calculates the exact MNT price including
 *      warehouse price + ground/air shipping from Korea (`settings/currency` & `settings/general`).
 *   2. Live Order Tracking: Looks up the customer's orders in `orders` (by authenticated
 *      `user.uid`, `user.phone`, or an order ID / phone number mentioned in the text) and
 *      reports real-time status & tracking stage.
 *   3. Smart Escalation: Handles 95% of inquiries autonomously (`needsAdmin = 0`). Only
 *      flags `needsAdmin = 1` and alerts the owner (`notifyOwner`) when the customer
 *      explicitly asks for a human operator, refund/return, or reports a damaged item.
 */

import { notifyOwner } from './notify.js';

const GEMINI_MODEL = 'gemini-2.0-flash';

const STAGE_LABELS_MN = {
  received: 'Захиалга хүлээн авсан (Төлбөр хүлээгдэж буй)',
  confirmed: 'Төлбөр баталгаажсан (Худалдан авалтад бэлтгэгдэж байна)',
  purchased: 'Солонгос дахь Costco дэлгүүрээс худалдан авсан',
  warehouse: 'Солонгос дахь карго агуулахад ирсэн',
  shipped: 'Солонгосоос Монгол руу замдаа гарсан',
  customs: 'Монголын гаалийн шалгалтад орсон',
  arrived_ub: 'Улаанбаатар салбарт ирсэн (Хүлээн авахад бэлэн)',
  out_for_delivery: 'Хүргэлтийн жолооч авч гарсан',
  delivered: 'Хэрэглэгчид амжилттай хүлээлгэн өгсөн',
  cancelled: 'Цуцлагдсан',
};

const ESCALATION_PATTERNS = /оператор|хүнтэй ярих|админ дууд|буцаах|буцаалт|эвдэрсэн|хагарсан|дутуу ирсэн|гомдол|мөнгө буцаа/i;
const GREETING_ONLY = /^(сайн байна уу|сайн уу|байна уу|hi|hello|sain uu|sain baina uu)[?!.\s]*$/i;

/**
 * Load live KRW->MNT rate and shipping rates per kg from D1 settings.
 */
async function getPricingContext(env) {
  let wonRate = 2.5;
  let groundRateKRW = 3000;
  let airRateKRW = 7000;
  try {
    const [curRow, genRow] = await Promise.all([
      env.DB.prepare("SELECT data FROM settings WHERE id = 'currency'").first(),
      env.DB.prepare("SELECT data FROM settings WHERE id = 'general'").first(),
    ]);
    if (curRow?.data) {
      const c = JSON.parse(curRow.data);
      if (Number(c.wonRate) > 0) wonRate = Number(c.wonRate);
    }
    if (genRow?.data) {
      const g = JSON.parse(genRow.data);
      if (Number(g?.transportationRates?.ground) > 0) groundRateKRW = Number(g.transportationRates.ground);
      if (Number(g?.transportationRates?.air) > 0) airRateKRW = Number(g.transportationRates.air);
    }
  } catch { /* use defaults */ }
  return { wonRate, groundRateKRW, airRateKRW };
}

/**
 * Compute estimated final MNT price (warehouse price + shipping by weight).
 */
export function computeProductQuoteMNT(p, { wonRate, groundRateKRW, airRateKRW }) {
  const baseKRW = Number(p.estimatedWarehousePrice) > 0
    ? Number(p.estimatedWarehousePrice)
    : (Number(p.price) || 0);
  const weightKg = Number(p.weight) > 0 ? Number(p.weight) : 1.0;
  const baseMNT = Math.round(baseKRW * wonRate);
  const groundTotalMNT = Math.round((baseKRW + weightKg * groundRateKRW) * wonRate);
  const airTotalMNT = Math.round((baseKRW + weightKg * airRateKRW) * wonRate);
  return { baseKRW, baseMNT, weightKg, groundTotalMNT, airTotalMNT };
}

/**
 * Search D1 catalog for products matching the customer's message.
 */
async function findRelevantProducts(env, text, metadata = null) {
  const found = [];
  try {
    // 1. If product inquiry metadata was attached, fetch that exact product first
    if (metadata?.productId) {
      const p = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(String(metadata.productId)).first();
      if (p) found.push(p);
    }

    // 2. If 5-7 digit product code is in the message
    const codeMatch = text.match(/\b(\d{5,7})\b/);
    if (codeMatch && found.length === 0) {
      const p = await env.DB.prepare('SELECT * FROM products WHERE id = ? OR code = ?').bind(codeMatch[1], codeMatch[1]).first();
      if (p) found.push(p);
    }

    // 3. Extract meaningful search keywords (strip common Mongolian chat stop-words)
    const clean = text
      .replace(/[?!.,;:"'()[\]{}]/g, ' ')
      .replace(/\b(сайн|байна|уу|энэ|бараа|үнэ|хэд|вэ|хэдээр|захиалах|авах|гэсэн|юм|бэ|болох|ирэх|бэлэн|байгаа|юу|хүргэлт|тээвэр)\b/gi, ' ')
      .trim();

    const tokens = clean.split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
    if (tokens.length > 0 && found.length < 3) {
      const ftsQuery = tokens.map((t) => `"${t.replace(/"/g, '')}"*`).join(' OR ');
      try {
        const { results } = await env.DB.prepare(
          `SELECT p.* FROM products_fts f JOIN products p ON p.id = f.id
           WHERE products_fts MATCH ? AND p.status = 'active' LIMIT 4`
        ).bind(ftsQuery).all();
        for (const r of results || []) {
          if (!found.some((x) => x.id === r.id)) found.push(r);
        }
      } catch {
        // Fallback LIKE search
        const like = `%${tokens[0]}%`;
        const { results } = await env.DB.prepare(
          `SELECT * FROM products WHERE status = 'active' AND (name_mn LIKE ? OR name LIKE ? OR englishName LIKE ? OR brand LIKE ?) LIMIT 3`
        ).bind(like, like, like, like).all();
        for (const r of results || []) {
          if (!found.some((x) => x.id === r.id)) found.push(r);
        }
      }
    }
  } catch (e) {
    console.error('findRelevantProducts error:', e?.message);
  }
  return found.slice(0, 4);
}

/**
 * Look up relevant orders for the customer.
 */
async function findRelevantOrders(env, user, text) {
  try {
    // Check if user mentioned an explicit 6-digit order ID (e.g. #181402)
    const orderIdMatch = text.match(/#?(\d{6})\b/);
    if (orderIdMatch) {
      const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderIdMatch[1]).first();
      if (o) return [o];
    }
    if (user?.uid && !String(user.uid).startsWith('social_')) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC LIMIT 3'
      ).bind(user.uid).all();
      if (results?.length) return results;
    }
    const phoneMatch = text.match(/\b([6-9]\d{7})\b/);
    const phone = phoneMatch ? phoneMatch[1] : (user?.phone || '');
    if (phone) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM orders WHERE recipientPhone LIKE ? ORDER BY createdAt DESC LIMIT 3'
      ).bind(`%${phone}`).all();
      return results || [];
    }
  } catch (e) {
    console.error('findRelevantOrders error:', e?.message);
  }
  return [];
}

/**
 * Generate an intelligent sales/support reply using D1 context + Gemini (with deterministic fallback).
 */
export async function generateAutonomousReply(env, { user, text, metadata = null }) {
  const raw = (text || '').trim();

  // Check if customer explicitly wants a human operator or has a complaint/return
  if (ESCALATION_PATTERNS.test(raw)) {
    return {
      escalate: true,
      reply:
        'Таны хүсэлтийг хүлээн авч, ахлах оператор руу шилжүүллээ 👨‍💼. Манай ажилтан таны мэдээллийг шалгаад тун удахгүй холбогдох болно. Та нэмэлт зураг эсвэл захиалгын дугаараа үлдээж болно.',
    };
  }

  const pricing = await getPricingContext(env);
  const [products, orders] = await Promise.all([
    findRelevantProducts(env, raw, metadata),
    findRelevantOrders(env, user, raw),
  ]);

  const productContextLines = products.map((p) => {
    const q = computeProductQuoteMNT(p, pricing);
    const title = p.name_mn || p.englishName || p.name;
    const discountNote = p.hasDiscount ? ` (ХЯМДРАЛТАЙ! Хуучин үнэ: ${Math.round((Number(p.originalPrice) || 0) * pricing.wonRate).toLocaleString()}₮)` : '';
    return `- [${p.id}] ${title} | Дэлгүүрийн үнэ: ${q.baseMNT.toLocaleString()}₮${discountNote} | Жин: ~${q.weightKg}кг | Газраар ирэх нийт үнэ: ~${q.groundTotalMNT.toLocaleString()}₮ | Агаараар ирэх нийт үнэ: ~${q.airTotalMNT.toLocaleString()}₮ | Шууд захиалах линк: https://costco.mn/product/${p.id}`;
  });

  const orderContextLines = orders.map((o) => {
    const stageLabel = STAGE_LABELS_MN[o.trackingStage] || o.trackingStage || o.status;
    return `- Захиалга #${o.id} (${(o.date || o.createdAt || '').slice(0, 10)}): Нийт ${Number(o.total || 0).toLocaleString()}${o.currency === 'KRW' ? '₩' : '₮'} | Төлөв: ${stageLabel}`;
  });

  // Try Gemini AI if GEMINI_API_KEY is configured
  if (env.GEMINI_API_KEY) {
    try {
      const systemPrompt = [
        'Чи бол Costco Mongolia (costco.mn) онлайн худалдааны сайтын 24/7 ухаалаг борлуулалтын зөвлөх AI байна.',
        'Дүрэм:',
        '1. Хэрэглэгчид маш эелдэг, товч, тодорхой, Монгол хэлээр хариул.',
        '2. Доорх "ОЛДСОН БАРААНУУД" болон "ХЭРЭГЛЭГЧИЙН ЗАХИАЛГУУД" мэдээллийг ашиглан яг бодит үнэ (газраар болон агаараар ирэх үнэ) болон захиалах линкийг (`https://costco.mn/product/...`) бичиж өг.',
        '3. Тээврийн нөхцөл: Газрын карго 7–14 хоногт, Агаарын карго 3–5 хоногт Солонгосоос Улаанбаатарт ирдэг. 1кг тээврийн зардал барааны жингээр бодогддог.',
        '4. Захиалга хийхдээ https://costco.mn сайтаар ороод сагсандаа нэмж QPay эсвэл банкны шилжүүлгээр шууд баталгаажуулна гэдгийг тайлбарла.',
        '',
        productContextLines.length
          ? `ОЛДСОН БАРААНУУД (Бодит D1 каталогийн мэдээлэл):\n${productContextLines.join('\n')}`
          : 'ОЛДСОН БАРААНУУД: Тухайлсан бараа олдсонгүй.',
        orderContextLines.length
          ? `ХЭРЭГЛЭГЧИЙН ЗАХИАЛГУУД:\n${orderContextLines.join('\n')}`
          : '',
        '',
        `Хэрэглэгчийн мессеж: "${raw || (metadata?.productName ? `${metadata.productName} барааны мэдээлэл` : '')}"`,
      ].filter(Boolean).join('\n');

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
          }),
        }
      );
      if (r.ok) {
        const data = await r.json();
        const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (aiText) return { escalate: false, reply: aiText, matchedProducts: products };
      }
    } catch (e) {
      console.error('Gemini sales agent error:', e?.message);
    }
  }

  // Deterministic high-quality fallback when GEMINI_API_KEY is not set
  if (products.length > 0) {
    const lines = ['Сайн байна уу! Таны сонирхсон барааны мэдээлэл: 👇\n'];
    for (const p of products.slice(0, 3)) {
      const q = computeProductQuoteMNT(p, pricing);
      const title = p.name_mn || p.englishName || p.name;
      lines.push(
        `🛒 **${title}**`,
        `• Дэлгүүрийн үнэ: ${q.baseMNT.toLocaleString()}₮ (Жин: ~${q.weightKg}кг)`,
        `• 🚢 Газраар (7-14 хоног): **${q.groundTotalMNT.toLocaleString()}₮**`,
        `• ✈️ Агаараар (3-5 хоног): **${q.airTotalMNT.toLocaleString()}₮**`,
        `👉 Шууд захиалах: https://costco.mn/product/${p.id}\n`
      );
    }
    lines.push('Та дээрх холбоосоор орж сагсандаа нэмээд QPay-ээр шууд захиалах боломжтой! 😊');
    return { escalate: false, reply: lines.join('\n'), matchedProducts: products };
  }

  if (orders.length > 0 && /захиалга|хаана|ирсэн|хэзээ|төлөв|шалгах/i.test(raw)) {
    const lines = ['Сайн байна уу! Таны сүүлийн захиалгын мэдээлэл: 📦\n'];
    for (const o of orders) {
      const stageLabel = STAGE_LABELS_MN[o.trackingStage] || o.trackingStage || o.status;
      lines.push(`• **Захиалга #${o.id}** — ${Number(o.total || 0).toLocaleString()}₮\n  Төлөв: **${stageLabel}**`);
    }
    lines.push('\nТа https://costco.mn/orders хуудсаар орж дэлгэрэнгүй явцыг харах боломжтой.');
    return { escalate: false, reply: lines.join('\n'), matchedProducts: [] };
  }

  if (GREETING_ONLY.test(raw)) {
    return {
      escalate: false,
      reply:
        'Сайн байна уу! 👋 Costco Mongolia-д тавтай морилно уу. Та хайж буй барааныхаа нэр, код эсвэл захиалгын дугаараа бичвэл би үнэ, тээврийн зардал болон захиалгын явцыг шууд шалгаад өгье! 😊',
      matchedProducts: [],
    };
  }

  return {
    escalate: false,
    reply:
      'Сайн байна уу! 😊 Та сонирхож буй барааныхаа нэр эсвэл 6-7 оронтой кодыг бичвэл би Солонгосоос ирэх эцсийн үнийг шууд тооцоолоод өгье.\n\n• 🚢 Газрын тээвэр: 7–14 хоног\n• ✈️ Агаарын тээвэр: 3–5 хоног\n• Хэрэв оператортой шууд холбогдох бол "Оператор" гэж бичнэ үү.',
    matchedProducts: [],
  };
}

/**
 * Handle an incoming customer message in a D1 chat conversation and auto-reply.
 */
export async function handleAutonomousChatTurn(env, { chatId, user, text, metadata = null }) {
  try {
    // Skip auto-reply if the client already sends its own product summary (`type === 'product'` with empty text)
    if (metadata?.type === 'product' && !text) return;

    const result = await generateAutonomousReply(env, { user, text, metadata });
    const now = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO messages (chat_id,text,isFromAdmin,createdAt,read,pinned,liked) VALUES (?,?,?,?,?,?,?)'
      ).bind(chatId, result.reply, 1, now, 0, 0, 0),
      env.DB.prepare(
        'UPDATE chats SET lastMessage = ?, lastMessageAt = ?, unreadByUser = unreadByUser + 1, needsAdmin = ?, unreadByAdmin = CASE WHEN ? = 1 THEN unreadByAdmin ELSE 0 END WHERE id = ?'
      ).bind(result.reply.slice(0, 100), now, result.escalate ? 1 : 0, result.escalate ? 1 : 0, chatId),
    ]);

    if (result.escalate) {
      await notifyOwner(env, {
        title: `Оператор шаардлагатай чат (${user?.name || user?.phone || 'Хэрэглэгч'})`,
        body: `Хэрэглэгч: ${user?.name || ''} (${user?.phone || user?.uid})\nМессеж: "${text}"`,
        level: 'warning',
      });
    }
  } catch (e) {
    console.error('handleAutonomousChatTurn failed:', e?.message);
  }
}
