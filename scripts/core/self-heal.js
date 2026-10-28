/**
 * Autonomous Self-Healing Doctor (scripts/core/self-heal.js)
 *
 * Performs automated diagnostics and self-repair across the Costco.mn repository:
 *  1. Runs ESLint auto-fix (`npx eslint . --fix`) to repair syntax/style issues.
 *  2. Runs unit tests (`npm test`) to verify business logic integrity.
 *  3. Validates and auto-repairs `public/home-snapshot.json` (corrupt prices, missing fields, broken exchange rates).
 *  4. Queries Cloudflare Worker Edge self-heal endpoint (`/api/admin/self-heal`) if configured.
 *  5. If lint or tests fail and GEMINI_API_KEY is available, generates an AI root-cause diagnosis & patch plan.
 *  6. Writes a structured report to `logs/self-heal-report.json`.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const SNAPSHOT_PATH = path.join(ROOT_DIR, 'public', 'home-snapshot.json');

function ensureLogsDir() {
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
}

function runStep(name, command) {
    const startedAt = Date.now();
    try {
        const output = execSync(command, {
            cwd: ROOT_DIR,
            stdio: 'pipe',
            encoding: 'utf8',
            timeout: 180000,
        });
        return {
            name,
            command,
            ok: true,
            durationMs: Date.now() - startedAt,
            output: (output || '').trim().slice(-2000),
        };
    } catch (err) {
        const stdout = err.stdout ? String(err.stdout) : '';
        const stderr = err.stderr ? String(err.stderr) : '';
        return {
            name,
            command,
            ok: false,
            durationMs: Date.now() - startedAt,
            error: (stderr || stdout || err.message || 'Unknown error').trim().slice(-3000),
        };
    }
}

function healHomeSnapshot() {
    const result = {
        checked: false,
        repairedCount: 0,
        removedCorruptCount: 0,
        wonRateFixed: false,
        totalProducts: 0,
    };

    if (!fs.existsSync(SNAPSHOT_PATH)) {
        return result;
    }

    try {
        const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
        const data = JSON.parse(raw);
        result.checked = true;
        let mutated = false;

        // 1. Validate wonRate
        const wonRate = Number(data.wonRate);
        if (!Number.isFinite(wonRate) || wonRate < 1.5 || wonRate > 5.0) {
            data.wonRate = 2.5;
            result.wonRateFixed = true;
            mutated = true;
        }

        // 2. Validate products array
        if (Array.isArray(data.products)) {
            const validProducts = [];
            for (const prod of data.products) {
                if (!prod || (!prod.id && !prod.code)) {
                    result.removedCorruptCount += 1;
                    mutated = true;
                    continue;
                }

                // Auto-fill missing id/code
                if (!prod.id && prod.code) {
                    prod.id = String(prod.code);
                    result.repairedCount += 1;
                    mutated = true;
                }

                // Auto-repair price if price is missing or <= 0 but priceKRW or originalPrice exists
                const price = Number(prod.price || prod.priceKRW || 0);
                const orig = Number(prod.originalPrice || prod.originalPriceKRW || 0);
                if (price <= 0 && orig > 0) {
                    prod.price = orig;
                    prod.priceKRW = orig;
                    result.repairedCount += 1;
                    mutated = true;
                } else if (price <= 0 && orig <= 0) {
                    result.removedCorruptCount += 1;
                    mutated = true;
                    continue;
                }

                // Auto-repair negative or impossible weight
                const w = Number(prod.weight);
                if (!Number.isFinite(w) || w <= 0 || w > 250) {
                    prod.weight = 1.0;
                    result.repairedCount += 1;
                    mutated = true;
                }

                validProducts.push(prod);
            }

            if (mutated) {
                data.products = validProducts;
                data.productCount = validProducts.length;
                fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(data), 'utf8');
            }
            result.totalProducts = validProducts.length;
        }
    } catch (err) {
        result.error = err.message;
    }

    return result;
}

async function generateAiDiagnosis(failedSteps) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey || failedSteps.length === 0) return null;

    const prompt = [
        'Та Costco.mn цахим худалдааны системийн Autonomous Self-Healing AI инженер байна.',
        'Дараах автомат шалгалтууд дээр алдаа илэрлээ. Алдааны шалтгаан болон засах тодорхой командыг монгол хэлээр товч гаргана уу:',
        JSON.stringify(failedSteps, null, 2),
    ].join('\n\n');

    try {
        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
            },
            { timeout: 15000 }
        );
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch {
        return null;
    }
}

async function triggerEdgeSelfHeal() {
    const workerUrl = process.env.VITE_WORKER_URL || process.env.WORKER_URL;
    const syncSecret = process.env.INTERNAL_SYNC_SECRET;
    if (!workerUrl || !syncSecret) {
        return { skipped: true, reason: 'WORKER_URL or INTERNAL_SYNC_SECRET not configured locally' };
    }

    try {
        const res = await axios.post(
            `${workerUrl.replace(/\/$/, '')}/api/admin/self-heal`,
            {},
            {
                headers: { Authorization: `Bearer ${syncSecret}` },
                timeout: 15000,
            }
        );
        return res.data;
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

async function sendTelegramAlert(report) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return false;

    const statusEmoji = report.healthy ? '✅' : '🚨';
    const text = [
        `${statusEmoji} *Costco.mn Autonomous Self-Heal Report*`,
        `Статус: *${report.healthy ? 'ХЭВИЙН (Бүх шалгалт амжилттай)' : 'АНХААРУУЛГА (Алдаа илэрсэн)'}*`,
        `Каталог: ${report.snapshotHeal.totalProducts} бараа (Зассан: ${report.snapshotHeal.repairedCount})`,
        ...report.steps.map((s) => `- ${s.ok ? '✅' : '❌'} ${s.name} (${s.durationMs}ms)`),
        report.aiDiagnosis ? `\n🤖 *AI Оношилгоо:*\n${report.aiDiagnosis}` : '',
    ].filter(Boolean).join('\n');

    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
        });
        return true;
    } catch {
        return false;
    }
}

async function main() {
    console.log('🛠️  [Self-Heal] Starting Autonomous System Health & Repair Check...');
    ensureLogsDir();

    // 1. Heal local snapshot catalog
    const snapshotHeal = healHomeSnapshot();
    console.log(
        `📦 [Self-Heal] Snapshot catalog verified: ${snapshotHeal.totalProducts} products (repaired: ${snapshotHeal.repairedCount}, removed corrupt: ${snapshotHeal.removedCorruptCount})`
    );

    // 2. Run ESLint with --fix first, then check
    const steps = [];
    const lintStep = runStep('ESLint Auto-Fix & Check', 'npx eslint . --fix');
    steps.push(lintStep);
    console.log(`${lintStep.ok ? '✅' : '❌'} [Self-Heal] ${lintStep.name} (${lintStep.durationMs}ms)`);

    // 3. Run unit test suite
    const testStep = runStep('Unit Test Suite', 'npm test');
    steps.push(testStep);
    console.log(`${testStep.ok ? '✅' : '❌'} [Self-Heal] ${testStep.name} (${testStep.durationMs}ms)`);

    // 4. Trigger Cloudflare Edge D1 Self-Heal if credentials present
    const edgeHeal = await triggerEdgeSelfHeal();

    // 5. Generate AI diagnosis if any step failed
    const failedSteps = steps.filter((s) => !s.ok);
    const aiDiagnosis = await generateAiDiagnosis(failedSteps);

    const report = {
        timestamp: new Date().toISOString(),
        healthy: failedSteps.length === 0,
        snapshotHeal,
        edgeHeal,
        steps,
        aiDiagnosis,
    };

    const reportPath = path.join(LOGS_DIR, 'self-heal-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`📄 [Self-Heal] Report saved to ${reportPath}`);

    // 6. Export consolidated public/autonomous-status.json for the Admin Autopilot UI
    const readJsonSafe = (p) => {
        try {
            return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
        } catch {
            return null;
        }
    };
    const statusSnapshot = {
        updatedAt: new Date().toISOString(),
        selfHeal: report,
        catalogSync: readJsonSafe(path.join(LOGS_DIR, 'costco-kr-sync-report.json')),
        bankRates: readJsonSafe(path.join(LOGS_DIR, 'bank-rates.json')),
        purchasePlan: readJsonSafe(path.join(LOGS_DIR, 'costco-purchase-plan.json')),
        marketing: readJsonSafe(path.join(ROOT_DIR, 'output', 'marketing', 'latest-campaign-run.json')),
        mobileApps: {
            androidReady: fs.existsSync(path.join(ROOT_DIR, 'android', 'app', 'build.gradle')),
            iosReady: fs.existsSync(path.join(ROOT_DIR, 'ios', 'App', 'App.xcodeproj')),
            fastlaneReady: fs.existsSync(path.join(ROOT_DIR, 'fastlane', 'Fastfile')),
            ciWorkflowReady: fs.existsSync(path.join(ROOT_DIR, '.github', 'workflows', 'mobile-release.yml')),
        },
    };
    fs.writeFileSync(
        path.join(ROOT_DIR, 'public', 'autonomous-status.json'),
        JSON.stringify(statusSnapshot, null, 2),
        'utf8'
    );

    if (!report.healthy) {
        await sendTelegramAlert(report);
        console.error('🚨 [Self-Heal] Unresolved issues detected:', failedSteps.map((s) => s.name).join(', '));
        process.exitCode = 1;
    } else {
        console.log('✨ [Self-Heal] All systems 100% healthy!');
    }
}

main();
