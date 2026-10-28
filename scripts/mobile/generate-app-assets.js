/**
 * Autonomous App Store & Google Play Store Asset Generator
 * (scripts/mobile/generate-app-assets.js)
 *
 * Uses `sharp` to generate all required native icons, splash screens, feature graphics,
 * and store listing screenshots for both Apple App Store (iOS) and Google Play Store (Android):
 *  - iOS 1024x1024 AppIcon (flattened RGB without alpha channel, per Apple App Store guideline)
 *  - Android mipmap launcher icons (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi)
 *  - iOS & Android 2732x2732 universal splash screens
 *  - Google Play 512x512 high-res icon & 1024x500 Feature Graphic
 *  - 3 App Store (1290x2796 iPhone 6.7") & 3 Play Store (1080x1920) promotional screenshots
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function buildMasterIconSvg(size = 1024, rounded = false) {
    const rx = rounded ? Math.round(size * 0.22) : 0;
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="iconBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#004990"/>
                <stop offset="55%" stop-color="#005DA3"/>
                <stop offset="100%" stop-color="#04264E"/>
            </linearGradient>
        </defs>
        <rect width="1024" height="1024" rx="${rx}" fill="url(#iconBg)"/>
        <rect x="112" y="290" width="800" height="220" rx="44" fill="#E31837"/>
        <text x="512" y="440" text-anchor="middle" font-family="Arial, sans-serif" font-size="126" font-weight="900" fill="#FFFFFF" letter-spacing="4">
            COSTCO
        </text>
        <text x="512" y="675" text-anchor="middle" font-family="Arial, sans-serif" font-size="112" font-weight="900" fill="#FFD166" letter-spacing="8">
            MONGOLIA
        </text>
        <rect x="232" y="745" width="560" height="16" rx="8" fill="#E31837"/>
    </svg>`;
}

function buildSplashSvg(size = 2732) {
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="splashBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#041C3B"/>
                <stop offset="50%" stop-color="#005DA3"/>
                <stop offset="100%" stop-color="#03152E"/>
            </linearGradient>
        </defs>
        <rect width="2732" height="2732" fill="url(#splashBg)"/>
        <rect x="866" y="1090" width="1000" height="260" rx="52" fill="#E31837"/>
        <text x="1366" y="1268" text-anchor="middle" font-family="Arial, sans-serif" font-size="152" font-weight="900" fill="#FFFFFF" letter-spacing="6">
            COSTCO.MN
        </text>
        <text x="1366" y="1510" text-anchor="middle" font-family="Arial, sans-serif" font-size="68" font-weight="bold" fill="#FFD166">
            Солонгос Костко Албан Ёсны Захиалга
        </text>
    </svg>`;
}

function buildFeatureGraphicSvg() {
    return `
    <svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="featBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#041C3B"/>
                <stop offset="55%" stop-color="#005DA3"/>
                <stop offset="100%" stop-color="#071B36"/>
            </linearGradient>
        </defs>
        <rect width="1024" height="500" fill="url(#featBg)"/>
        <rect x="70" y="90" width="380" height="105" rx="24" fill="#E31837"/>
        <text x="260" y="160" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" font-weight="900" fill="#FFFFFF">
            COSTCO.MN
        </text>
        <text x="70" y="280" font-family="Arial, sans-serif" font-size="44" font-weight="900" fill="#FFD166">
            Солонгос Костко Шууд Захиалга
        </text>
        <text x="70" y="345" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#E2E8F0">
            8,000+ Оригинал Бараа • Шуурхай Тээвэр • 24/7 AI Туслах
        </text>
        <rect x="70" y="390" width="420" height="56" rx="28" fill="#FFFFFF" fill-opacity="0.16"/>
        <text x="280" y="427" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF">
            Android &amp; iOS Албан Ёсны Апп
        </text>
    </svg>`;
}

function escapeXml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function buildStoreScreenshotSvg(width, height, slide) {
    return `
    <svg width="${width}" height="${height}" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="shotBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#061A38"/>
                <stop offset="50%" stop-color="#004C91"/>
                <stop offset="100%" stop-color="#041226"/>
            </linearGradient>
        </defs>
        <rect width="1080" height="1920" fill="url(#shotBg)"/>
        <rect x="340" y="110" width="400" height="84" rx="42" fill="#E31837"/>
        <text x="540" y="165" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="900" fill="#FFFFFF">
            COSTCO.MN
        </text>
        <text x="540" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="900" fill="#FFD166">
            ${escapeXml(slide.title)}
        </text>
        <text x="540" y="385" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#E2E8F0">
            ${escapeXml(slide.subtitle)}
        </text>
        <!-- App Preview Card -->
        <rect x="90" y="470" width="900" height="1260" rx="56" fill="#FFFFFF"/>
        <rect x="90" y="470" width="900" height="140" rx="56" fill="#005DA3"/>
        <text x="540" y="555" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="#FFFFFF">
            ${escapeXml(slide.header)}
        </text>
        ${slide.features
            .map(
                (feat, i) => `
            <rect x="150" y="${680 + i * 240}" width="780" height="190" rx="28" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="2"/>
            <circle cx="235" cy="${775 + i * 240}" r="46" fill="#E31837"/>
            <text x="235" y="${791 + i * 240}" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="900" fill="#FFFFFF">
                ${i + 1}
            </text>
            <text x="310" y="${755 + i * 240}" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#0F172A">
                ${escapeXml(feat.heading)}
            </text>
            <text x="310" y="${805 + i * 240}" font-family="Arial, sans-serif" font-size="22" fill="#475569">
                ${escapeXml(feat.desc)}
            </text>`
            )
            .join('\n')}
        <rect x="190" y="1560" width="700" height="104" rx="52" fill="#E31837"/>
        <text x="540" y="1624" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#FFFFFF">
            Шууд Захиалах • costco.mn
        </text>
    </svg>`;
}

async function main() {
    console.log('🎨 [Mobile Assets] Generating iOS App Store & Android Play Store assets...');

    // 1. iOS 1024x1024 AppIcon (MUST have no alpha channel for Apple App Store!)
    const iosIconDir = path.join(ROOT_DIR, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
    if (fs.existsSync(iosIconDir)) {
        const iosIconPath = path.join(iosIconDir, 'AppIcon-512@2x.png');
        await sharp(Buffer.from(buildMasterIconSvg(1024, false)))
            .flatten({ background: '#005DA3' })
            .png()
            .toFile(iosIconPath);
        console.log(`✅ [Mobile Assets] iOS 1024x1024 AppIcon generated: ${iosIconPath}`);
    }

    // 2. Android mipmap icons
    const androidMipmaps = [
        { folder: 'mipmap-mdpi', size: 48 },
        { folder: 'mipmap-hdpi', size: 72 },
        { folder: 'mipmap-xhdpi', size: 96 },
        { folder: 'mipmap-xxhdpi', size: 144 },
        { folder: 'mipmap-xxxhdpi', size: 192 },
    ];
    for (const m of androidMipmaps) {
        const dir = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res', m.folder);
        if (fs.existsSync(dir)) {
            await sharp(Buffer.from(buildMasterIconSvg(1024, false)))
                .resize(m.size, m.size)
                .png()
                .toFile(path.join(dir, 'ic_launcher.png'));
            await sharp(Buffer.from(buildMasterIconSvg(1024, true)))
                .resize(m.size, m.size)
                .png()
                .toFile(path.join(dir, 'ic_launcher_round.png'));
            await sharp(Buffer.from(buildMasterIconSvg(1024, false)))
                .resize(m.size, m.size)
                .png()
                .toFile(path.join(dir, 'ic_launcher_foreground.png'));
        }
    }
    console.log('✅ [Mobile Assets] Android mipmap launcher icons generated.');

    // 3. iOS & Android Splash Screens (2732x2732)
    const splashBuffer = await sharp(Buffer.from(buildSplashSvg(2732)))
        .flatten({ background: '#005DA3' })
        .png()
        .toBuffer();

    const iosSplashDir = path.join(ROOT_DIR, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');
    if (fs.existsSync(iosSplashDir)) {
        for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
            fs.writeFileSync(path.join(iosSplashDir, name), splashBuffer);
        }
        console.log('✅ [Mobile Assets] iOS 2732x2732 Splash screens generated.');
    }

    const androidDrawableDir = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res', 'drawable');
    if (fs.existsSync(androidDrawableDir)) {
        await sharp(splashBuffer)
            .resize(1080, 1920, { fit: 'cover' })
            .png()
            .toFile(path.join(androidDrawableDir, 'splash.png'));
        console.log('✅ [Mobile Assets] Android drawable/splash.png generated.');
    }

    // 4. Fastlane Store Metadata Images (Play Store 512x512 Icon, 1024x500 Feature Graphic, Screenshots)
    const screenshotSlides = [
        {
            name: '1_catalog.png',
            title: 'Солонгос Костко Монголд',
            subtitle: '8,000+ Оригинал Барааг Гэрээсээ Захиалаарай',
            header: 'Албан Ёсны Каталог & Хямдрал',
            features: [
                { heading: 'Бодит Цагийн Хямдрал', desc: 'Costco.co.kr дэлгүүрийн хямдрал шууд шинэчлэгдэнэ' },
                { heading: 'Kirkland Signature', desc: 'Дэлхийд алдартай Kirkland брэндийн бүх бараа' },
                { heading: '100% Оригинал Баталгаа', desc: 'Сөүл дэх Костко салбараас шууд татан авна' },
            ],
        },
        {
            name: '2_pricing.png',
            title: 'Ил Тод Үнэ & Карго',
            subtitle: 'Воны Ханш Болон Тээврийн Зардал Автомат',
            header: 'Шуурхай Үнийн Тооцоолуур',
            features: [
                { heading: 'Автомат Воны Ханш', desc: 'Өдөр бүр шинэчлэгдэх бодит төгрөгийн үнэ' },
                { heading: 'Газар & Агаарын Карго', desc: 'Барааны жингээр тээврийн зардлыг шууд тооцно' },
                { heading: 'Баркод & Шошго Уншигч', desc: 'Камераараа уншуулаад төгрөгийн үнийг харна' },
            ],
        },
        {
            name: '3_tracking.png',
            title: '24/7 AI Туслах & Хяналт',
            subtitle: 'Захиалга Бүрээ Алхам Алхмаар Хянаарай',
            header: 'Ухаалаг Захиалгын Систем',
            features: [
                { heading: '24/7 AI Зөвлөх', desc: 'Барааны үнэ, мэдээллийг 3 секундэд хариулна' },
                { heading: 'Төлбөрийн Хялбар Шийдэл', desc: 'Дансны шилжүүлэг автоматаар баталгаажна' },
                { heading: 'Сөүл -> Улаанбаатар', desc: 'Ачаа хаана явааг апп дотроосоо шууд хянана' },
            ],
        },
        {
            name: '4_scanner.png',
            title: 'Камер & Баркод Уншигч',
            subtitle: 'Барааны Шошгыг Камераар Уншуулж Захиална',
            header: 'Ухаалаг AI Сканнер & Хайлт',
            features: [
                { heading: 'Үнийн Шошго Уншигч', desc: 'Костко шошгыг уншуулж төгрөгийн үнийг харна' },
                { heading: 'Зургаар Бараа Хайх', desc: 'Хүссэн барааныхаа зургийг оруулаад шууд олно' },
                { heading: 'GPS Хаяг Тогтоогч', desc: 'Хүргэлтийн хаягаа газрын зураг дээр сонгоно' },
            ],
        },
    ];

    for (const locale of ['mn-MN', 'en-US']) {
        const androidImagesDir = path.join(ROOT_DIR, 'fastlane', 'metadata', 'android', locale, 'images');
        const androidPhoneShotsDir = path.join(androidImagesDir, 'phoneScreenshots');
        ensureDir(androidPhoneShotsDir);

        await sharp(Buffer.from(buildMasterIconSvg(1024, false)))
            .resize(512, 512)
            .flatten({ background: '#005DA3' })
            .png()
            .toFile(path.join(androidImagesDir, 'icon.png'));

        await sharp(Buffer.from(buildFeatureGraphicSvg()))
            .flatten({ background: '#005DA3' })
            .png()
            .toFile(path.join(androidImagesDir, 'featureGraphic.png'));

        for (const slide of screenshotSlides) {
            await sharp(Buffer.from(buildStoreScreenshotSvg(1080, 1920, slide)))
                .flatten({ background: '#061A38' })
                .png()
                .toFile(path.join(androidPhoneShotsDir, slide.name));
        }
    }

    const iosShotsDir = path.join(ROOT_DIR, 'fastlane', 'metadata', 'ios', 'en-US', 'screenshots');
    ensureDir(iosShotsDir);
    for (const slide of screenshotSlides) {
        await sharp(Buffer.from(buildStoreScreenshotSvg(1080, 1920, slide)))
            .resize(1290, 2796, { fit: 'fill' })
            .flatten({ background: '#061A38' })
            .png()
            .toFile(path.join(iosShotsDir, `APP_IPHONE_67_${slide.name}`));
        await sharp(Buffer.from(buildStoreScreenshotSvg(1080, 1920, slide)))
            .resize(2048, 2732, { fit: 'fill' })
            .flatten({ background: '#061A38' })
            .png()
            .toFile(path.join(iosShotsDir, `APP_IPAD_PRO_3GEN_129_${slide.name}`));
    }

    console.log('🎉 [Mobile Assets] All Play Store & App Store icons, splash screens, and screenshots generated!');
}

main();
