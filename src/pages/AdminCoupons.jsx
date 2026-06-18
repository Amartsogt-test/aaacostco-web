import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2, RefreshCw, Tag } from 'lucide-react';

// Admin coupon management. Coupons live at coupons/{CODE} (uppercase id) and are
// validated at checkout by the validateCoupon Cloud Function.
export default function AdminCoupons() {
    const navigate = useNavigate();
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ code: '', type: 'percent', value: '', minOrderMNT: '', expiresAt: '', label: '', usageLimit: '' });

    const load = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'coupons'));
            setCoupons(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error('load coupons failed', e); }
        setLoading(false);
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { load(); }, []);

    const save = async () => {
        const code = form.code.trim().toUpperCase();
        if (!code || !Number(form.value)) { alert('Код болон утгыг оруулна уу.'); return; }
        setSaving(true);
        try {
            await setDoc(doc(db, 'coupons', code), {
                code,
                type: form.type === 'fixed' ? 'fixed' : 'percent',
                value: Number(form.value),
                minOrderMNT: Number(form.minOrderMNT) || 0,
                usageLimit: Number(form.usageLimit) || 0,
                expiresAt: form.expiresAt || null,
                label: form.label || '',
                active: true,
                createdAt: new Date().toISOString(),
            }, { merge: true });
            setForm({ code: '', type: 'percent', value: '', minOrderMNT: '', expiresAt: '', label: '', usageLimit: '' });
            load();
        } catch (e) { console.error(e); alert('Хадгалахад алдаа гарлаа.'); }
        setSaving(false);
    };
    const toggle = async (c) => { try { await setDoc(doc(db, 'coupons', c.id), { active: !c.active }, { merge: true }); load(); } catch (e) { console.error(e); } };
    const remove = async (c) => { if (confirm(`${c.id} купоныг устгах уу?`)) { try { await deleteDoc(doc(db, 'coupons', c.id)); load(); } catch (e) { console.error(e); } } };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="container max-w-3xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => navigate('/admin')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500" title="Буцах"><ChevronLeft size={24} /></button>
                    <h1 className="text-2xl font-bold text-gray-900 flex-1">Промо код / купон</h1>
                    <button onClick={load} className="p-2 hover:bg-gray-100 rounded-full text-gray-500" title="Шинэчлэх"><RefreshCw size={18} /></button>
                </div>

                {/* Create */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6 space-y-3">
                    <p className="text-sm font-bold text-gray-700">Шинэ купон</p>
                    <div className="grid grid-cols-2 gap-3">
                        <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="КОД (ж: SALE10)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-costco-blue" />
                        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-costco-blue">
                            <option value="percent">Хувь (%)</option>
                            <option value="fixed">Тогтмол (₮)</option>
                        </select>
                        <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.type === 'fixed' ? 'Дүн ₮' : 'Хувь %'} className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-costco-blue" />
                        <input type="number" value={form.minOrderMNT} onChange={(e) => setForm({ ...form, minOrderMNT: e.target.value })} placeholder="Доод дүн ₮ (заавал биш)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-costco-blue" />
                        <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-costco-blue" />
                        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Тайлбар (заавал биш)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-costco-blue" />
                        <input type="number" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} placeholder="Ашиглах хязгаар (заавал биш)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-costco-blue" />
                    </div>
                    <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-costco-blue text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">{saving ? 'Хадгалж байна...' : 'Купон үүсгэх'}</button>
                </div>

                {/* List */}
                {loading ? (
                    <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-costco-blue border-t-transparent rounded-full animate-spin" /></div>
                ) : coupons.length === 0 ? (
                    <div className="text-center text-gray-500 py-10 bg-white rounded-xl border border-gray-100">Купон алга байна.</div>
                ) : (
                    <div className="space-y-2">
                        {coupons.map((c) => (
                            <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-blue-50 text-costco-blue flex items-center justify-center shrink-0"><Tag size={18} /></div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900">{c.id} <span className="text-sm font-normal text-gray-500">— {c.type === 'fixed' ? `${Number(c.value).toLocaleString()}₮` : `${c.value}%`}</span></p>
                                    <p className="text-xs text-gray-500">
                                        {c.minOrderMNT ? `Доод ${Number(c.minOrderMNT).toLocaleString()}₮ • ` : ''}{c.expiresAt ? `${c.expiresAt} хүртэл • ` : ''}{c.label || ''}
                                    </p>
                                </div>
                                <button onClick={() => toggle(c)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${c.active === false ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>{c.active === false ? 'Идэвхгүй' : 'Идэвхтэй'}</button>
                                <button onClick={() => remove(c)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
