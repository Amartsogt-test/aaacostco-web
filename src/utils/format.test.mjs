/**
 * Unit tests for formatting helpers. Run with:  npm run test:format
 */
import { formatMoney, formatAmount, formatPhone, formatDate, toDate } from './format.js';

let pass = 0, fail = 0;
function eq(name, got, exp) {
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    console.log((ok ? '✓' : '✗ FAIL') + ' ' + name + (ok ? '' : `  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`));
    ok ? pass++ : fail++;
}

// money (product price — 0 means unavailable)
eq('money basic', formatMoney(27000), '27,000₮');
eq('money rounds', formatMoney(1234.6), '1,235₮');
eq('money KRW symbol', formatMoney(5000, '₩'), '5,000₩');
eq('money zero → fallback', formatMoney(0), 'Бэлэн бус');
eq('money NaN → fallback', formatMoney(undefined), 'Бэлэн бус');
eq('money custom fallback', formatMoney(0, '₩', '—'), '—');

// amount (neutral — shows 0)
eq('amount zero shows', formatAmount(0), '0₮');
eq('amount basic', formatAmount(1500, '₩'), '1,500₩');
eq('amount NaN → 0', formatAmount(undefined), '0₮');

// phone
eq('phone local 8', formatPhone('99112233'), '+976 9911 2233');
eq('phone with country', formatPhone('+97699112233'), '+976 9911 2233');
eq('phone spaced', formatPhone('9911 2233'), '+976 9911 2233');
eq('phone empty', formatPhone(''), '');
eq('phone non-standard passthrough', formatPhone('123'), '123');

// date
eq('date iso', formatDate('2024-03-09T10:20:00Z', { locale: 'en-US' }), '03/09/2024');
eq('date null → fallback', formatDate(null), '—');
const ts = { toDate: () => new Date('2024-03-09T10:20:00Z') };
eq('date timestamp', formatDate(ts, { locale: 'en-US' }), '03/09/2024');
eq('toDate iso ok', toDate('2024-01-01') instanceof Date, true);
eq('toDate junk → null', toDate('not-a-date'), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
