/**
 * Autonomous Meta (Facebook Page & Instagram) Publisher (scripts/marketing/meta-publisher.js)
 *
 * Publishes generated promotional posters and Reels via Meta Graph API v21.0,
 * automatically posts the direct Costco.mn product checkout URL in the first comment,
 * and records the campaign in `logs/marketing-history.json`.
 */

import fs from 'fs';
import axios from 'axios';
import { saveMarketingHistory } from './product-selector.js';

export async function publishToFacebookPage({
    product,
    campaignType,
    caption,
    firstComment,
    posterPath,
    dryRun = false,
}) {
    const pageId = process.env.FB_PAGE_ID || process.env.META_PAGE_ID;
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;

    if (dryRun || !pageId || !accessToken) {
        const entry = {
            productCode: product.code,
            titleMn: product.titleMn,
            campaignType,
            status: dryRun ? 'dry_run_ready' : 'queued_pending_meta_token',
            posterPath,
            productUrl: product.productUrl,
            publishedAt: new Date().toISOString(),
        };
        saveMarketingHistory(entry);
        return entry;
    }

    try {
        let postData;
        if (posterPath && fs.existsSync(posterPath)) {
            const form = new FormData();
            form.append('message', caption);
            form.append('access_token', accessToken);
            const fileBuffer = fs.readFileSync(posterPath);
            form.append('source', new Blob([fileBuffer], { type: 'image/png' }), 'poster.png');

            const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
                method: 'POST',
                body: form,
            });
            postData = await uploadRes.json();
            if (!uploadRes.ok) {
                throw new Error(postData?.error?.message || `HTTP ${uploadRes.status}`);
            }
        } else {
            const postRes = await axios.post(
                `https://graph.facebook.com/v21.0/${pageId}/photos`,
                {
                    url: product.image,
                    message: caption,
                    access_token: accessToken,
                },
                { timeout: 25000 }
            );
            postData = postRes.data;
        }

        const postId = postData?.post_id || postData?.id;

        // Post direct checkout link in first comment for better organic reach
        if (postId && firstComment) {
            try {
                await axios.post(
                    `https://graph.facebook.com/v21.0/${postId}/comments`,
                    {
                        message: firstComment,
                        access_token: accessToken,
                    },
                    { timeout: 15000 }
                );
            } catch {
                /* ignore comment error if post succeeded */
            }
        }

        const entry = {
            productCode: product.code,
            titleMn: product.titleMn,
            campaignType,
            status: 'published',
            fbPostId: postId,
            posterPath,
            productUrl: product.productUrl,
            publishedAt: new Date().toISOString(),
        };
        saveMarketingHistory(entry);
        return entry;
    } catch (err) {
        const entry = {
            productCode: product.code,
            titleMn: product.titleMn,
            campaignType,
            status: 'error',
            error: err.response?.data?.error?.message || err.message,
            posterPath,
            publishedAt: new Date().toISOString(),
        };
        saveMarketingHistory(entry);
        return entry;
    }
}
