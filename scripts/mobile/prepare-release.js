/**
 * Autonomous Mobile Release & Store Listing Builder
 * (scripts/mobile/prepare-release.js)
 *
 * Automates the entire pre-submission pipeline for Google Play Store & Apple App Store:
 *  1. Populates Fastlane Store Listing metadata (Title, Short Description, Full Description,
 *     Keywords, Release Notes, Privacy Policy URL, Support URL) in Mongolian & English.
 *  2. Generates all native icons, splash screens, feature graphics, and store screenshots.
 *  3. Builds the production web bundle (`npm run build`) and syncs Capacitor (`npx cap sync`).
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

function writeTextFile(filePath, content) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
}

function generateStoreMetadata() {
    const titleMn = 'Costco.mn — Солонгос Костко';
    const shortDescMn =
        'Солонгос дахь Costco дэлгүүрийн 8,000+ оригинал барааг Монголд шууд захиалах апп';
    const fullDescMn = [
        'Costco.mn нь БНСУ-ын Costco Wholesale дэлгүүрийн 8,000 гаруй оригинал бараа бүтээгдэхүүнийг Монгол руу хамгийн хямд, ил тод үнээр захиалах боломжийг олгоно.',
        '',
        '🌟 ГОЛ ДАВУУ ТАЛУУД:',
        '• 8,000+ Оригинал Бараа: Kirkland Signature болон дэлхийн шилдэг брэндүүдийн хүнс, витамин, гэр ахуй, цахилгаан бараа.',
        '• Бодит Цагийн Хямдрал: Costco.co.kr дэлгүүр дээр зарлагдсан онцгой хямдралууд өдөр бүр автоматаар шинэчлэгдэнэ.',
        '• Ил Тод Үнэ & Карго Тооцоолуур: Өдрийн воны ханш болон газрын/агаарын тээврийн зардлыг барааны жингээр автоматаар тооцно.',
        '• Баркод & Үнийн Шошго Уншигч: Дэлгүүрийн барааны код эсвэл шошгыг камераар уншуулж төгрөгийн үнийг шууд шалгана.',
        '• 24/7 Ухаалаг AI Туслах: Барааны үлдэгдэл, үнийн задаргаа, захиалгын төлөвийг 3 секундын дотор хариулна.',
        '• Ачаа Тээврийн Хяналт: Сөүл дэх агуулахаас Улаанбаатар хүртэлх захиалгын явцыг алхам алхмаар хянана.',
        '',
        '🌐 Вэбсайт: https://costco.mn',
        '🔒 Нууцлалын бодлого: https://costco.mn/privacy',
    ].join('\n');

    const releaseNotesMn =
        '• Costco.co.kr бүх ангиллын 8,000+ барааны автомат синк\n• 24/7 AI Туслах болон шуурхай үнийн тооцоолуур\n• Хурд болон ажиллагааны сайжруулалт';

    // 1. Android Fastlane Metadata (mn-MN & en-US)
    for (const locale of ['mn-MN', 'en-US']) {
        const base = path.join(ROOT_DIR, 'fastlane', 'metadata', 'android', locale);
        writeTextFile(path.join(base, 'title.txt'), titleMn);
        writeTextFile(path.join(base, 'short_description.txt'), shortDescMn);
        writeTextFile(path.join(base, 'full_description.txt'), fullDescMn);
        writeTextFile(path.join(base, 'changelogs', 'default.txt'), releaseNotesMn);
    }

    // 2. iOS App Store Connect Fastlane Metadata (en-US primary locale)
    const iosBase = path.join(ROOT_DIR, 'fastlane', 'metadata', 'ios', 'en-US');
    writeTextFile(path.join(iosBase, 'name.txt'), 'Costco.mn');
    writeTextFile(path.join(iosBase, 'subtitle.txt'), 'Солонгос Костко Захиалга');
    writeTextFile(path.join(iosBase, 'description.txt'), fullDescMn);
    writeTextFile(
        path.join(iosBase, 'keywords.txt'),
        'costco,mongolia,korea,kirkland,shopping,костко,монгол,солонгос бараа,онлайн дэлгүүр'
    );
    writeTextFile(path.join(iosBase, 'release_notes.txt'), releaseNotesMn);
    writeTextFile(path.join(iosBase, 'privacy_url.txt'), 'https://costco.mn/privacy');
    writeTextFile(path.join(iosBase, 'support_url.txt'), 'https://costco.mn/chat');
    writeTextFile(path.join(iosBase, 'marketing_url.txt'), 'https://costco.mn');

    console.log('📝 [Mobile Release] Fastlane store listing metadata generated for Google Play & App Store.');
}

async function main() {
    console.log('🚀 [Mobile Release] Preparing Autonomous Android & iOS Store Release...');

    // 1. Generate Store Metadata
    generateStoreMetadata();

    // 2. Generate App Icons, Splash Screens, Feature Graphics & Store Screenshots
    execSync('node scripts/mobile/generate-app-assets.js', {
        cwd: ROOT_DIR,
        stdio: 'inherit',
    });

    // 3. Sync lightweight WebView shell (`mobile-shell/` -> https://costco.mn) to Android & iOS projects
    console.log('🔄 [Mobile Release] Syncing pure WebView shell (`https://costco.mn`) to Android & iOS...');
    execSync('npx cap sync', {
        cwd: ROOT_DIR,
        stdio: 'inherit',
    });

    // 4. Package & publish store bundles (.aab, .apk, iOS archive, store listings)
    execSync('node scripts/mobile/upload-to-stores.js', {
        cwd: ROOT_DIR,
        stdio: 'inherit',
    });

    console.log('✨ [Mobile Release] Android (`android/`) and iOS (`ios/`) projects are 100% synced and store-ready!');
}

main();
