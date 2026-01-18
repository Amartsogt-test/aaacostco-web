import React from 'react';
import { Crown, LogOut, Phone } from 'lucide-react';

export default function LoyaltyCard({ user, onLogout }) {
    if (!user) return null;

    return (
        <div className="bg-white shadow-sm md:border border-gray-100 rounded-none md:rounded-2xl p-4 md:p-6 text-gray-900 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition">
                <Crown size={80} className="text-gray-900" />
            </div>

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">Таны ангилал</p>
                        <div className="flex items-center gap-2">
                            <Crown size={20} className={user?.tier === 'Platinum' ? 'text-gray-600' : user?.tier === 'Gold' ? 'text-yellow-500' : 'text-orange-400'} fill="currentColor" />
                            <span className="text-2xl font-bold">
                                {user?.tier || 'Member'}
                            </span>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">Нийт худалдан авалт</p>
                        <p className="text-xl font-bold text-costco-blue tabular-nums">{(user?.totalSpend || 0).toLocaleString()}₮</p>
                    </div>
                </div>

                {user?.nextTier ? (
                    <div className="mb-6">
                        <div className="flex justify-between text-xs mb-1.5 opacity-90">
                            <span>Дараагийн түвшин: <strong>{user.nextTier}</strong></span>
                            <span>{(user.remain || 0).toLocaleString()}₮ дутуу</span>
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

                {/* Footer: Phone & Logout */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-600 font-medium">
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                            <Phone size={14} />
                        </div>
                        <span>{(user?.phone || user?.phoneNumber || 'Дугааргүй').replace(/^\+976/, '')}</span>
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
    );
}
