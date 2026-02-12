import { ExternalLink, ChevronRight, ShieldCheck, Plus, Minus, TrendingUp, Package, FileText, Scan, RefreshCw, MessageCircle, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

// db, doc, setDoc, onSnapshot moved to service
import { useProductStore } from '../store/productStore';
import { useSettingsStore } from '../store/settingsStore';


const AdminPortal = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const isAdmin = user?.isAdmin;
    const { wonRate, setWonRate, subscribeToWonRate } = useProductStore();
    const { currencyRates, subscribeToCurrencyRates, refreshBankRates } = useSettingsStore();

    const [tempRate, setTempRate] = useState(wonRate || '');
    // Sync tempRate when wonRate changes from store (avoids setState-in-effect)
    const [prevWonRate, setPrevWonRate] = useState(wonRate);
    if (wonRate !== prevWonRate) {
        setPrevWonRate(wonRate);
        if (wonRate) setTempRate(wonRate);
    }

    // Derive bank rates directly from store (no local state sync needed)
    const golomtRates = currencyRates?.golomtRates || null;
    const tdbRates = currencyRates?.tdbRates || null;
    const khanRates = currencyRates?.khanRates || null;
    const prevGolomtRates = currencyRates?.previousGolomtRates || null;
    const prevTdbRates = currencyRates?.previousTdbRates || null;
    const prevKhanRates = currencyRates?.previousKhanRates || null;

    useEffect(() => {
        const unsubWon = subscribeToWonRate();
        const unsubCurrency = subscribeToCurrencyRates();
        return () => {
            if (unsubWon) unsubWon();
            if (unsubCurrency) unsubCurrency();
        };
    }, [subscribeToWonRate, subscribeToCurrencyRates]);

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
            await refreshBankRates();
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

    const renderRateCell = (label, current, prev, styleClass = "text-gray-700 bg-white border-gray-200") => {
        const diff = prev ? parseFloat((current - prev).toFixed(3)) : 0;
        const hasChange = Math.abs(diff) >= 0.001;
        const _isUp = diff > 0;

        return (
            <div className={`rounded-xl p-1 flex items-center gap-2 ${styleClass} transition-transform active:scale-95`}>
                <div className="flex items-baseline gap-1.5 leading-none">
                    <span className={`text-[10px] font-bold ${prev ? 'opacity-25 line-through' : 'opacity-60 uppercase tracking-wider'}`}>
                        {prev || label}
                    </span>
                    <div className="text-xl font-black flex items-center gap-0.5">
                        {current}
                        {hasChange && (
                            <span className={`text-[10px] ${_isUp ? 'text-green-600' : 'text-red-500'}`}>
                                {_isUp ? '▲' : '▼'}
                            </span>
                        )}
                    </div>
                </div>
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


            <div className="container mx-auto max-w-lg px-4 space-y-2 pt-6">
                {/* Group 4: Exchange Rates & Adjuster */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50 p-1">
                    {golomtRates && (
                        <div className="py-0.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <a
                                    href="https://www.golomtbank.com/exchange"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold text-gray-700 uppercase tracking-wide hover:text-blue-600 transition-colors flex items-center gap-2"
                                >
                                    <img src="/bank-logos/golomt.png" onError={(e) => e.target.style.display = 'none'} className="w-6 h-6 object-contain hidden" alt="" />
                                    ГОЛОМТ БАНК
                                    <ExternalLink size={14} className="text-gray-400" />
                                </a>
                            </div>
                            <div className="flex items-center gap-3">
                                {renderRateCell("Авах", golomtRates.nonCashBuy, prevGolomtRates?.nonCashBuy, "text-green-700 w-24")}
                                {renderRateCell("Зарах", golomtRates.nonCashSell, prevGolomtRates?.nonCashSell, "text-blue-700 w-24")}
                            </div>
                        </div>
                    )}

                    {tdbRates && (
                        <div className="py-0.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <a
                                    href="https://www.tdbm.mn/mn/exchange-rates"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold text-gray-700 uppercase tracking-wide hover:text-blue-600 transition-colors flex items-center gap-2"
                                >
                                    <img src="/bank-logos/tdb.png" onError={(e) => e.target.style.display = 'none'} className="w-6 h-6 object-contain hidden" alt="" />
                                    ХУДАЛДАА ХӨГЖИЛ
                                    <ExternalLink size={14} className="text-gray-400" />
                                </a>
                            </div>
                            <div className="flex items-center gap-3">
                                {renderRateCell("Авах", tdbRates.nonCashBuy, prevTdbRates?.nonCashBuy, "text-green-700 w-24")}
                                {renderRateCell("Зарах", tdbRates.nonCashSell, prevTdbRates?.nonCashSell, "text-blue-700 w-24")}
                            </div>
                        </div>
                    )}

                    {khanRates && (
                        <div className="py-0.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <a
                                    href="https://www.khanbank.com/personal/rates/exchange-rate"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold text-gray-700 uppercase tracking-wide hover:text-blue-600 transition-colors flex items-center gap-2"
                                >
                                    <img src="/bank-logos/khan.png" onError={(e) => e.target.style.display = 'none'} className="w-6 h-6 object-contain hidden" alt="" />
                                    ХААН БАНК
                                    <ExternalLink size={14} className="text-gray-400" />
                                </a>
                            </div>
                            <div className="flex items-center gap-3">
                                {renderRateCell("Авах", khanRates.nonCashBuy, prevKhanRates?.nonCashBuy, "text-green-700 w-24")}
                                {renderRateCell("Зарах", khanRates.nonCashSell, prevKhanRates?.nonCashSell, "text-blue-700 w-24")}
                            </div>
                        </div>
                    )}

                    <div className="py-0.5 px-4 flex items-center justify-between">
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

                        <div className="flex items-center gap-2">
                            <button onClick={() => adjustRate(-0.01)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-gray-50 rounded-lg transition-all">
                                <Minus size={18} />
                            </button>
                            <input
                                type="number"
                                value={tempRate}
                                onChange={(e) => setTempRate(e.target.value)}
                                onBlur={saveRate}
                                onKeyDown={(e) => e.key === 'Enter' && saveRate()}
                                className="w-16 bg-transparent text-center font-black text-gray-800 outline-none text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button onClick={() => adjustRate(0.01)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-gray-50 rounded-lg transition-all">
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Action Menu */}
                {/* Group 1: Orders & Sales */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                    <button onClick={() => navigate('/admin/orders')} className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-costco-blue transition-colors">
                                <Package size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Захиалга</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>

                    <button onClick={() => navigate('/sales-summary')} className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 text-costco-blue rounded-xl flex items-center justify-center">
                                <TrendingUp size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Борлуулалт</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>
                </div>

                {/* Group 2: Operations (Sync & Chat) */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                    <button
                        onClick={handleUpdateData}
                        className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center text-gray-500 group-hover:text-costco-blue transition-colors">
                                <RefreshCw size={20} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Өгөгдөл шинэчлэх</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>

                    <button onClick={() => navigate('/admin/chat')} className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                                <MessageCircle size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Админ Чат</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>
                </div>



                {/* Group 2: Products */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                    <button onClick={() => navigate('/admin/ai-review')} className="w-full flex items-center justify-between p-1.5 hover:bg-purple-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                                <Wand2 size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">AI Review Center</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-purple-600 transition-colors" />
                    </button>
                    <button onClick={() => navigate('/admin/daily-reports')} className="w-full flex items-center justify-between p-1.5 hover:bg-purple-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                                <FileText size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Өдөр тутмын тайлан</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-purple-600 transition-colors" />
                    </button>
                    <button onClick={() => navigate('/scanner')} className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center text-costco-blue group-hover:scale-110 transition-transform">
                                <Scan size={18} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-gray-700 text-base">Турбо Засвар (Баркод)</h3>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>
                    <button onClick={() => navigate('/admin/add-product')} className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-costco-blue transition-colors">
                                <Plus size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Бараа нэмэх</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>

                    <button onClick={() => navigate('/admin/products')} className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-costco-blue transition-colors">
                                <ShieldCheck size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Барааны жагсаалт</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>
                </div>

                {/* Group 3: Settings */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                    <button onClick={() => navigate('/admin/settings')} className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-costco-blue transition-colors">
                                <FileText size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Сайтын мэдээлэл</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AdminPortal;
