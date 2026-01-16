import { ExternalLink, RefreshCw, LogOut, User, ChevronRight, CheckCircle, ShieldCheck, Plus, Minus, TrendingUp, Crown, Package, Image as ImageIcon, FileText, Scan, HelpCircle, Info, Phone } from 'lucide-react';
import buildInfo from '../buildInfo.json';
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, Suspense } from 'react';
import { useAuthStore } from '../store/authStore';
import { auth, db } from '../firebase';
import { FacebookAuthProvider, linkWithPopup } from 'firebase/auth';
import { useSettingsStore } from '../store/settingsStore';

import { doc, setDoc } from 'firebase/firestore';
const InfoModal = React.lazy(() => import('../components/InfoModal'));
const LoyaltyCard = React.lazy(() => import('../components/LoyaltyCard'));


export default function Profile() {
    const navigate = useNavigate();
    const { logout, user, isAuthenticated, refreshUserSpend } = useAuthStore();
    const { settings, fetchSettings } = useSettingsStore();
    // const [showOnboarding, setShowOnboarding] = useState(false); // Unused
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [infoModalTab, setInfoModalTab] = useState('help');

    const openInfo = (tab) => {
        setInfoModalTab(tab);
        setIsInfoModalOpen(true);
    };

    // Initial Load
    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        if (user?.phone) {
            refreshUserSpend(user.phone);
        }
    }, [user?.phone, refreshUserSpend]);

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
        }
    }, [isAuthenticated, navigate]);

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




    if (!isAuthenticated) {
        return null;
    }

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
            </div >

            {/* Loyalty Tier Card */}
            <div className="container mx-auto max-w-lg px-4" >
                <Suspense fallback={<div className="h-32 bg-gray-50 animate-pulse rounded-2xl" />}>
                    <LoyaltyCard user={user} />
                </Suspense>
            </div >


            <div className="container mx-auto max-w-lg px-4 mt-6 relative z-10">






                <InfoModal
                    isOpen={isInfoModalOpen}
                    onClose={() => setIsInfoModalOpen(false)}
                    initialTab={infoModalTab}
                />

                {/* Admin Portal Link (Admins Only) */}
                {user?.isAdmin && (
                    <div className="container mx-auto max-w-lg px-4 mb-6">
                        <button
                            onClick={() => navigate('/admin')}
                            className="w-full bg-costco-blue rounded-2xl shadow-sm p-5 flex items-center justify-between group hover:bg-blue-700 transition-all text-white"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                                    <ShieldCheck size={24} />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold">Админ Портал</h3>
                                    <p className="text-blue-100 text-xs text-opacity-70">Системийн удирдлагын хэсэг</p>
                                </div>
                            </div>
                            <ChevronRight size={20} className="text-blue-200 group-hover:text-white transition-colors" />
                        </button>
                    </div>
                )}

                {/* Footer Info Section (User Request - Vertical) */}
                <div className="bg-white border-t border-gray-100 mt-8 pt-8 pb-16">
                    <div className="container mx-auto px-4">
                        <div className="flex flex-col gap-10 text-base">
                            <div>
                                <h3 className="font-bold text-gray-900 mb-5 text-lg flex items-center gap-2">
                                    <div className="w-1.5 h-5 bg-costco-blue rounded-full"></div>
                                    Тусламж
                                </h3>
                                <ul className="space-y-5 ml-4">
                                    <li>
                                        <button onClick={() => openInfo('help')} className="text-gray-600 hover:text-costco-blue flex items-center gap-2 transition font-semibold">
                                            Үйлчилгээний нөхцөл
                                        </button>
                                    </li>
                                    <li>
                                        <button onClick={() => openInfo('help')} className="text-gray-600 hover:text-costco-blue flex items-center gap-2 transition font-semibold">
                                            Нууцлалын бодлого
                                        </button>
                                    </li>
                                    <li>
                                        <button onClick={() => openInfo('help')} className="text-gray-600 hover:text-costco-blue flex items-center gap-2 transition font-semibold">
                                            Өгөгдөл устгах
                                        </button>
                                    </li>
                                </ul>
                            </div>

                            <div>
                                <h3 className="font-bold text-gray-900 mb-5 text-lg flex items-center gap-2">
                                    <div className="w-1.5 h-5 bg-costco-blue rounded-full"></div>
                                    Бидний тухай
                                </h3>
                                <ul className="space-y-5 ml-4">
                                    <li>
                                        <button onClick={() => openInfo('about')} className="text-gray-600 hover:text-costco-blue flex items-center gap-2 transition font-semibold">
                                            Costco танилцуулга
                                        </button>
                                    </li>
                                </ul>
                            </div>

                            <div>
                                <h3 className="font-bold text-gray-900 mb-5 text-lg flex items-center gap-2">
                                    <div className="w-1.5 h-5 bg-costco-blue rounded-full"></div>
                                    Холбоо барих
                                </h3>
                                <div className="space-y-4 ml-4">
                                    <div className="flex items-start gap-2 text-gray-600 font-semibold">
                                        <span className="shrink-0 text-gray-400">Хаяг:</span>
                                        <span>{settings?.address || 'Улаанбаатар хот'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600 font-semibold">
                                        <span className="shrink-0 text-gray-400">Утас:</span>
                                        <span>{settings?.phone || '77xxxxxx'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Build Info */}
            <div className="text-center pb-8 opacity-30 text-xs font-mono">
                ver: {buildInfo.buildTime}
            </div>
        </div>
    );
}
