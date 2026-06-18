async function test() {
    try {
        const res = await fetch('https://asia-northeast3-costco-fe034.cloudfunctions.net/requestSmsCode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { phone: "95550011" } })
        });
        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Body:', text);
    } catch(e) {
        console.error(e);
    }
}
test();
