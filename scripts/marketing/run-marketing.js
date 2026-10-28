/**
 * Autonomous AI Marketing & Video Studio Orchestrator (scripts/marketing/run-marketing.js)
 *
 * Usage:
 *   node scripts/marketing/run-marketing.js --type=flash_sale
 *   node scripts/marketing/run-marketing.js --type=spotlight_reel
 *   node scripts/marketing/run-marketing.js --type=daily
 *   node scripts/marketing/run-marketing.js --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { selectProductsForCampaign } from './product-selector.js';
import { generateMarketingCopy } from './copywriter.js';
import { generatePromotionalPoster } from './poster-generator.js';
import { generateMarketingReel } from './video-generator.js';
import { publishToFacebookPage } from './meta-publisher.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output', 'marketing');

function parseArg(flag, defaultValue) {
    const found = process.argv.find((a) => a.startsWith(`--${flag}=`));
    if (found) return found.split('=')[1];
    return defaultValue;
}

async function runSingleCampaign(campaignType, count, dryRun) {
    console.log(`\n🚀 [Marketing Studio] Starting '${campaignType}' campaign (count=${count}, dryRun=${dryRun})...`);
    const { selected, wonRate, source } = await selectProductsForCampaign({
        type: campaignType,
        count,
    });

    if (selected.length === 0) {
        console.warn('⚠️ [Marketing Studio] No eligible products found in catalog.');
        return [];
    }

    console.log(`📦 [Marketing Studio] Selected ${selected.length} product(s) from ${source} (wonRate=${wonRate})`);
    const results = [];

    for (const product of selected) {
        console.log(`🎨 [Marketing Studio] Processing #${product.code}: ${product.titleMn} (${product.priceMNT.toLocaleString()}₮)`);

        // 1. Generate Mongolian Ad Copy + Reels Script
        const copyData = await generateMarketingCopy(product, campaignType);

        // 2. Render 1080x1080 Branded Promotional Poster
        const posterPath = await generatePromotionalPoster(product, campaignType);
        console.log(`🖼️  [Marketing Studio] Generated 1080x1080 Poster: ${posterPath}`);

        // 3. Render 1080x1920 Vertical Reels Storyboard + MP4 Video (for spotlight_reel or daily)
        let reelData = null;
        if (campaignType === 'spotlight_reel' || process.argv.includes('--with-video')) {
            reelData = await generateMarketingReel(product, copyData);
            console.log(
                `🎬 [Marketing Studio] Generated 9:16 Reels package (${reelData.slideFiles.length} slides${
                    reelData.mp4Generated ? `, MP4: ${reelData.mp4Path}` : ''
                })`
            );
        }

        // 4. Publish or Queue
        const publishResult = await publishToFacebookPage({
            product,
            campaignType,
            caption: copyData.caption,
            firstComment: copyData.firstComment,
            posterPath,
            dryRun,
        });

        results.push({
            productCode: product.code,
            titleMn: product.titleMn,
            priceMNT: product.priceMNT,
            discountPercent: product.discountPercent,
            campaignType,
            copyGeneratedBy: copyData.generatedBy,
            posterPath,
            reelData,
            publishStatus: publishResult.status,
            captionPreview: copyData.caption.slice(0, 240) + '...',
        });
    }

    return results;
}

async function main() {
    const typeArg = parseArg('type', 'flash_sale');
    const countArg = Math.max(1, Number(parseArg('count', '1')) || 1);
    const dryRun = process.argv.includes('--dry-run');

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const allResults = [];
    if (typeArg === 'daily') {
        const morning = await runSingleCampaign('flash_sale', 1, dryRun);
        const afternoon = await runSingleCampaign('spotlight_reel', 1, dryRun);
        allResults.push(...morning, ...afternoon);
    } else {
        const res = await runSingleCampaign(typeArg, countArg, dryRun);
        allResults.push(...res);
    }

    const summaryPath = path.join(OUTPUT_DIR, 'latest-campaign-run.json');
    fs.writeFileSync(
        summaryPath,
        JSON.stringify(
            {
                executedAt: new Date().toISOString(),
                dryRun,
                campaigns: allResults,
            },
            null,
            2
        ),
        'utf8'
    );

    console.log(`\n✨ [Marketing Studio] Completed ${allResults.length} campaign item(s). Summary: ${summaryPath}`);
}

main();
