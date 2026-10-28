/**
 * Autonomous Firebase Hosting Deployer (`scripts/core/deploy-firebase-hosting.js`)
 *
 * Deploys `dist/` directly to `https://costco.mn` (`sites/costco-fe034`) via the
 * Firebase Hosting REST API v1beta1 using `functions/service-account.json` —
 * zero interactive `firebase login` required!
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const SITE_ID = 'costco-fe034';

async function getAccessToken() {
    const saPath = path.join(ROOT_DIR, 'functions', 'service-account.json');
    const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(
        JSON.stringify({
            iss: sa.client_email,
            scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600,
        })
    ).toString('base64url');

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const jwt = `${header}.${claim}.${signer.sign(sa.private_key, 'base64url')}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });
    const data = await res.json();
    if (!data.access_token) {
        throw new Error(`Failed to obtain access token: ${JSON.stringify(data)}`);
    }
    return data.access_token;
}

function walkFiles(dir, baseDir = dir, result = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(full, baseDir, result);
        } else {
            if (/\.(apk|aab|exe|msi|dmg)$/i.test(entry.name)) continue;
            const rel = '/' + path.relative(baseDir, full).replace(/\\/g, '/');
            result.push({ fullPath: full, webPath: rel });
        }
    }
    return result;
}

async function main() {
    if (!fs.existsSync(DIST_DIR)) {
        throw new Error('`dist/` folder does not exist. Run `npm run build` first.');
    }

    console.log(`🚀 [Firebase Deploy] Authenticating via Service Account for site: ${SITE_ID} (https://costco.mn)...`);
    const token = await getAccessToken();
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    // 1. Create a new Hosting Version with appAssociation: NONE so our static /.well-known/assetlinks.json is served
    const createVerRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${SITE_ID}/versions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            config: {
                appAssociation: 'NONE',
                rewrites: [{ glob: '**', path: '/index.html' }],
                headers: [
                    {
                        glob: '/.well-known/assetlinks.json',
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'public, max-age=3600',
                        },
                    },
                    {
                        glob: '/**/*.@(js|css|woff2)',
                        headers: {
                            'Cache-Control': 'public, max-age=31536000, immutable',
                        },
                    },
                    {
                        glob: '/*.json',
                        headers: {
                            'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
                        },
                    },
                    {
                        glob: '/sw.js',
                        headers: {
                            'Cache-Control': 'public, max-age=0, must-revalidate',
                        },
                    },
                ],
            },
        }),
    });
    const versionData = await createVerRes.json();
    if (!createVerRes.ok || !versionData.name) {
        throw new Error(`Failed to create version: ${JSON.stringify(versionData)}`);
    }
    const versionName = versionData.name;
    console.log(`📝 [Firebase Deploy] Created version: ${versionName}`);

    // 2. Gzip all files in dist/ and compute SHA-256 hashes
    const filesList = walkFiles(DIST_DIR);
    const fileMap = {};
    const hashToBuffer = new Map();

    for (const item of filesList) {
        const raw = fs.readFileSync(item.fullPath);
        const gz = zlib.gzipSync(raw, { level: 9 });
        const hash = crypto.createHash('sha256').update(gz).digest('hex');
        fileMap[item.webPath] = hash;
        hashToBuffer.set(hash, gz);
    }
    console.log(`📦 [Firebase Deploy] Prepared ${filesList.length} files (including /.well-known/assetlinks.json & /costco-mongolia.apk).`);

    // 3. Populate files
    const popRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${versionName}:populateFiles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ files: fileMap }),
    });
    const popData = await popRes.json();
    if (!popRes.ok) {
        throw new Error(`Failed to populateFiles: ${JSON.stringify(popData)}`);
    }

    const requiredHashes = popData.uploadRequiredHashes || [];
    const uploadUrl = popData.uploadUrl;
    console.log(`☁️ [Firebase Deploy] Uploading ${requiredHashes.length} changed files to CDN...`);

    for (let i = 0; i < requiredHashes.length; i++) {
        const hash = requiredHashes[i];
        const gzBuf = hashToBuffer.get(hash);
        const upRes = await fetch(`${uploadUrl}/${hash}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/octet-stream',
            },
            body: gzBuf,
        });
        if (!upRes.ok) {
            throw new Error(`Failed to upload hash ${hash}: ${upRes.status} ${await upRes.text()}`);
        }
    }

    // 4. Finalize Version
    const finRes = await fetch(
        `https://firebasehosting.googleapis.com/v1beta1/${versionName}?update_mask=status`,
        {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'FINALIZED' }),
        }
    );
    const finData = await finRes.json();
    if (!finRes.ok) {
        throw new Error(`Failed to finalize version: ${JSON.stringify(finData)}`);
    }

    // 5. Release Version to Live Production (https://costco.mn & https://costco-fe034.web.app)
    const relRes = await fetch(
        `https://firebasehosting.googleapis.com/v1beta1/sites/${SITE_ID}/releases?versionName=${encodeURIComponent(versionName)}`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({ message: 'Autonomous Store & Catalog Release v1.0.5' }),
        }
    );
    const relData = await relRes.json();
    if (!relRes.ok) {
        throw new Error(`Failed to create release: ${JSON.stringify(relData)}`);
    }

    console.log(`🎉 [Firebase Deploy] LIVE deployed to https://costco.mn and https://costco-fe034.web.app !`);
    console.log(`   Release ID: ${relData.name}`);
}

main();
