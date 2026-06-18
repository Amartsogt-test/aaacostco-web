import { ChevronRight, ShieldCheck, Plus, Minus, TrendingUp, Package, FileText, Scan, RefreshCw, MessageCircle, Wand2, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

// db, doc, setDoc, onSnapshot moved to service
import { useProductStore } from '../store/productStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';


const AdminPortal = ({ embedded = false }) => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const isAdmin = user?.isAdmin;
    const { wonRate, setWonRate, subscribeToWonRate } = useProductStore();
    const { refreshBankRates } = useSettingsStore();
    const { showToast } = useUIStore();

    const [tempRate, setTempRate] = useState(wonRate || '');
    // Sync tempRate when wonRate changes from store (avoids setState-in-effect)
    const [prevWonRate, setPrevWonRate] = useState(wonRate);
    if (wonRate !== prevWonRate) {
        setPrevWonRate(wonRate);
        if (wonRate) setTempRate(wonRate);
    }

    useEffect(() => {
        // wonRate is an APP-LEVEL live subscription (started in App.jsx) and is
        // idempotent (memoised on window.__wonRateUnsubscribe). Ensure it's active,
        // but DON'T unsubscribe on unmount — doing so killed the shared subscription
        // for the rest of the session (the guard then refused to re-subscribe), so
        // the exchange rate silently stopped updating app-wide after leaving admin.
        subscribeToWonRate();
    }, [subscribeToWonRate]);

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
            showToast('Команд илгээгдлээ!', 'success');
        } catch (e) {
            console.error(e);
            showToast('Алдаа гарлаа. Дахин оролдоно уу.', 'error');
        }
    };

    const handleUpdateData = () => {
        const width = 500;
        const height = 600;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        window.open('/admin/sync?autostart=true', 'CostcoSync', `width=${width},height=${height},left=${left},top=${top},resizable=yes`);
    };

    if (!isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-500">Хандах эрхгүй байна.</p>
            </div>
        );
    }

    return (
        <div className={embedded ? "w-full" : "min-h-screen bg-gray-50 pb-20"}>
            <div className={`container mx-auto max-w-lg px-4 space-y-3 ${embedded ? '' : 'pt-6'}`}>
                {/* 🤖 Premium AI Price Tag Scanner Banner at the top */}
                <div 
                    onClick={() => navigate('/admin/scanner')}
                    className="bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 rounded-3xl p-5 shadow-lg border border-indigo-900/40 cursor-pointer hover:shadow-indigo-950/20 active:scale-98 transition flex items-center justify-between text-white group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-500/25 text-indigo-300 rounded-2xl flex items-center justify-center border border-indigo-500/30 group-hover:scale-105 transition">
                            <Camera size={24} />
                        </div>
                        <div className="text-left">
                            <h3 className="font-black text-[10px] uppercase tracking-wider text-indigo-300">AI Сканнер</h3>
                            <h2 className="font-extrabold text-base text-slate-50 leading-tight">Үнийн шошго уншуулах</h2>
                            <p className="text-[11px] text-slate-400 mt-0.5">Солонгос 🇰🇷 & Америк 🇺🇸 Costco шошгоны AI уншилт</p>
                        </div>
                    </div>
                    <ChevronRight size={20} className="text-indigo-400 group-hover:text-white transition-colors" />
                </div>

                {/* Group 4: Exchange Rate Refresh & Adjuster */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50 p-1">
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
                            <button onClick={() => adjustRate(-0.01)} aria-label="Ханш бууруулах" className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-gray-50 rounded-lg transition-all">
                                <Minus size={18} />
                            </button>
                            <input
                                type="number"
                                value={tempRate}
                                aria-label="Вон-ийн ханш"
                                onChange={(e) => setTempRate(e.target.value)}
                                onBlur={saveRate}
                                onKeyDown={(e) => e.key === 'Enter' && saveRate()}
                                className="w-16 bg-transparent text-center font-black text-gray-800 outline-none text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button onClick={() => adjustRate(0.01)} aria-label="Ханш нэмэгдүүлэх" className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-gray-50 rounded-lg transition-all">
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
                    <button onClick={() => navigate('/admin/daily-manifests')} className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 text-costco-blue rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                <FileText size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Өдрийн manifest (гаалийн)</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
                    </button>
                    <button onClick={() => navigate('/admin/coupons')} className="w-full flex items-center justify-between p-1.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 text-costco-blue rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                <FileText size={18} />
                            </div>
                            <span className="text-base font-bold text-gray-700">Промо код / купон</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-costco-blue transition-colors" />
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
