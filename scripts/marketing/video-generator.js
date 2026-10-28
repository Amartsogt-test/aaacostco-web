/**
 * Autonomous Reels / Shorts Video & Storyboard Generator (scripts/marketing/video-generator.js)
 *
 * 1. Renders 4 vertical 9:16 (1080x1920) high-converting storyboard frames using `sharp`.
 * 2. Saves the voiceover script and storyboard metadata (`storyboard.json`).
 * 3. Automatically encodes a 1080x1920 MP4 Reel via `ffmpeg` if FFmpeg is available on PATH,
 *    or falls back to a 4-slide 9:16 Story/Carousel package.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { escapeXml, fetchProductImageBuffer } from './poster-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const VIDEOS_DIR = path.join(ROOT_DIR, 'output', 'marketing', 'videos');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function hasFfmpeg() {
    try {
        execSync('ffmpeg -version', { stdio: 'ignore', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

async function renderVerticalSlide(product, slide, productImgBuffer, outFile) {
    const width = 1080;
    const height = 1920;

    const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="reelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#061224"/>
                <stop offset="50%" stop-color="#00338d"/>
                <stop offset="100%" stop-color="#091930"/>
            </linearGradient>
        </defs>

        <rect width="${width}" height="${height}" fill="url(#reelGrad)"/>

        <!-- Top Header -->
        <rect x="70" y="90" width="320" height="72" rx="16" fill="#e31837"/>
        <text x="230" y="138" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="900" fill="#ffffff">
            COSTCO.MN
        </text>

        <rect x="650" y="90" width="360" height="72" rx="36" fill="#ffffff" fill-opacity="0.14"/>
        <text x="830" y="136" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#ffd166">
            ${escapeXml(slide.badge)}
        </text>

        <!-- Center Product Stage -->
        <rect x="90" y="240" width="900" height="900" rx="44" fill="#ffffff"/>

        <!-- Bottom Story Card -->
        <rect x="70" y="1210" width="940" height="540" rx="36" fill="#081528" fill-opacity="0.94" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2"/>

        <text x="540" y="1330" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="#ffd166">
            ${escapeXml(slide.headline.slice(0, 26))}
        </text>
        ${
            slide.headline.length > 26
                ? `<text x="540" y="1386" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#ffffff">${escapeXml(slide.headline.slice(26, 54))}</text>`
                : ''
        }

        <text x="540" y="1480" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#cbd5e1">
            ${escapeXml(slide.subtext)}
        </text>

        <!-- Bottom CTA Pill -->
        <rect x="190" y="1565" width="700" height="110" rx="55" fill="#e31837"/>
        <text x="540" y="1632" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#ffffff">
            Захиалах: costco.mn | #${escapeXml(product.code)}
        </text>
    </svg>`;

    await sharp(Buffer.from(svg))
        .composite([
            {
                input: productImgBuffer,
                top: 310,
                left: 160,
            },
        ])
        .png({ quality: 92 })
        .toFile(outFile);
}

export async function generateMarketingReel(product, copyData) {
    const productVideoDir = path.join(VIDEOS_DIR, String(product.code));
    ensureDir(productVideoDir);

    const productImgBuffer = await fetchProductImageBuffer(product.image, 760);
    const slides = Array.isArray(copyData.reelSlides) ? copyData.reelSlides : [];
    const slideFiles = [];

    for (let i = 0; i < slides.length; i += 1) {
        const slidePath = path.join(productVideoDir, `slide-${i + 1}.png`);
        await renderVerticalSlide(product, slides[i], productImgBuffer, slidePath);
        slideFiles.push(slidePath);
    }

    const storyboardPath = path.join(productVideoDir, 'storyboard.json');
    const mp4Path = path.join(VIDEOS_DIR, `${product.code}-reel.mp4`);
    let mp4Generated = false;

    if (hasFfmpeg() && slideFiles.length > 0) {
        try {
            // Encode 4 vertical slides (3.5 seconds per slide = 14s 1080x1920 H.264 MP4 Reel)
            const listFile = path.join(productVideoDir, 'ffmpeg-inputs.txt');
            const listContent = slideFiles
                .map((file) => `file '${file.replace(/\\/g, '/')}'\nduration 3.5`)
                .concat([`file '${slideFiles[slideFiles.length - 1].replace(/\\/g, '/')}'`])
                .join('\n');
            fs.writeFileSync(listFile, listContent, 'utf8');

            execSync(
                `ffmpeg -y -f concat -safe 0 -i "${listFile}" -vf "scale=1080:1920,format=yuv420p" -r 30 -c:v libx264 -pix_fmt yuv420p "${mp4Path}"`,
                { stdio: 'ignore', timeout: 60000 }
            );
            mp4Generated = fs.existsSync(mp4Path);
        } catch {
            mp4Generated = false;
        }
    }

    const metadata = {
        productCode: product.code,
        titleMn: product.titleMn,
        generatedAt: new Date().toISOString(),
        voiceoverScript: copyData.voiceoverScript,
        slideFiles,
        mp4Path: mp4Generated ? mp4Path : null,
        mp4Generated,
    };

    fs.writeFileSync(storyboardPath, JSON.stringify(metadata, null, 2), 'utf8');
    return metadata;
}
