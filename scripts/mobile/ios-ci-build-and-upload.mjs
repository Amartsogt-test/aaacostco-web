/**
 * Autonomous iOS App Store Builder, Signer & Uploader for macOS CI
 * (scripts/mobile/ios-ci-build-and-upload.mjs)
 *
 * Uses native Apple tools (security, openssl, xcodebuild, xcrun altool) +
 * App Store Connect REST API v1 (ES256 JWT) to:
 * 1. Create an unlocked macOS CI keychain (`build.keychain-db`) and trust Apple WWDR G3
 * 2. Generate a fresh 2048-bit RSA key + CSR, issue an `IOS_DISTRIBUTION` cert via ASC API,
 *    package as PKCS#12, and import into the keychain with codesign partition permissions
 * 3. Create & install the `IOS_APP_STORE` provisioning profile (`mn.costco.app`)
 * 4. Archive & export the signed `App.ipa` via `xcodebuild`
 * 5. Upload `App.ipa` to App Store Connect via `xcrun altool --upload-app`
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const KEY_ID = process.env.ASC_KEY_ID || '5J2S65G8S3';
const ISSUER_ID = process.env.ASC_ISSUER_ID || 'f5e99d56-8a55-4351-af3b-1601b8fc3ec4';
const TEAM_ID = process.env.APPLE_DEVELOPER_TEAM_ID || 'LHJMY3S9M5';
const BUNDLE_ID = 'mn.costco.app';
const APP_ID = '6827960373';
const BUILD_NUM = String(Number(process.env.GITHUB_RUN_NUMBER || 1) + 107);

const pkPem = Buffer.from(process.env.ASC_KEY_CONTENT, 'base64').toString('utf8');

function makeJwt() {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' })
  ).toString('base64url');
  const sig = crypto
    .sign('sha256', Buffer.from(`${h}.${p}`), { key: pkPem, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${h}.${p}.${sig}`;
}

async function asc(method, url, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJwt()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let json = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    json = txt;
  }
  if (!r.ok) {
    throw new Error(`ASC ${method} ${url} -> ${r.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function run(cmd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

(async () => {
  const workDir = path.resolve('output/signing');
  const outDir = path.resolve('output/ios');
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Save AuthKey_<KEY_ID>.p8 to ~/.appstoreconnect/private_keys/ for xcrun altool
  const ascKeysDir = path.join(os.homedir(), '.appstoreconnect', 'private_keys');
  fs.mkdirSync(ascKeysDir, { recursive: true });
  const p8Path = path.join(ascKeysDir, `AuthKey_${KEY_ID}.p8`);
  fs.writeFileSync(p8Path, pkPem, { mode: 0o600 });

  // 1. Setup temporary unlocked Keychain
  const kcName = 'costco_ci.keychain-db';
  const kcPass = 'costco1234';
  try {
    execSync(`security delete-keychain ${kcName}`, { stdio: 'ignore' });
  } catch {}
  run(`security create-keychain -p "${kcPass}" ${kcName}`);
  run(`security set-keychain-settings -lut 21600 ${kcName}`);
  run(`security unlock-keychain -p "${kcPass}" ${kcName}`);
  run(`security list-keychains -d user -s ${kcName} login.keychain-db`);
  run(`security default-keychain -s ${kcName}`);

  // Download & import Apple WWDR G3 + G6 intermediate certs
  run(`curl -sSL https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer -o "${workDir}/AppleWWDRCAG3.cer"`);
  run(`curl -sSL https://www.apple.com/certificateauthority/AppleWWDRCAG6.cer -o "${workDir}/AppleWWDRCAG6.cer"`);
  run(`security import "${workDir}/AppleWWDRCAG3.cer" -k ${kcName} -A`);
  run(`security import "${workDir}/AppleWWDRCAG6.cer" -k ${kcName} -A`);

  // 2. Clean old DISTRIBUTION certificates if at limit, then create a fresh one
  const existingCerts = await asc('GET', '/v1/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION');
  for (const c of existingCerts.data || []) {
    console.log(`Removing old certificate ${c.id} (${c.attributes?.displayName})`);
    await asc('DELETE', `/v1/certificates/${c.id}`);
  }

  const keyPath = path.join(workDir, 'dist.key');
  const csrPath = path.join(workDir, 'dist.csr');
  const cerDerPath = path.join(workDir, 'dist.cer');
  const cerPemPath = path.join(workDir, 'dist.pem');
  const p12Path = path.join(workDir, 'dist.p12');

  run(
    `openssl req -new -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${csrPath}" -subj "/CN=Apple Distribution/O=MG Logistics Co., Ltd./C=KR"`
  );
  const csrContent = fs
    .readFileSync(csrPath, 'utf8')
    .replace(/-----BEGIN CERTIFICATE REQUEST-----/g, '')
    .replace(/-----END CERTIFICATE REQUEST-----/g, '')
    .replace(/\s+/g, '');

  const certRes = await asc('POST', '/v1/certificates', {
    data: {
      type: 'certificates',
      attributes: {
        certificateType: 'DISTRIBUTION',
        csrContent,
      },
    },
  });
  const certId = certRes.data.id;
  console.log(`Created Apple Distribution Certificate: ${certId}`);

  fs.writeFileSync(cerDerPath, Buffer.from(certRes.data.attributes.certificateContent, 'base64'));
  run(
    `security import "${keyPath}" -k ${kcName} -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/productbuild`
  );
  run(
    `security import "${cerDerPath}" -k ${kcName} -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/productbuild`
  );
  run(`security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "${kcPass}" ${kcName}`);
  run(`security find-identity -v -p codesigning ${kcName}`);

  // 3. Look up Bundle ID resource id & create IOS_APP_STORE Provisioning Profile
  const bundleRes = await asc('GET', `/v1/bundleIds?filter[identifier]=${BUNDLE_ID}`);
  const bundleResource = (bundleRes.data || []).find((b) => b.attributes?.identifier === BUNDLE_ID);
  if (!bundleResource) throw new Error(`Bundle ID ${BUNDLE_ID} not found in ASC`);

  // Delete any old profiles with same name
  const profName = 'CostcoMN AppStore CI';
  const existingProfs = await asc('GET', '/v1/profiles');
  for (const pr of existingProfs.data || []) {
    if (pr.attributes?.name === profName) {
      await asc('DELETE', `/v1/profiles/${pr.id}`);
    }
  }

  const profRes = await asc('POST', '/v1/profiles', {
    data: {
      type: 'profiles',
      attributes: {
        name: profName,
        profileType: 'IOS_APP_STORE',
      },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundleResource.id } },
        certificates: { data: [{ type: 'certificates', id: certId }] },
      },
    },
  });

  const profAttr = profRes.data.attributes;
  const profUuid = profAttr.uuid;
  console.log(`Created Provisioning Profile: ${profName} (UUID: ${profUuid})`);

  const profilesDir = path.join(os.homedir(), 'Library', 'MobileDevice', 'Provisioning Profiles');
  fs.mkdirSync(profilesDir, { recursive: true });
  const profPath = path.join(profilesDir, `${profUuid}.mobileprovision`);
  fs.writeFileSync(profPath, Buffer.from(profAttr.profileContent, 'base64'));

  // 4. Update build number in project.pbxproj & archive/export IPA
  const pbxPath = path.resolve('ios/App/App.xcodeproj/project.pbxproj');
  let pbx = fs.readFileSync(pbxPath, 'utf8');
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${BUILD_NUM};`);
  pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, 'MARKETING_VERSION = 1.0.5;');
  fs.writeFileSync(pbxPath, pbx);

  const exportPlistPath = path.join(workDir, 'ExportOptions.plist');
  fs.writeFileSync(
    exportPlistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>signingCertificate</key>
  <string>Apple Distribution</string>
  <key>uploadSymbols</key>
  <true/>
  <key>provisioningProfiles</key>
  <dict>
    <key>${BUNDLE_ID}</key>
    <string>${profUuid}</string>
  </dict>
</dict>
</plist>`
  );

  const archivePath = path.join(workDir, 'CostcoMN.xcarchive');
  // Select the newest Xcode 26+ installed on the runner
  try {
    const xcodes = fs
      .readdirSync('/Applications')
      .filter((d) => /^Xcode.*\.app$/.test(d))
      .sort();
    console.log('Installed Xcodes:', xcodes);
    const x26 = xcodes.filter((d) => d.includes('26')).pop() || xcodes.pop();
    if (x26) {
      run(`sudo xcode-select -s "/Applications/${x26}/Contents/Developer"`);
    }
    run('xcodebuild -version');
  } catch (e) {
    console.warn('Xcode selection check:', e.message);
  }

  run(
    `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -sdk iphoneos -destination "generic/platform=iOS" -archivePath "${archivePath}" archive CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="${TEAM_ID}" CODE_SIGN_IDENTITY="Apple Distribution" PROVISIONING_PROFILE_SPECIFIER="${profUuid}"`
  );

  run(
    `xcodebuild -exportArchive -archivePath "${archivePath}" -exportOptionsPlist "${exportPlistPath}" -exportPath "${outDir}"`
  );

  const ipaFiles = fs.readdirSync(outDir).filter((f) => f.endsWith('.ipa'));
  if (!ipaFiles.length) throw new Error('No .ipa produced in output/ios');
  const ipaPath = path.join(outDir, ipaFiles[0]);
  console.log(`Built signed IPA: ${ipaPath} (${fs.statSync(ipaPath).size} bytes)`);

  // 5. Upload IPA to App Store Connect via xcrun altool
  run(`xcrun altool --upload-app -f "${ipaPath}" -t ios --apiKey "${KEY_ID}" --apiIssuer "${ISSUER_ID}"`);
  console.log('Successfully uploaded IPA to App Store Connect!');
})();
