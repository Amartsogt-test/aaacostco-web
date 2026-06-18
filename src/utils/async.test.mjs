/**
 * Unit tests for retry/backoff helper. Run with:  npm run test:async
 */
import { withRetry, isTransientError } from './async.js';

let pass = 0, fail = 0;
function eq(name, got, exp) {
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    console.log((ok ? '✓' : '✗ FAIL') + ' ' + name + (ok ? '' : `  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`));
    ok ? pass++ : fail++;
}
async function run() {
    const noSleep = () => Promise.resolve();
    const noJitter = () => 0;

    // succeeds first try
    let calls = 0;
    let r = await withRetry(async () => { calls++; return 'ok'; }, { sleep: noSleep, random: noJitter });
    eq('first-try success value', r, 'ok');
    eq('first-try call count', calls, 1);

    // fails twice (transient) then succeeds
    calls = 0;
    r = await withRetry(async () => {
        calls++;
        if (calls < 3) { const e = new Error('blip'); e.code = 'unavailable'; throw e; }
        return 'recovered';
    }, { sleep: noSleep, random: noJitter });
    eq('retry then success value', r, 'recovered');
    eq('retry then success calls', calls, 3);

    // permanent error: not retried
    calls = 0;
    let threw = null;
    try {
        await withRetry(async () => { calls++; const e = new Error('nope'); e.code = 'permission-denied'; throw e; },
            { sleep: noSleep, random: noJitter });
    } catch (e) { threw = e.message; }
    eq('permanent not retried (calls)', calls, 1);
    eq('permanent rethrows', threw, 'nope');

    // exhausts retries then throws
    calls = 0;
    threw = null;
    try {
        await withRetry(async () => { calls++; const e = new Error('down'); e.code = 'unavailable'; throw e; },
            { retries: 2, sleep: noSleep, random: noJitter });
    } catch (e) { threw = e.message; }
    eq('exhaust retries calls (1+2)', calls, 3);
    eq('exhaust rethrows last', threw, 'down');

    // classifier
    eq('transient: unavailable', isTransientError({ code: 'unavailable' }), true);
    eq('transient: network msg', isTransientError({ message: 'Network request failed' }), true);
    eq('not transient: not-found', isTransientError({ code: 'not-found' }), false);
    eq('not transient: null', isTransientError(null), false);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}
run();
