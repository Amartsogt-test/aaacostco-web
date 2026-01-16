import { ExternalLink, ChevronRight, ShieldCheck, Plus, Minus, TrendingUp, Package, FileText, Scan, Info, Phone, RefreshCw, Barcode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, Suspense } from 'react';
import { useAuthStore } from '../store/authStore';
import { db } from '../firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { useProductStore } from '../store/productStore';
import SalesSummaryModal from '../components/SalesSummaryModal';

const AdminContentModal = React.lazy(() => import('../components/AdminContentModal'));
const QuickScanModal = React.lazy(() => import('../components/QuickScanModal'));

export default function AdminPortal() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const isAdmin = user?.isAdmin;
    const { wonRate, setWonRate, subscribeToWonRate } = useProductStore();

    const [tempRate, setTempRate] = useState(wonRate || '');
    const [golomtRates, setGolomtRates] = useState(null);
    const [tdbRates, setTdbRates] = useState(null);
    const [khanRates, setKhanRates] = useState(null);
    const [prevGolomtRates, setPrevGolomtRates] = useState(null);
    const [prevTdbRates, setPrevTdbRates] = useState(null);
    const [prevKhanRates, setPrevKhanRates] = useState(null);

    const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
    const [isContentModalOpen, setIsContentModalOpen] = useState(false);
    const [isQuickScanOpen, setIsQuickScanOpen] = useState(false);

    useEffect(() => {
        subscribeToWonRate();

        // Subscribe to Currency Rates
        const unsub = onSnapshot(doc(db, 'settings', 'currency'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.golomtRates) setGolomtRates(data.golomtRates);
                if (data.tdbRates) setTdbRates(data.tdbRates);
                if (data.khanRates) setKhanRates(data.khanRates);

                if (data.previousGolomtRates) setPrevGolomtRates(data.previousGolomtRates);
                if (data.previousTdbRates) setPrevTdbRates(data.previousTdbRates);
                if (data.previousKhanRates) setPrevKhanRates(data.previousKhanRates);
            }
        });
        return () => unsub();
    }, [subscribeToWonRate]);

    useEffect(() => {
        if (wonRate) setTempRate(wonRate);
    }, [wonRate]);

    const adjustRate = (amount) => {
        const current = parseFloat(tempRate) || 0;
        const newRate = parseFloat((current + amount).toFixed(2));
        setTempRate(newRate);
        const userStr = user?.name || user?.email || user?.phone || 'Admin';
        setWonRate(newRate, userStr);
    };

    const saveRate = () => {
        const newRate = parseFloat(tempRate);
        if (isNaN(newRate) || newRate <= 0) {
            setTempRate(wonRate);
            return;
        }
        const userStr = user?.name || user?.email || user?.phone || 'Admin';
        setWonRate(newRate, userStr);
    };

    const handleRefresh = async () => {
        if (!window.confirm("Банкны ханшийг автоматаар татах уу?")) return;
        try {
            const docRef = doc(db, 'settings', 'currency');
            await setDoc(docRef, { refreshTrigger: true }, { merge: true });
            alert("Команд илгээгдлээ!");
        } catch (e) {
            console.error(e);
            alert("Алдаа гарлаа");
        }
    };

    const handleUpdateData = () => {
        const width = 500;
        const height = 600;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        window.open('/admin/sync?autostart=true', 'CostcoSync', `width=${width},height=${height},left=${left},top=${top},resizable=yes`);
    };

    const renderRateCell = (label, current, prev, colorClass = "text-gray-700") => {
        const diff = prev ? (current - prev) : 0;
        const isUp = diff > 0;
        const isGreen = colorClass.includes('green');

        return (
            <div className={`rounded p-1.5 flex flex-col justify-center border ${isGreen ? 'bg-green-50 border-green-100' : 'bg-blue-50 border-blue-200'}`}>
                <div className={`text-[9px] font-bold leading-tight mb-0.5 uppercase ${isGreen ? 'text-green-600' : 'text-blue-600'}`}>{label}</div>
                <div className={`text-base font-black flex items-center justify-center gap-1 ${colorClass}`}>
                    {current}
                </div>
                {diff !== 0 && (
                    <div className={`text-[9px] font-bold flex items-center justify-center ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                        {isUp ? '↑' : '↓'} {Math.abs(diff).toFixed(2)}
                    </div>
                )}
            </div>
        );
    };

    if (!isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-500">Хандах эрхгүй байна.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-4 py-6 mb-6">
                <div className="container mx-auto max-w-lg">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        Админ Портал
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Системийн тохиргоо болон удирдлага</p>
                </div>
            </div>

            <div className="container mx-auto max-w-lg px-4 space-y-6">
                {/* 1. Turbo Edit */}
                <button
                    onClick={() => setIsQuickScanOpen(true)}
                    className="w-full bg-white rounded-2xl shadow-sm border border-blue-100 p-5 flex items-center justify-between group hover:border-blue-300 transition-all"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-costco-blue group-hover:scale-110 transition-transform">
                            <Scan size={24} />
                        </div>
                        <div className="text-left">
                            <h3 className="font-bold text-costco-blue">Турбо Засвар (Баркод)</h3>
                            <p className="text-gray-400 text-xs">Хурдан засварлах</p>
                        </div>
                    </div>
                    <ChevronRight size={20} className="text-blue-200 group-hover:text-costco-blue transition-colors" />
                </button>

                {/* 2. Data Sync */}
                <button
                    onClick={handleUpdateData}
                    className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between group hover:border-blue-300 transition-all font-semibold text-gray-700"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-500 group-hover:text-costco-blue transition-colors">
                            <RefreshCw size={24} />
                        </div>
                        <span className="text-lg">Өгөгдөл шинэчлэх</span>
                    </div>
                    <ChevronRight size={20} className="text-gray-200 group-hover:text-costco-blue transition-colors" />
                </button>

                {/* Exchange Rates Grid */}
                <div className="space-y-3">
                    {golomtRates && (
                        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
                            <a
                                href="https://www.golomtbank.com/exchange"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest text-center flex items-center justify-center gap-2 hover:text-blue-600 transition-colors"
                            >
                                ГОЛОМТ БАНК /KRW/
                                <ExternalLink size={12} />
                            </a>
                            <div className="grid grid-cols-4 gap-2">
                                {renderRateCell("Бэлэн Ав", golomtRates.cashBuy, prevGolomtRates?.cashBuy, "text-green-700")}
                                {renderRateCell("Бэлэн Зар", golomtRates.cashSell, prevGolomtRates?.cashSell, "text-blue-700")}
                                {renderRateCell("Бэлэн бус", golomtRates.nonCashBuy, prevGolomtRates?.nonCashBuy, "text-green-700")}
                                {renderRateCell("Бэлэн бус", golomtRates.nonCashSell, prevGolomtRates?.nonCashSell, "text-blue-700")}
                            </div>
                        </div>
                    )}

                    {tdbRates && (
                        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
                            <a
                                href="https://www.tdbm.mn/mn/exchange-rates"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest text-center flex items-center justify-center gap-2 hover:text-blue-600 transition-colors"
                            >
                                ХУДАЛДАА ХӨГЖЛИЙН БАНК /KRW/
                                <ExternalLink size={12} />
                            </a>
                            <div className="grid grid-cols-4 gap-2">
                                {renderRateCell("Бэлэн Ав", tdbRates.cashBuy, prevTdbRates?.cashBuy, "text-green-700")}
                                {renderRateCell("Бэлэн Зар", tdbRates.cashSell, prevTdbRates?.cashSell, "text-blue-700")}
                                {renderRateCell("Бэлэн бус", tdbRates.nonCashBuy, prevTdbRates?.nonCashBuy, "text-green-700")}
                                {renderRateCell("Бэлэн бус", tdbRates.nonCashSell, prevTdbRates?.nonCashSell, "text-blue-700")}
                            </div>
                        </div>
                    )}

                    {khanRates && (
                        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
                            <a
                                href="https://www.khanbank.com/personal/rates/exchange-rate"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest text-center flex items-center justify-center gap-2 hover:text-blue-600 transition-colors"
                            >
                                ХААН БАНК /KRW/
                                <ExternalLink size={12} />
                            </a>
                            <div className="grid grid-cols-4 gap-2">
                                {renderRateCell("Бэлэн Ав", khanRates.cashBuy, prevKhanRates?.cashBuy, "text-green-700")}
                                {renderRateCell("Бэлэн Зар", khanRates.cashSell, prevKhanRates?.cashSell, "text-blue-700")}
                                {renderRateCell("Бэлэн бус", khanRates.nonCashBuy, prevKhanRates?.nonCashBuy, "text-green-700")}
                                {renderRateCell("Бэлэн бус", khanRates.nonCashSell, prevKhanRates?.nonCashSell, "text-blue-700")}
                            </div>
                        </div>
                    )}
                </div>

                {/* Rate Adjuster Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleRefresh}
                            className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-costco-blue hover:bg-blue-100 transition-colors"
                            title="Банкны ханш автоматаар татах"
                        >
                            <TrendingUp size={20} />
                        </button>
                        <span className="font-bold text-gray-700">Банкны ханш шинэчлэх</span>
                    </div>

                    <div className="flex items-center bg-gray-100 rounded-xl p-1.5 border border-transparent shadow-inner">
                        <button onClick={() => adjustRate(-0.01)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all shadow-sm">
                            <Minus size={18} />
                        </button>
                        <input
                            type="number"
                            value={tempRate}
                            onChange={(e) => setTempRate(e.target.value)}
                            onBlur={saveRate}
                            onKeyDown={(e) => e.key === 'Enter' && saveRate()}
                            className="w-16 bg-transparent text-center font-black text-gray-800 outline-none text-lg"
                        />
                        <button onClick={() => adjustRate(0.01)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all shadow-sm">
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                {/* Main Action Menu */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                    <button onClick={() => setIsSalesModalOpen(true)} className="w-full flex items-center justify-between p-5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-50 text-costco-blue rounded-xl flex items-center justify-center">
                                <TrendingUp size={20} />
                            </div>
                            <span className="text-lg font-bold text-gray-700">Борлуулалтын мэдээ</span>
                        </div>
                        <ChevronRight size={20} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>

                    <button onClick={() => navigate('/admin/orders')} className="w-full flex items-center justify-between p-5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-costco-blue transition-colors">
                                <Package size={20} />
                            </div>
                            <span className="text-lg font-bold text-gray-700">Захиалга</span>
                        </div>
                        <ChevronRight size={20} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>

                    <button onClick={() => navigate('/admin/products')} className="w-full flex items-center justify-between p-5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-costco-blue transition-colors">
                                <ShieldCheck size={20} />
                            </div>
                            <span className="text-lg font-bold text-gray-700">Барааны жагсаалт</span>
                        </div>
                        <ChevronRight size={20} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>

                    <button onClick={() => navigate('/admin/add-product')} className="w-full flex items-center justify-between p-5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-costco-blue transition-colors">
                                <Plus size={20} />
                            </div>
                            <span className="text-lg font-bold text-gray-700">Бараа нэмэх</span>
                        </div>
                        <ChevronRight size={20} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>

                    <button onClick={() => setIsContentModalOpen(true)} className="w-full flex items-center justify-between p-5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-costco-blue transition-colors">
                                <FileText size={20} />
                            </div>
                            <span className="text-lg font-bold text-gray-700">Сайтын мэдээлэл</span>
                        </div>
                        <ChevronRight size={20} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>
                </div>
            </div>

            {/* Modals */}
            <SalesSummaryModal
                isOpen={isSalesModalOpen}
                onClose={() => setIsSalesModalOpen(false)}
            />

            <Suspense fallback={null}>
                <AdminContentModal
                    isOpen={isContentModalOpen}
                    onClose={() => setIsContentModalOpen(false)}
                />
                <QuickScanModal
                    isOpen={isQuickScanOpen}
                    onClose={() => setIsQuickScanOpen(false)}
                />
            </Suspense>
        </div>
    );
}
