import React, { useState } from 'react';
import { Crown, LogOut, Phone, Info, X, Gift } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

export default function LoyaltyCard({ user, onLogout }) {
    const [isBenefitsOpen, setIsBenefitsOpen] = useState(false);
    const { settings } = useSettingsStore();
    const benefits = settings?.membershipBenefits || { silver: '', gold: '', platinum: '' };

    if (!user) return null;

    const tier = user?.tier || 'Silver';
    const isPlatinum = tier === 'Platinum';
    const isGold = tier === 'Gold';

    // 🎁 Soonest-expiring loyalty bonus lot (each lot expires 1 month after it was earned).
    const lots = Array.isArray(user?.loyaltyLots) ? user.loyaltyLots.filter(l => l && new Date(l.expiresAt) > new Date()) : [];
    const soonest = lots.length ? lots.reduce((a, b) => new Date(a.expiresAt) < new Date(b.expiresAt) ? a : b) : null;
    const expiryText = soonest
        ? `${Math.round(Number(soonest.krw) || 0).toLocaleString()}₩ — ${new Date(soonest.expiresAt).toLocaleDateString('mn-MN')}-нд дуусна`
        : null;
    
    // Determine colors
    const crownColor = isPlatinum ? 'text-slate-800' : isGold ? 'text-yellow-500' : 'text-gray-400';

    return (
        <>
            <div className="bg-white shadow-sm md:border border-gray-100 rounded-none md:rounded-2xl p-4 md:p-6 text-gray-900 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition">
                    <Crown size={80} className="text-gray-900" />
                </div>

                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">Таны ангилал</p>
                            <div className="flex items-center gap-2">
                                <Crown size={20} className={crownColor} fill="currentColor" />
                                <span className="text-2xl font-bold">
                                    {tier}
                                </span>
                            </div>
                            <button 
                                onClick={() => setIsBenefitsOpen(true)}
                                className="mt-1 flex items-center gap-1 text-xs text-costco-blue hover:text-blue-700 font-medium transition"
                            >
                                <Info size={14} />
                                Гишүүнчлэлийн давуу тал
                            </button>
                        </div>
                        <div className="text-right">
                            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">Нийт худалдан авалт</p>
                            <p className="text-xl font-bold text-costco-blue tabular-nums">{(user?.totalSpend || 0).toLocaleString()}₩</p>
                        </div>
                    </div>

                    {user?.nextTier ? (
                        <div className="mb-6">
                            <div className="flex justify-between text-xs mb-1.5 opacity-90">
                                <span>Дараагийн түвшин: <strong>{user.nextTier}</strong></span>
                                <span>{(user.remain || 0).toLocaleString()}₩ дутуу</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-costco-blue to-blue-400 rounded-full transition-all duration-1000"
                                    style={{ width: `${Math.min(100, ((user?.totalSpend || 0) / ((user?.totalSpend || 0) + (user?.remain || 1))) * 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-6 text-sm bg-blue-50 text-blue-700 rounded-lg py-2 px-3 inline-flex items-center gap-2 font-medium">
                            <Crown size={14} />
                            Та хамгийн өндөр түвшинд байна!
                        </div>
                    )}

                    {/* 🎁 Лояалти оноо (воноор хадгална/харуулна) */}
                    <div className="mb-4 bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-xl py-3 px-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-gray-700 font-medium">
                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                                    <Gift size={16} />
                                </div>
                                <span>Лояалти оноо</span>
                            </div>
                            <p className="text-xl font-bold text-red-600 tabular-nums">{(user?.loyaltyPointsKRW || 0).toLocaleString()}₩</p>
                        </div>
                        {expiryText && (
                            <p className="text-[11px] text-red-400 mt-1.5 text-right leading-snug">⏳ {expiryText}</p>
                        )}
                    </div>

                    {/* Footer: Phone & Logout */}
                    <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-600 font-medium">
                            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                                <Phone size={14} />
                            </div>
                            <span>{String(user?.phone || user?.phoneNumber || 'Дугааргүй').replace(/^\+976/, '')}</span>
                        </div>

                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition"
                            >
                                <LogOut size={14} />
                                Гарах
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Benefits Modal */}
            {isBenefitsOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                <Crown size={20} className="text-costco-blue" />
                                Гишүүнчлэлийн давуу тал
                            </h3>
                            <button onClick={() => setIsBenefitsOpen(false)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-full transition">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <Crown size={20} className="text-gray-400" fill="currentColor" />
                                    <span className="font-bold text-lg text-gray-800">Silver гишүүн</span>
                                </div>
                                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl whitespace-pre-wrap">
                                    {benefits.silver || "Бүртгүүлсэн бүх хэрэглэгч. Таны худалдан авалт 10,000,000₩ хүртэл."}
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <Crown size={20} className="text-yellow-500" fill="currentColor" />
                                    <span className="font-bold text-lg text-gray-800">Gold гишүүн</span>
                                </div>
                                <div className="text-sm text-gray-600 bg-yellow-50/50 p-3 rounded-xl border border-yellow-100 whitespace-pre-wrap">
                                    {benefits.gold || "Нийт худалдан авалт 10,000,000₩ давсан хэрэглэгч."}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <Crown size={20} className="text-slate-800" fill="currentColor" />
                                    <span className="font-bold text-lg text-gray-800">Platinum гишүүн</span>
                                </div>
                                <div className="text-sm text-gray-600 bg-slate-50 p-3 rounded-xl border border-slate-200 whitespace-pre-wrap">
                                    {benefits.platinum || "Нийт худалдан авалт 20,000,000₩ давсан онцгой хэрэглэгч."}
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex justify-end">
                            <button 
                                onClick={() => setIsBenefitsOpen(false)}
                                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition"
                            >
                                Хаах
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
