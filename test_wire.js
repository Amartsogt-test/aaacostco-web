// Quick test of Wire.mn API
const API_KEY = 'sk_live_fyxmucordrwerzccl2id4touxoiekdsd';
const BASE = 'https://api.wire.mn/v1';

async function test() {
    console.log('Testing Wire.mn API at', BASE);
    
    try {
        const body = {
            amount: 100,
            currency: 'MNT',
            automatic_operator: true,
            metadata: { orderId: 'test123' }
        };
        
        console.log('Request body:', JSON.stringify(body));
        
        const r = await fetch(`${BASE}/payment_intents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'Idempotency-Key': 'test_' + Date.now()
            },
            body: JSON.stringify(body)
        });
        
        console.log('Status:', r.status, r.statusText);
        const text = await r.text();
        console.log('Response:', text);
        
        if (r.ok) {
            const data = JSON.parse(text);
            console.log('\n=== Payment Intent Created ===');
            console.log('Intent ID:', data.id);
            console.log('Status:', data.status);
            
            // Now try to confirm with qpay
            console.log('\nConfirming with QPay...');
            const confirmR = await fetch(`${BASE}/payment_intents/${data.id}/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    'Idempotency-Key': 'test_confirm_' + Date.now()
                },
                body: JSON.stringify({
                    operator: 'qpay',
                    return_url: 'https://costco.mn/orders'
                })
            });
            
            console.log('Confirm Status:', confirmR.status, confirmR.statusText);
            const confirmText = await confirmR.text();
            console.log('Confirm Response:', confirmText);
            
            if (confirmR.ok) {
                const confirmData = JSON.parse(confirmText);
                console.log('\n=== QR Data ===');
                console.log('next_action:', JSON.stringify(confirmData.next_action, null, 2));
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
        if (e.cause) console.error('Cause:', e.cause.message);
    }
}

test();
