const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../functions/service-account.json');

if (!admin.apps.length) {
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

// Korean Regex
const KOREAN_REGEX = /[\u3131-\uD79D]/ugi;
const WON_REGEX = /₩/g;

const hasKorean = (text) => {
    if (!text) return false;
    const str = typeof text === 'string' ? text : JSON.stringify(text);
    return KOREAN_REGEX.test(str) || WON_REGEX.test(str);
};

async function generateReport() {
    console.log('📊 Generating Maintenance Report...');
    const snapshot = await db.collection('products').get();

    const issues = {
        missingWeight: [],
        unfixableWeight: [],
        koreanText: [],
        translationManual: [],
        missingDescription: [],
        failedDescription: []
    };

    snapshot.forEach(doc => {
        const p = { id: doc.id, ...doc.data() };

        // Weights
        if (!p.weight || p.weight === 0) {
            if (p.aiWeightStatus === 'unfixable') issues.unfixableWeight.push(p);
            else issues.missingWeight.push(p);
        }

        // Translations
        if (hasKorean(p.name_mn) || hasKorean(p.description_mn) || hasKorean(p.specifications_mn)) {
            if (p.translationStatus === 'manual_required') issues.translationManual.push(p);
            else issues.koreanText.push(p);
        }

        // Descriptions
        if (!p.shortDescription || p.shortDescription.length < 10) {
            if (p.aiDescriptionStatus === 'failed') issues.failedDescription.push(p);
            else issues.missingDescription.push(p);
        }
    });

    let report = `# 🛠️ AI Maintenance Report\n\nGenerated on: ${new Date().toLocaleString()}\n\n`;

    report += `## ⚖️ Weight Issues (${issues.unfixableWeight.length + issues.missingWeight.length})\n`;
    report += `### ❌ Unfixable by AI (${issues.unfixableWeight.length})\n`;
    issues.unfixableWeight.forEach(p => report += `- [${p.id}] ${p.name_mn || p.name}\n`);
    report += `\n### ⏳ Pending AI Processing (${issues.missingWeight.length})\n`;
    issues.missingWeight.slice(0, 10).forEach(p => report += `- [${p.id}] ${p.name_mn || p.name}\n`);
    if (issues.missingWeight.length > 10) report += `- ... and ${issues.missingWeight.length - 10} more\n`;

    report += `\n## 🗣️ Translation Issues (${issues.translationManual.length + issues.koreanText.length})\n`;
    report += `### ❌ Manual Review Required (${issues.translationManual.length})\n`;
    issues.translationManual.forEach(p => report += `- [${p.id}] ${p.name_mn || p.name}\n`);
    report += `\n### ⏳ Pending Translation (${issues.koreanText.length})\n`;
    issues.koreanText.slice(0, 10).forEach(p => report += `- [${p.id}] ${p.name_mn || p.name}\n`);
    if (issues.koreanText.length > 10) report += `- ... and ${issues.koreanText.length - 10} more\n`;

    report += `\n## 📝 Description Issues (${issues.failedDescription.length + issues.missingDescription.length})\n`;
    report += `### ❌ Generation Failed (${issues.failedDescription.length})\n`;
    issues.failedDescription.forEach(p => report += `- [${p.id}] ${p.name_mn || p.name}\n`);
    report += `\n### ⏳ Pending Generation (${issues.missingDescription.length})\n`;
    issues.missingDescription.slice(0, 10).forEach(p => report += `- [${p.id}] ${p.name_mn || p.name}\n`);
    if (issues.missingDescription.length > 10) report += `- ... and ${issues.missingDescription.length - 10} more\n`;

    const reportPath = path.join(process.cwd(), 'maintenance_report.md');
    fs.writeFileSync(reportPath, report);
    console.log(`✅ Report generated at: ${reportPath}`);
}

generateReport().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
