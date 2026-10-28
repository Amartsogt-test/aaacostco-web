import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronLeft, Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { adminApi } from '../services/apiClient';

const EXPORTER_INFO = {
    companyKr: '엠지물류 주식회사',
    companyEn: 'MG LOGISTICS CO., LTD.',
    bizRegNo: '351-87-03134',
    corpRegNo: '134611-0138219',
    customsCode: '엠지물류1242016',
    repName: 'AMARTSOGT BATBILEG',
    bizType: '도매 및 소매업 / 상품종합도매업(수출입업)',
    destinationCountry: 'MN',
};

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                cur += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}

function parseManifestRows(csvText = '') {
    const clean = String(csvText || '').replace(/^\uFEFF/, '').trim();
    if (!clean) return [];
    const lines = clean.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return [];
    return lines.slice(1).map((line) => {
        const cols = parseCsvLine(line);
        return {
            seq: cols[0] || '',
            orderId: cols[1] || '',
            recipientName: cols[2] || '',
            recipientReg: cols[3] || '',
            recipientPhone: cols[4] || '',
            recipientAddress: cols[5] || '',
            goodsDesc: cols[6] || 'Consumer Goods',
            qty: Number(cols[7]) || 1,
            krw: Number(cols[8]) || 0,
            weightKg: cols[9] || '1.00',
            taxStatus: cols[10] || '',
            taxMnt: cols[11] || '',
            trackingNo: cols[12] || '',
        };
    });
}

function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Admin view of the auto-generated daily manifests (built server-side by the
// dailyManifest scheduled Cloud Function). Each day's CSV is stored on the doc;
// the admin downloads it to upload into the courier / customs-broker system
// or Korea Customs UNI-PASS (전자상거래 간이수출신고) & Hometax (영세율 수출실적명세서).
export default function AdminDailyManifests() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const r = await adminApi.manifests();
            setItems((r.manifests || []).map((m) => ({ id: m.date, ...m })));
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

    const downloadUnipass = (item) => {
        const rows = parseManifestRows(item.csv);
        const headers = [
            '순번',
            '수출자상호',
            '사업자등록번호',
            '통관고유부호',
            '주문번호(OrderNo)',
            '목적국코드',
            '구매자성명',
            '구매자전화번호',
            '배송지주소',
            '품명(영문)',
            '총수량',
            '결제금액_KRW(세포함)',
            '공급가액_KRW(영세율신고)',
            '예상부가세환급액_KRW',
            '순중량_KG',
            '운송장번호(B/L)',
        ];
        const outRows = rows.map((r, idx) => {
            const supplyKrw = Math.round(r.krw / 1.1);
            const vatRefundKrw = Math.max(0, r.krw - supplyKrw);
            return [
                idx + 1,
                EXPORTER_INFO.companyKr,
                EXPORTER_INFO.bizRegNo,
                EXPORTER_INFO.customsCode,
                r.orderId,
                EXPORTER_INFO.destinationCountry,
                r.recipientName,
                r.recipientPhone,
                r.recipientAddress,
                r.goodsDesc,
                r.qty,
                r.krw,
                supplyKrw,
                vatRefundKrw,
                r.weightKg || '1.00',
                r.trackingNo,
            ];
        });
        const csvContent = '\uFEFF' + [headers, ...outRows].map((row) => row.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `unipass-export-${EXPORTER_INFO.bizRegNo}-${item.date}.csv`;
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
                    <h1 className="text-2xl font-bold text-gray-900 flex-1">Өдрийн manifest & KR Экспорт</h1>
                    <button onClick={load} className="p-2 hover:bg-gray-100 rounded-full text-gray-500" title="Шинэчлэх">
                        <RefreshCw size={18} />
                    </button>
                </div>

                <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4 mb-5">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 text-costco-blue flex items-center justify-center shrink-0">
                            <Building2 size={20} />
                        </div>
                        <div className="flex-1 text-xs text-gray-600 space-y-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="font-bold text-gray-900 text-sm">{EXPORTER_INFO.companyKr} ({EXPORTER_INFO.companyEn})</span>
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                                    사업자등록번호: {EXPORTER_INFO.bizRegNo}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                                    통관고유부호: {EXPORTER_INFO.customsCode}
                                </span>
                            </div>
                            <p>
                                업태/종목: <span className="font-medium text-gray-800">{EXPORTER_INFO.bizType}</span> • 대표자: {EXPORTER_INFO.repName}
                            </p>
                            <p className="text-gray-500">
                                Өдөр бүр 08:00 цагт (УБ) өмнөх 24 цагийн захиалгуудын Монгол гаалийн manifest болон Солонгосын Гаалийн <strong>UNI-PASS (전자상거래 간이수출신고) / Hometax 10% НӨАТ буцаан авах (부가세 영세율 조기환급)</strong> тайлан үүснэ.
                            </p>
                        </div>
                    </div>
                </div>

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
                        {items.map((item) => {
                            const rows = parseManifestRows(item.csv);
                            const totalKrw = rows.reduce((sum, r) => sum + (r.krw || 0), 0);
                            const estVatRefundKrw = Math.round(totalKrw - totalKrw / 1.1);
                            return (
                                <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 rounded-lg bg-blue-50 text-costco-blue flex items-center justify-center shrink-0">
                                            <FileText size={20} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-900">{item.date}</p>
                                            <p className="text-xs text-gray-500">
                                                {item.count || rows.length || 0} илгээмж
                                                {item.taxableCount ? ` • ${item.taxableCount} татвартай` : ''}
                                                {totalKrw > 0 ? ` • ₩${totalKrw.toLocaleString()} (10% НӨАТ буцаалт: ~₩${estVatRefundKrw.toLocaleString()})` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => download(item)}
                                            disabled={!item.csv}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-costco-blue text-white text-xs sm:text-sm font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                            title="Монгол карго / гаалийн manifest татах"
                                        >
                                            <Download size={15} /> MN CSV
                                        </button>
                                        <button
                                            onClick={() => downloadUnipass(item)}
                                            disabled={!item.csv}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs sm:text-sm font-bold hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                            title="Солонгосын UNI-PASS (전자상거래 간이수출신고) & Hometax 10% НӨАТ буцаан авах файл татах"
                                        >
                                            <FileSpreadsheet size={15} /> KR 수출신고
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
