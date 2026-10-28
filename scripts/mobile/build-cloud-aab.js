/**
 * Cloud Android App Bundle (.aab) & APK Builder with Full Permissions
 * (scripts/mobile/build-cloud-aab.js)
 *
 * Generates a production-signed Google Play `.aab` and `.apk` with:
 *  - GPS / Location Delegation (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`)
 *  - Push Notifications Delegation (`POST_NOTIFICATIONS`)
 *  - WebView fallback for Camera, Microphone, and File Uploads
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const GOOGLE_PLAY_DIR = path.join(ROOT_DIR, 'releases', 'google-play');

async function main() {
    const existingKsPath = path.join(GOOGLE_PLAY_DIR, 'signing.keystore');
    const ksBase64 = fs.existsSync(existingKsPath) ? fs.readFileSync(existingKsPath).toString('base64') : null;

    const payload = {
        packageId: 'mn.costco.app',
        name: 'Costco Mongolia',
        launcherName: 'Costco.mn',
        display: 'standalone',
        themeColor: '#005DA3',
        themeColorDark: '#005DA3',
        navigationColor: '#ffffff',
        navigationColorDark: '#0f172a',
        navigationDividerColor: '#e2e8f0',
        navigationDividerColorDark: '#1e293b',
        backgroundColor: '#ffffff',
        enableNotifications: true,
        enableSiteSettingsShortcut: true,
        features: {
            locationDelegation: {
                enabled: true,
            },
        },
        startUrl: '/',
        iconUrl: 'https://costco-fe034.web.app/pwa-512x512.png',
        maskableIconUrl: 'https://costco-fe034.web.app/pwa-512x512.png',
        appVersion: '1.0.5',
        appVersionCode: 107,
        signingMode: ksBase64 ? 'mine' : 'new',
        signing: ksBase64
            ? {
                  file: `data:application/octet-stream;base64,${ksBase64}`,
                  alias: 'costco-mn-release-key',
                  fullName: 'Costco Mongolia',
                  organization: 'Costco Mongolia LLC',
                  organizationalUnit: 'Mobile Engineering',
                  countryCode: 'MN',
                  keyPassword: 'Mvnx09McU7rf',
                  storePassword: 'Mvnx09McU7rf',
              }
            : {
                  file: null,
                  alias: 'costco-mn-release-key',
                  fullName: 'Costco Mongolia',
                  organization: 'Costco Mongolia LLC',
                  organizationalUnit: 'Mobile Engineering',
                  countryCode: 'MN',
              },
        splashScreenFadeOutDuration: 300,
        shortcuts: [],
        fallbackType: 'webview',
        isChromeOSOnly: false,
        isMetaQuest: false,
        minSdkVersion: 24,
        orientation: 'portrait',
        webManifestUrl: 'https://costco-fe034.web.app/manifest.json',
        host: 'https://costco.mn',
    };

    console.log('🔨 [Cloud AAB] Building signed .aab & .apk with GPS Location Delegation + Notifications + WebView...');
    const r = await fetch('https://pwabuilder-cloudapk.azurewebsites.net/generateAppPackage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!r.ok) {
        console.error('CloudAPK error:', r.status, await r.text());
        process.exit(1);
    }

    const buf = Buffer.from(await r.arrayBuffer());
    const zipPath = path.join(ROOT_DIR, 'releases', 'google-play-bundle.zip');
    fs.mkdirSync(GOOGLE_PLAY_DIR, { recursive: true });
    fs.writeFileSync(zipPath, buf);
    console.log(`📦 [Cloud AAB] Downloaded bundle zip (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);

    execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${GOOGLE_PLAY_DIR}' -Force"`,
        { stdio: 'inherit' }
    );

    // Sync keystore to android/app/costco-release.keystore
    const ksPath = path.join(GOOGLE_PLAY_DIR, 'signing.keystore');
    if (fs.existsSync(ksPath)) {
        fs.copyFileSync(ksPath, path.join(ROOT_DIR, 'android', 'app', 'costco-release.keystore'));
    }

    // Sync password to android/keystore.properties
    const keyInfoPath = path.join(GOOGLE_PLAY_DIR, 'signing-key-info.txt');
    if (fs.existsSync(keyInfoPath)) {
        const infoText = fs.readFileSync(keyInfoPath, 'utf8');
        const storePassMatch = infoText.match(/Key store password:\s*(\S+)/i);
        const keyPassMatch = infoText.match(/Key password:\s*(\S+)/i);
        if (storePassMatch && keyPassMatch) {
            fs.writeFileSync(
                path.join(ROOT_DIR, 'android', 'keystore.properties'),
                `storeFile=costco-release.keystore\nstorePassword=${storePassMatch[1]}\nkeyAlias=costco-mn-release-key\nkeyPassword=${keyPassMatch[1]}\n`,
                'utf8'
            );
        }
    }

    // Sync SHA-256 fingerprint to public/.well-known/assetlinks.json with GPS/Origin delegation
    const assetLinksPath = path.join(GOOGLE_PLAY_DIR, 'assetlinks.json');
    if (fs.existsSync(assetLinksPath)) {
        const generatedLinks = JSON.parse(fs.readFileSync(assetLinksPath, 'utf8'));
        const sha256List = generatedLinks?.[0]?.target?.sha256_cert_fingerprints || [];
        if (sha256List.length > 0) {
            const combined = [
                {
                    relation: [
                        'delegate_permission/common.handle_all_urls',
                        'delegate_permission/common.get_login_creds',
                        'delegate_permission/common.use_as_origin',
                    ],
                    target: {
                        namespace: 'android_app',
                        package_name: 'mn.costco.app',
                        sha256_cert_fingerprints: sha256List,
                    },
                },
                {
                    relation: [
                        'delegate_permission/common.handle_all_urls',
                        'delegate_permission/common.get_login_creds',
                        'delegate_permission/common.use_as_origin',
                    ],
                    target: {
                        namespace: 'android_app',
                        package_name: 'com.aaacostco.app',
                        sha256_cert_fingerprints: sha256List,
                    },
                },
            ];
            fs.writeFileSync(
                path.join(ROOT_DIR, 'public', '.well-known', 'assetlinks.json'),
                JSON.stringify(combined, null, 2) + '\n',
                'utf8'
            );
        }
    }

    console.log('✅ [Cloud AAB] Updated `releases/google-play/Costco Mongolia.aab` and `Costco Mongolia.apk` with GPS + Notifications + WebView!');
}

main();
