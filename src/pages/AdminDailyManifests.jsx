import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Download, FileText, RefreshCw } from 'lucide-react';

// Admin view of the auto-generated daily manifests (built server-side by the
// dailyManifest scheduled Cloud Function). Each day's CSV is stored on the doc;
// the admin downloads it to upload into the courier / customs-broker system.
export default function AdminDailyManifests() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'dailyManifests'), orderBy('date', 'desc'), limit(60));
            const snap = await getDocs(q);
            setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('Failed to load daily manifests', e);
        }
        setLoading(false);
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { load(); }, []);

    const download = (item) => {
        const blob = new Blob([item.csv || ''], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `manifest-${item.date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="container max-w-3xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => navigate('/admin')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500" title="Буцах">
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900 flex-1">Өдрийн manifest</h1>
                    <button onClick={load} className="p-2 hover:bg-gray-100 rounded-full text-gray-500" title="Шинэчлэх">
                        <RefreshCw size={18} />
                    </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                    Өдөр бүр 08:00 цагт (Улаанбаатар) өмнөх 24 цагийн шинэ захиалгуудын manifest автоматаар үүснэ.
                    CSV-г татаж курьер/брокерын системд оруулна.
                </p>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-8 h-8 border-4 border-costco-blue border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center text-gray-500 py-12 bg-white rounded-xl border border-gray-100">
                        Одоогоор manifest үүсээгүй байна. Маргааш өглөө эхний manifest бэлэн болно.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item) => (
                            <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-blue-50 text-costco-blue flex items-center justify-center shrink-0">
                                    <FileText size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900">{item.date}</p>
                                    <p className="text-xs text-gray-500">
                                        {item.count || 0} илгээмж{item.taxableCount ? ` • ${item.taxableCount} татвартай` : ''}
                                    </p>
                                </div>
                                <button
                                    onClick={() => download(item)}
                                    disabled={!item.csv}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-costco-blue text-white text-sm font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                >
                                    <Download size={16} /> CSV
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
