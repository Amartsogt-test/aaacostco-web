import { ExternalLink, RefreshCw, LogOut, User, ChevronRight, CheckCircle, ShieldCheck, Plus, Minus, TrendingUp, Crown, Package, Image as ImageIcon, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, Suspense } from 'react';
import { useAuthStore } from '../store/authStore';
import { auth, db } from '../firebase';
import { FacebookAuthProvider, linkWithPopup } from 'firebase/auth';

import { doc, setDoc, onSnapshot } from 'firebase/firestore'; // Added onSnapshot
import { useProductStore } from '../store/productStore';
import SalesSummaryModal from '../components/SalesSummaryModal';
// import LoginModal from '../components/LoginModal';
// import AdminBannerModal from '../components/AdminBannerModal';

const LoginModal = React.lazy(() => import('../components/LoginModal'));
const AdminBannerModal = React.lazy(() => import('../components/AdminBannerModal'));
const AdminContentModal = React.lazy(() => import('../components/AdminContentModal'));

export default function Profile() {
    const navigate = useNavigate();
    const { logout, user, isAuthenticated, refreshUserSpend } = useAuthStore();
    // const [showOnboarding, setShowOnboarding] = useState(false); // Unused
    const { wonRate, setWonRate, subscribeToWonRate } = useProductStore();
    const [tempRate, setTempRate] = useState(wonRate || '');
    const [golomtRates, setGolomtRates] = useState(null); // Added state
    const [tdbRates, setTdbRates] = useState(null); // Added TDBM state
    const [khanRates, setKhanRates] = useState(null); // Added Khan state
    const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
    const [isAdminBannerOpen, setIsAdminBannerOpen] = useState(false);
    const [isContentModalOpen, setIsContentModalOpen] = useState(false);

    // Initial Load
    useEffect(() => {
        subscribeToWonRate();

        // Subscribe to Currency Rates (Golomt & TDBM)
        const unsub = onSnapshot(doc(db, 'settings', 'currency'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.golomtRates) {
                    setGolomtRates(data.golomtRates);
                }
                if (data.tdbRates) {
                    setTdbRates(data.tdbRates);
                }
                if (data.khanRates) {
                    setKhanRates(data.khanRates);
                }
            }
        });
        return () => unsub();
    }, [subscribeToWonRate]);

    useEffect(() => {
        if (wonRate) {
            setTempRate(wonRate);
        }
    }, [wonRate]);

    useEffect(() => {
        if (user?.phone) {
            refreshUserSpend(user.phone);
        }
    }, [user?.phone, refreshUserSpend]);

    const adjustRate = (amount) => {
        const current = parseFloat(tempRate) || 0;
        const newRate = parseFloat((current + amount).toFixed(2));
        setTempRate(newRate);

        // Auto-save when clicking buttons
        const userStr = user?.name || user?.email || user?.phone || 'User';
        setWonRate(newRate, userStr);
    };

    const saveRate = () => {
        const newRate = parseFloat(tempRate);
        if (isNaN(newRate) || newRate <= 0) {
            setTempRate(wonRate); // Reset to last known good rate
            return;
        }
        const userStr = user?.name || user?.email || user?.phone || 'User';
        setWonRate(newRate, userStr);
    };

    const handleRefresh = async () => {
        if (!window.confirm("Банкны ханшийг автоматаар татах уу? (Компьютер асаалттай байх ёстой)")) return;
        try {
            const docRef = doc(db, 'settings', 'currency');
            await setDoc(docRef, { refreshTrigger: true }, { merge: true });
            alert("Команд илгээгдлээ! Хэдэн секундын дараа шинэчлэгдэнэ.");
        } catch (e) {
            console.error(e);
            alert("Алдаа гарлаа");
        }
    };

    const handleUpdateData = () => {
        // Open in a small popup window
        const width = 500;
        const height = 600;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        window.open(
            '/admin/sync?autostart=true',
            'CostcoSync',
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
        );
    };
    const handleFacebookConnect = async () => {
        try {
            const isAdminBypass = user?.phone?.includes('23568947') || user?.uid?.includes('23568947');
            if (isAdminBypass) {
                console.log("⚠️ TEST USER DETECTED: Simulating Facebook Link Success");
                const fakeFbUser = {
                    displayName: 'Bilguun Admin',
                    photoURL: 'https://graph.facebook.com/100000000000000/picture', // Dummy or explicit URL
                    providerData: [{ uid: 'facebook:test:23568947' }]
                };

                const newData = {
                    name: fakeFbUser.displayName,
                    photoURL: fakeFbUser.photoURL,
                    fbUid: fakeFbUser.providerData[0]?.uid,
                    isFacebookLinked: true
                };

                if (user?.uid) {
                    const userRef = doc(db, 'users', user.uid);
                    await setDoc(userRef, newData, { merge: true });
                }

                const updatedUser = { ...user, ...newData };
                useAuthStore.getState().login(updatedUser);

                alert('Facebook амжилттай холбогдлоо! (Test Mode)');
                return;
            }

            console.log("🔵 Starting Facebook Link...");
            console.log("🔵 auth.currentUser:", auth.currentUser);
            console.log("🔵 user from store:", user);

            if (!auth.currentUser) {
                console.error("❌ No Firebase auth.currentUser - cannot link Facebook");
                alert('Firebase хэрэглэгч олдсонгүй. Дахин нэвтэрнэ үү.');
                return;
            }

            const provider = new FacebookAuthProvider();
            console.log("🔵 Calling linkWithPopup...");
            const result = await linkWithPopup(auth.currentUser, provider);
            console.log("🔵 linkWithPopup result:", result);

            // Link successful
            const fbUser = result.user;
            const newData = {
                name: fbUser.displayName,
                photoURL: fbUser.photoURL,
                fbUid: fbUser.providerData[0]?.uid
            };

            // Update Firestore
            if (user?.uid) {
                const userRef = doc(db, 'users', user.uid);
                await setDoc(userRef, newData, { merge: true });
            }

            // Update Local State
            const updatedUser = { ...user, ...newData };
            useAuthStore.getState().login(updatedUser);

            // Also update localStorage manual persistence if used in other places
            // (AuthStore persist middleware usually handles this, but we force update)
            alert('Facebook амжилттай холбогдлоо!');

        } catch (error) {
            console.error("Facebook Link Error:", error);
            if (error.code === 'auth/credential-already-in-use') {
                alert('Энэ Facebook хаяг өөр хэрэглэгчтэй холбогдсон байна.');
            } else if (error.code === 'auth/popup-closed-by-user') {
                // Ignore
            } else {
                alert('Facebook холбоход алдаа гарлаа: ' + error.message);
            }
        }
    };

    const handleLogout = () => {
        logout();
        auth.signOut();
        navigate('/profile');
    };







    if (isAuthenticated) {
        return (
            <div className="min-h-screen pb-20">
                <div className="container mx-auto max-w-lg flex flex-col items-center gap-4 mb-6 relative">
                    <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-3xl font-bold border-2 border-white/30 overflow-hidden shadow-sm">
                        {user?.photo ? (
                            <img src={user.photo} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <User size={40} className="text-gray-600" />
                        )}
                    </div>

                    <div className="text-center w-full px-8">
                        {/* Name / Link Edit Section */}
                        <div className="flex flex-col items-center gap-2">


                            <button
                                onClick={handleFacebookConnect}
                                className="mt-2 flex items-center gap-2 px-4 py-2 bg-[#1877F2] hover:bg-[#166fe5] text-white text-sm font-bold rounded-lg transition shadow-sm w-full max-w-sm justify-center"
                            >
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                                Facebook холбох
                            </button>
                        </div>

                        <div className="mt-2 text-gray-500 text-sm">
                            {(user?.phone && !user.isAdmin) ? user.phone.replace('+976', '') : (user?.email || '')}
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="absolute top-4 right-4 w-10 h-10 bg-white/80 hover:bg-white text-gray-700 rounded-full flex items-center justify-center transition shadow-sm backdrop-blur-sm"
                        title="Гарах"
                    >
                        <LogOut size={18} />
                    </button>
                </div>

                {/* Loyalty Tier Card */}
                <div className="container mx-auto max-w-lg px-4">
                    <div className="bg-white shadow-sm border border-gray-100 rounded-2xl p-6 text-gray-900 relative overflow-hidden group">
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
                                <div>
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
                                <div className="text-sm bg-blue-50 text-blue-700 rounded-lg py-2 px-3 inline-flex items-center gap-2 font-medium">
                                    <Crown size={14} />
                                    Та хамгийн өндөр түвшинд байна!
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <SalesSummaryModal
                    isOpen={isSalesModalOpen}
                    onClose={() => setIsSalesModalOpen(false)}
                />

                <AdminBannerModal
                    isOpen={isAdminBannerOpen}
                    onClose={() => setIsAdminBannerOpen(false)}
                />

                <div className="container mx-auto max-w-lg px-4 mt-6 relative z-10">
                    <AdminContentModal
                        isOpen={isContentModalOpen}
                        onClose={() => setIsContentModalOpen(false)}
                    />




                    {user?.isAdmin && (
                        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
                            {/* 1. Өгөгдөл шинэчлэх */}
                            <button
                                onClick={handleUpdateData}
                                className="w-full flex items-center justify-between p-4 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition">
                                        <RefreshCw size={16} />
                                    </div>
                                    <span className="font-medium">Өгөгдөл шинэчлэх</span>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-300" />
                            </button>


                            {/* Full Golomt Rates Display */}
                            {golomtRates && (
                                <div className="px-4 pb-3 -mt-1">
                                    <div className="bg-white border boundary-blue-100 rounded-xl p-3 shadow-sm">
                                        <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide text-center">
                                            <a href="https://www.golomtbank.com/exchange" target="_blank" rel="noopener noreferrer" className="hover:text-sky-600 hover:underline transition-colors flex items-center justify-center gap-1">
                                                Голомт Банк /KRW/
                                                <ExternalLink size={10} />
                                            </a>
                                        </div>

                                        <div className="grid grid-cols-4 gap-1 text-center">
                                            <div className="bg-green-50 border border-green-100 rounded p-1 flex flex-col justify-center">
                                                <div className="text-[9px] text-green-600 leading-tight mb-0.5">Бэлэн Ав</div>
                                                <div className="text-xs font-bold text-green-700">{golomtRates.cashBuy}</div>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-100 rounded p-1 ring-1 ring-blue-200 flex flex-col justify-center">
                                                <div className="text-[9px] text-blue-600 leading-tight mb-0.5">Бэлэн Зар</div>
                                                <div className="text-xs font-bold text-blue-700">{golomtRates.cashSell}</div>
                                            </div>
                                            <div className="bg-green-50 border border-green-100 rounded p-1 flex flex-col justify-center">
                                                <div className="text-[9px] text-green-600 leading-tight mb-0.5">Бэлэн бус авах</div>
                                                <div className="text-xs font-bold text-green-700">{golomtRates.nonCashBuy}</div>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-100 rounded p-1 ring-1 ring-blue-200 flex flex-col justify-center">
                                                <div className="text-[9px] text-blue-600 leading-tight mb-0.5">Бэлэн бус зарах</div>
                                                <div className="text-xs font-bold text-blue-700">{golomtRates.nonCashSell}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TDBM Rates Display */}
                            {tdbRates && (
                                <div className="px-4 pb-3 -mt-3">
                                    <div className="bg-white border boundary-blue-100 rounded-xl p-3 shadow-sm">
                                        <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide text-center">
                                            <a href="https://www.tdbm.mn/mn/exchange-rates" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline transition-colors flex items-center justify-center gap-1">
                                                Худалдаа Хөгжлийн Банк /KRW/
                                                <ExternalLink size={10} />
                                            </a>
                                        </div>

                                        <div className="grid grid-cols-4 gap-1 text-center">
                                            <div className="bg-green-50 border border-green-100 rounded p-1 flex flex-col justify-center">
                                                <div className="text-[9px] text-green-600 leading-tight mb-0.5">Бэлэн Ав</div>
                                                <div className="text-xs font-bold text-green-700">{tdbRates.cashBuy}</div>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-100 rounded p-1 ring-1 ring-blue-200 flex flex-col justify-center">
                                                <div className="text-[9px] text-blue-600 leading-tight mb-0.5">Бэлэн Зар</div>
                                                <div className="text-xs font-bold text-blue-700">{tdbRates.cashSell}</div>
                                            </div>
                                            <div className="bg-green-50 border border-green-100 rounded p-1 flex flex-col justify-center">
                                                <div className="text-[9px] text-green-600 leading-tight mb-0.5">Бэлэн бус авах</div>
                                                <div className="text-xs font-bold text-green-700">{tdbRates.nonCashBuy}</div>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-100 rounded p-1 ring-1 ring-blue-200 flex flex-col justify-center">
                                                <div className="text-[9px] text-blue-600 leading-tight mb-0.5">Бэлэн бус зарах</div>
                                                <div className="text-xs font-bold text-blue-700">{tdbRates.nonCashSell}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Khan Bank Rates Display */}
                            {khanRates && (
                                <div className="px-4 pb-3 -mt-3">
                                    <div className="bg-white border boundary-blue-100 rounded-xl p-3 shadow-sm">
                                        <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide text-center">
                                            <a href="https://www.khanbank.com/personal/exchange-rates/" target="_blank" rel="noopener noreferrer" className="hover:text-green-600 hover:underline transition-colors flex items-center justify-center gap-1">
                                                Хаан Банк /KRW/
                                                <ExternalLink size={10} />
                                            </a>
                                        </div>

                                        <div className="grid grid-cols-4 gap-1 text-center">
                                            <div className="bg-green-50 border border-green-100 rounded p-1 flex flex-col justify-center">
                                                <div className="text-[9px] text-green-600 leading-tight mb-0.5">Бэлэн Ав</div>
                                                <div className="text-xs font-bold text-green-700">{khanRates.cashBuy}</div>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-100 rounded p-1 ring-1 ring-blue-200 flex flex-col justify-center">
                                                <div className="text-[9px] text-blue-600 leading-tight mb-0.5">Бэлэн Зар</div>
                                                <div className="text-xs font-bold text-blue-700">{khanRates.cashSell}</div>
                                            </div>
                                            <div className="bg-green-50 border border-green-100 rounded p-1 flex flex-col justify-center">
                                                <div className="text-[9px] text-green-600 leading-tight mb-0.5">Бэлэн бус авах</div>
                                                <div className="text-xs font-bold text-green-700">{khanRates.nonCashBuy}</div>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-100 rounded p-1 ring-1 ring-blue-200 flex flex-col justify-center">
                                                <div className="text-[9px] text-blue-600 leading-tight mb-0.5">Бэлэн бус зарах</div>
                                                <div className="text-xs font-bold text-blue-700">{khanRates.nonCashSell}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 3. Ханш шинэчлэх */}
                            <div className="flex items-center justify-between p-4 bg-gray-50/30 text-gray-700 transition group border-t border-gray-100">
                                <button
                                    onClick={handleRefresh}
                                    className="flex items-center gap-3 hover:text-blue-600 transition"
                                >
                                    <div className="w-8 h-8 bg-white shadow-sm border border-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition">
                                        <TrendingUp size={16} />
                                    </div>
                                    <span className="font-semibold text-sm">Банкны ханш шалгах</span>
                                </button>


                                <div className="flex items-center bg-gray-100 rounded-lg p-1 group-hover:bg-white border border-transparent group-hover:border-blue-100 transition shadow-inner">
                                    <button onClick={() => adjustRate(-0.01)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition">
                                        <Minus size={14} />
                                    </button>
                                    <div className="h-4 w-px bg-gray-200 mx-1"></div>
                                    <input
                                        type="number"
                                        value={tempRate}
                                        onChange={(e) => setTempRate(e.target.value)}
                                        onBlur={saveRate}
                                        onKeyDown={(e) => e.key === 'Enter' && saveRate()}
                                        className="w-16 bg-transparent text-center font-bold text-gray-700 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-sm"
                                        step="0.01"
                                    />
                                    <div className="h-4 w-px bg-gray-200 mx-1"></div>
                                    <button onClick={() => adjustRate(0.01)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition">
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Divider with gap */}
                            <div className="h-2 bg-gray-50 border-t border-b border-gray-100"></div>

                            {/* 4. Борлуулалтын мэдээ */}
                            <button
                                onClick={() => setIsSalesModalOpen(true)}
                                className="w-full flex items-center justify-between p-4 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition">
                                        <TrendingUp size={16} />
                                    </div>
                                    <span className="font-medium">Борлуулалтын мэдээ</span>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-300" />
                            </button>

                            {/* 5. Захиалга */}
                            <button
                                onClick={() => navigate('/admin/orders')}
                                className="w-full flex items-center justify-between p-4 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition group border-t border-gray-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition">
                                        <Package size={16} />
                                    </div>
                                    <span className="font-medium">Захиалга</span>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-300" />
                            </button>

                            {/* Divider with gap */}
                            <div className="h-2 bg-gray-50 border-t border-b border-gray-100"></div>

                            {/* 6. Барааны жагсаалт */}
                            <button
                                onClick={() => navigate('/admin')}
                                className="w-full flex items-center justify-between p-4 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition">
                                        <ShieldCheck size={16} />
                                    </div>
                                    <span className="font-medium">Барааны жагсаалт</span>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-300" />
                            </button>

                            {/* 7. Бараа нэмэх */}
                            <button
                                onClick={() => navigate('/admin/add-product')}
                                className="w-full flex items-center justify-between p-4 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition group border-t border-gray-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition">
                                        <Plus size={16} />
                                    </div>
                                    <span className="font-medium">Бараа нэмэх</span>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-300" />
                            </button>

                            {/* Divider with gap */}
                            <div className="h-2 bg-gray-50 border-t border-b border-gray-100"></div>

                            {/* 8. Баннер */}
                            <button
                                onClick={() => setIsAdminBannerOpen(true)}
                                className="w-full flex items-center justify-between p-4 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition">
                                        <ImageIcon size={16} />
                                    </div>
                                    <span className="font-medium">Баннер</span>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-300" />
                            </button>

                            {/* 9. Сайтын мэдээлэл (Footer content) */}
                            <button
                                onClick={() => setIsContentModalOpen(true)}
                                className="w-full flex items-center justify-between p-4 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition group border-t border-gray-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition">
                                        <FileText size={16} />
                                    </div>
                                    <span className="font-medium">Сайтын мэдээлэл</span>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-300" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <Suspense fallback={null}>
            <LoginModal
                isOpen={!isAuthenticated}
                onClose={() => navigate('/')}
                onSuccess={() => { }}
            />
        </Suspense>
    );
}
