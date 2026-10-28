/**
 * Autonomous Promotional Poster Generator (scripts/marketing/poster-generator.js)
 *
 * Uses `sharp` + SVG vector overlays to render 1080x1080 branded Costco.mn
 * promotional posters ready for Facebook & Instagram Feed publishing.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const POSTERS_DIR = path.join(ROOT_DIR, 'output', 'marketing', 'posters');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function escapeXml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function wrapTextLines(text, maxCharsPerLine = 32, maxLines = 2) {
    const words = String(text || '').trim().split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxCharsPerLine) {
            current = next;
        } else {
            if (current) lines.push(current);
            current = word;
            if (lines.length >= maxLines - 1) break;
        }
    }
    if (current && lines.length < maxLines) {
        lines.push(
            current.length > maxCharsPerLine
                ? `${current.slice(0, maxCharsPerLine - 1)}…`
                : current
        );
    }
    return lines;
}

export async function fetchProductImageBuffer(imageUrl, size = 620) {
    if (imageUrl) {
        try {
            const res = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 12000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });
            return await sharp(Buffer.from(res.data))
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 },
                })
                .png()
                .toBuffer();
        } catch {
            /* fallback to placeholder */
        }
    }

    const fallbackSvg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" rx="24" fill="#ffffff"/>
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
              font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#005daa">
            COSTCO KOREA
        </text>
    </svg>`;
    return sharp(Buffer.from(fallbackSvg)).png().toBuffer();
}

export async function generatePromotionalPoster(product, campaignType = 'flash_sale') {
    ensureDir(POSTERS_DIR);

    const width = 1080;
    const height = 1080;
    const hasDiscount = product.savingsMNT > 0;
    const titleLines = wrapTextLines(product.titleMn, 34, 2);

    const badgeText =
        campaignType === 'flash_sale' && hasDiscount
            ? `ОНЦГОЙ ХЯМДРАЛ -${product.discountPercent}%`
            : campaignType === 'new_arrival'
            ? 'ШИНЭ БАРАА'
            : campaignType === 'clearance'
            ? 'ДУУСАЖ БУЙ ХЯМДРАЛ'
            : 'COSTCO ОНЦЛОХ';

    const backgroundSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0b1f3a"/>
                <stop offset="60%" stop-color="#003da5"/>
                <stop offset="100%" stop-color="#07162c"/>
            </linearGradient>
            <linearGradient id="redBadge" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#e31837"/>
                <stop offset="100%" stop-color="#ff3b56"/>
            </linearGradient>
        </defs>

        <!-- Background -->
        <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>

        <!-- Top Brand Bar -->
        <rect x="60" y="42" width="320" height="64" rx="14" fill="#e31837"/>
        <text x="220" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#ffffff">
            COSTCO.MN
        </text>

        <!-- Campaign Badge -->
        <rect x="640" y="42" width="380" height="64" rx="32" fill="#ffffff" fill-opacity="0.15"/>
        <text x="830" y="83" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" font-weight="bold" fill="#ffd166">
            ${escapeXml(badgeText)}
        </text>

        <!-- Product Card Frame -->
        <rect x="60" y="135" width="960" height="610" rx="32" fill="#ffffff"/>

        <!-- Bottom Info Panel -->
        <rect x="60" y="770" width="960" height="260" rx="28" fill="#081528" fill-opacity="0.92" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2"/>

        <!-- Product Title Lines -->
        <text x="100" y="832" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#ffffff">
            ${escapeXml(titleLines[0] || product.titleMn)}
        </text>
        ${
            titleLines[1]
                ? `<text x="100" y="876" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#cbd5e1">${escapeXml(titleLines[1])}</text>`
                : ''
        }

        <!-- Price Display -->
        <text x="100" y="962" font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="#ffd166">
            ${escapeXml(product.priceMNT.toLocaleString())}₮
        </text>

        ${
            hasDiscount
                ? `<text x="100" y="1006" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#94a3b8" text-decoration="line-through">
                    Үндсэн үнэ: ${escapeXml(product.oldPriceMNT.toLocaleString())}₮
                   </text>
                   <text x="430" y="1006" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#4ade80">
                    Хэмнэлт: ${escapeXml(product.savingsMNT.toLocaleString())}₮
                   </text>`
                : `<text x="100" y="1006" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#94a3b8">
                    Солонгос Костко үнэ: ₩${escapeXml(product.priceKRW.toLocaleString())}
                   </text>`
        }

        <!-- SKU / CTA Pill -->
        <rect x="700" y="905" width="280" height="92" rx="20" fill="url(#redBadge)"/>
        <text x="840" y="946" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="bold" fill="#ffffff">
            КОД: #${escapeXml(product.code)}
        </text>
        <text x="840" y="980" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#ffe4e6">
            costco.mn захиалах
        </text>
    </svg>`;

    const productImgBuffer = await fetchProductImageBuffer(product.image, 560);

    const composites = [
        {
            input: productImgBuffer,
            top: 160,
            left: 260,
        },
    ];

    if (hasDiscount && product.discountPercent > 0) {
        const discountBadgeSvg = `
        <svg width="210" height="210" xmlns="http://www.w3.org/2000/svg">
            <circle cx="105" cy="105" r="95" fill="#e31837" stroke="#ffffff" stroke-width="6"/>
            <text x="105" y="98" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="900" fill="#ffffff">
                -${escapeXml(product.discountPercent)}%
            </text>
            <text x="105" y="138" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#ffd166">
                ХЯМДРАЛ
            </text>
        </svg>`;
        composites.push({
            input: Buffer.from(discountBadgeSvg),
            top: 155,
            left: 780,
        });
    }

    const outPath = path.join(POSTERS_DIR, `${product.code}-${campaignType}.png`);
    await sharp(Buffer.from(backgroundSvg))
        .composite(composites)
        .png({ quality: 92 })
        .toFile(outPath);

    return outPath;
}
