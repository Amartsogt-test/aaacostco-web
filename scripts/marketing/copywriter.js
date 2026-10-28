/**
 * Autonomous AI Marketing Copywriter (scripts/marketing/copywriter.js)
 *
 * Generates Mongolian Facebook/Instagram ad copy, 15-second Reels voiceover scripts,
 * and first-comment conversion links using Gemini 2.5 Flash (with deterministic fallback).
 */

import axios from 'axios';

function buildDeterministicCopy(product, campaignType = 'flash_sale') {
    const hasDiscount = product.savingsMNT > 0;
    const badgeLine =
        campaignType === 'flash_sale' && hasDiscount
            ? `🔥 ОНЦГОЙ ХЯМДРАЛ: -${product.discountPercent}% (${product.savingsMNT.toLocaleString()}₮ хэмнэнэ!)`
            : campaignType === 'new_arrival'
            ? '✨ ШИНЭЭР ИРСЭН КОСТКО БАРАА!'
            : campaignType === 'clearance'
            ? '⏳ ХЯМДРАЛ ДУУСАХАД ЦӨӨХӨН ХОНОГ ҮЛДЛЭЭ!'
            : '🌟 СОЛОНГОС КОСТКО ОНЦЛОХ БАРАА!';

    const priceBlock = hasDiscount
        ? [
              `💰 Хямдарсан үнэ: **${product.priceMNT.toLocaleString()}₮** (₩${product.priceKRW.toLocaleString()})`,
              `❌ Үндсэн үнэ: ~${product.oldPriceMNT.toLocaleString()}₮~`,
              `🎁 Бодит хэмнэлт: **${product.savingsMNT.toLocaleString()}₮**`,
          ].join('\n')
        : `💰 Дэлгүүрийн үнэ: **${product.priceMNT.toLocaleString()}₮** (₩${product.priceKRW.toLocaleString()})`;

    const discountEndNote = product.discountEndDate
        ? `\n⏰ Хямдрал дуусах хугацаа: ${product.discountEndDate}`
        : '';

    const caption = [
        badgeLine,
        '',
        `🛍️ **${product.titleMn}**`,
        product.brand ? `🏷️ Брэнд: ${product.brand}` : '',
        '',
        priceBlock,
        `📦 Тооцоолсон жин: ~${product.weightKg} кг (Газраар: ~${product.groundCargoMNT.toLocaleString()}₮ | Агаараар: ~${product.airCargoMNT.toLocaleString()}₮)`,
        discountEndNote,
        '',
        '✅ Солонгос дахь Costco дэлгүүрээс 100% оригинал баталгаатай',
        '✅ Сөүлээс Улаанбаатар хүртэл шуурхай тээвэрлэлт',
        '💬 Та комментоор "ҮНЭ" эсвэл барааны кодыг бичвэл манай AI туслах 3 секундын дотор дэлгэрэнгүй тооцоолол явуулна!',
        '',
        `🔢 Барааны код: #${product.code}`,
        '#CostcoMongolia #CostcoKorea #СолонгосБараа #ОнлайнДэлгүүр #Хямдрал',
    ]
        .filter(Boolean)
        .join('\n');

    const firstComment = `🛒 Шууд захиалах холбоос: ${product.productUrl} \n🔢 Барааны код: #${product.code} — Вебсайт дээр кодоор нь хайгаад шууд сагслаарай!`;

    const reelSlides = [
        {
            slideNumber: 1,
            badge: hasDiscount ? `-${product.discountPercent}% ХЯМДРАЛ` : 'COSTCO BESTSELLER',
            headline: product.titleMn.slice(0, 58),
            subtext: 'Солонгос Костко-с шууд таны гарт!',
            voiceover: `Солонгос Косткогийн хамгийн эрэлттэй бараа болох ${product.titleMn} онцгой үнээр захиалга авч байна!`,
        },
        {
            slideNumber: 2,
            badge: product.brand ? product.brand.toUpperCase() : '100% ORIGINAL',
            headline: 'Дээд зэргийн чанар & хэмнэлт',
            subtext: `Барааны код: #${product.code} | Жин: ~${product.weightKg} кг`,
            voiceover: 'Зуун хувь оригинал, гэр бүлийн том савлагаатай тул хамгийн хэмнэлттэй сонголт болно.',
        },
        {
            slideNumber: 3,
            badge: 'БОДИТ ҮНЭ',
            headline: `${product.priceMNT.toLocaleString()}₮`,
            subtext: hasDiscount
                ? `Хуучин үнэ: ${product.oldPriceMNT.toLocaleString()}₮ (${product.savingsMNT.toLocaleString()}₮ хэмнэнэ!)`
                : `Солонгос вон: ₩${product.priceKRW.toLocaleString()}`,
            voiceover: hasDiscount
                ? `Яг одоо захиалбал ${product.savingsMNT.toLocaleString()} төгрөг хэмнээд ердөө ${product.priceMNT.toLocaleString()} төгрөгөөр аваарай!`
                : `Дэлгүүрийн үнэ ердөө ${product.priceMNT.toLocaleString()} төгрөг!`,
        },
        {
            slideNumber: 4,
            badge: 'COSTCO.MN',
            headline: 'Яг одоо захиалаарай!',
            subtext: `costco.mn | Код: #${product.code}`,
            voiceover: 'Костко цэг эм эн сайтаар орж эсвэл комментоор үнэ гэж бичээд шууд захиалаарай!',
        },
    ];

    const voiceoverScript = reelSlides.map((s) => s.voiceover).join(' ');

    return {
        caption,
        firstComment,
        reelSlides,
        voiceoverScript,
        generatedBy: 'deterministic-template',
    };
}

export async function generateMarketingCopy(product, campaignType = 'flash_sale') {
    const baseCopy = buildDeterministicCopy(product, campaignType);
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        return baseCopy;
    }

    const prompt = [
        'Та Costco.mn сошиал маркетингийн ахлах копирайтер байна.',
        'Дараах бараанд зориулж Facebook/Instagram постны маш сонирхолтой монгол тайлбар бичнэ үү.',
        `Барааны нэр: ${product.titleMn} (${product.titleKr})`,
        `Барааны код: #${product.code}`,
        `Үнэ: ${product.priceMNT.toLocaleString()}₮ (Хуучин үнэ: ${product.oldPriceMNT.toLocaleString()}₮, Хямдрал: ${product.discountPercent}%)`,
        `Жин: ~${product.weightKg} кг (Газраар тээвэр: ~${product.groundCargoMNT.toLocaleString()}₮)`,
        'Шаардлага: Эможи ашиглах, худалдан авагчийн анхаарлыг татах Hook эхлэлтэй байх, үнийн мэдээллийг яг үнэн зөв бичих, төгсгөлд нь коммент бичих эсвэл сайтаар захиалах уриалга оруулах.',
    ].join('\n');

    try {
        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
            },
            { timeout: 15000 }
        );
        const aiText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (aiText && aiText.length > 80) {
            return {
                ...baseCopy,
                caption: aiText,
                generatedBy: 'gemini-2.5-flash',
            };
        }
    } catch {
        /* fallback to deterministic template */
    }

    return baseCopy;
}
