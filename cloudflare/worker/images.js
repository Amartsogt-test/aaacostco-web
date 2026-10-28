/**
 * images.js — Phase-5 product image hosting on R2 (replaces Firebase Storage).
 *
 * Upload (admin):  POST /api/admin/product/image   raw body = file bytes
 *                  headers: Content-Type = image mime, X-Filename = original name
 *                  → { url }   (a /img/<key> URL served back through this Worker)
 * Serve (public):  GET  /img/<key>                 → the stored object, long-cached
 *
 * Requires the R2 binding IMAGES (wrangler.toml). If R2 isn't enabled yet the upload
 * returns 503 with a clear message and the frontend falls back to Firebase Storage.
 */

import { requireAdmin } from './auth.js';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm'];
const CHAT_TYPES = [...OK_TYPES, 'audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'];

// Store an uploaded request body in R2 (or KV fallback if R2 is not bound) under `dir/`, returning the served URL.
async function putMedia(request, env, dir, allowed) {
  if (!env.IMAGES && !env.CACHE) return { status: 503, data: { error: 'R2/KV (зураг хадгалах сан) идэвхжүүлээгүй байна.' } };
  const ct = (request.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  if (!allowed.includes(ct)) return { status: 415, data: { error: 'Зөвшөөрөгдөөгүй файлын төрөл.' } };
  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) return { status: 400, data: { error: 'Хоосон файл.' } };
  if (body.byteLength > MAX_BYTES) return { status: 413, data: { error: 'Файл 10MB-аас их байна.' } };
  const fname = (request.headers.get('x-filename') || 'upload').replace(/[^\w.-]/g, '_').slice(-60);
  const ext = (fname.includes('.') ? fname.split('.').pop() : (ct.split('/')[1] || 'bin')).toLowerCase().slice(0, 8);
  const key = `${dir}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  if (env.IMAGES) {
    await env.IMAGES.put(key, body, { httpMetadata: { contentType: ct } });
  } else {
    await env.CACHE.put(`media:${key}`, body, {
      metadata: { contentType: ct },
      expirationTtl: 60 * 60 * 24 * 90, // 90 days
    });
  }
  const origin = new URL(request.url).origin;
  return { status: 200, data: { url: `${origin}/img/${key}` } };
}

/** POST /api/admin/product/image — store a product image/video in R2 (admin only). */
export async function uploadProductImage(request, env, user) {
  requireAdmin(user); // throws {status:403} for non-admins
  const ct = (request.headers.get('content-type') || '').split(';')[0].trim();
  const dir = ct.startsWith('video/') ? 'products/videos' : 'products';
  return putMedia(request, env, dir, OK_TYPES);
}

/** POST /api/chat/upload — store a chat attachment (image/audio) in R2 (any signed-in user). */
export async function uploadChatMedia(request, env, user) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  return putMedia(request, env, `chats/${user.uid}`, CHAT_TYPES);
}

/** GET /img/<key> — stream a stored object from R2 (or KV fallback) with immutable caching. */
export async function serveImage(request, env, key) {
  if (env.IMAGES) {
    const obj = await env.IMAGES.get(key);
    if (obj) {
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(obj.body, { headers });
    }
  }
  if (env.CACHE) {
    const { value, metadata } = await env.CACHE.getWithMetadata(`media:${key}`, { type: 'arrayBuffer' });
    if (value) {
      return new Response(value, {
        headers: {
          'Content-Type': metadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  return new Response('Not found', { status: 404 });
}
