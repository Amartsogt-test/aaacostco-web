import { LogOut, ShieldCheck, ChevronRight } from 'lucide-react';
import buildInfo from '../buildInfo.json';
import { useNavigate } from 'react-router-dom';
import React, { useEffect, Suspense } from 'react';
import { useAuthStore } from '../store/authStore';
import { auth } from '../firebase'; // Keep auth for signOut if needed, or move to store
import { useSettingsStore } from '../store/settingsStore';

const LoyaltyCard = React.lazy(() => import('../components/LoyaltyCard'));


export default function Profile() {
    const navigate = useNavigate();
    const { logout, user, isAuthenticated, refreshUserSpend, syncUser } = useAuthStore();
    const { settings, fetchSettings } = useSettingsStore();

    // Initial Load
    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        if (user?.uid) {
            syncUser(user.uid);
        }
        if (user?.phone) {
            refreshUserSpend(user.phone);
        }
    }, [user?.uid, user?.phone, refreshUserSpend, syncUser]);

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
        }
    }, [isAuthenticated, navigate]);

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
                {/* Profile Icon Removed */}

                <div className="text-center w-full px-8">
                    {/* Name / Link Edit Section */}
                    <div className="flex flex-col items-center gap-2">
                        {/* Facebook Connect Button Removed */}
                    </div>
                </div>

                <button
                    onClick={handleLogout}
                    className="absolute top-4 right-4 w-10 h-10 bg-white/80 hover:bg-white text-gray-700 rounded-full flex items-center justify-center transition shadow-sm backdrop-blur-sm hidden" // Hidden or Removed
                    title="Гарах"
                >
                    <LogOut size={18} />
                </button>


            </div>
        </div>

            {/* Loyalty Tier Card */ }
            <div className="container mx-auto max-w-lg px-0 md:px-4" >
                <Suspense fallback={<div className="h-32 bg-gray-50 animate-pulse rounded-2xl" />}>
                    <LoyaltyCard user={user} onLogout={handleLogout} />
                </Suspense>
            </div >


            <div className="container mx-auto max-w-lg px-4 mt-6 relative z-10">

                {/* Admin Portal Link (Restricted to specific admin phone) */}
                {(() => {
                    // Primary: Check isAdmin flag from state
                    if (user?.isAdmin === true) return true;
                    // Fallback: Check phone number
                    const adminPhone = import.meta.env.VITE_ADMIN_PHONE || '00880088';
                    const userPhone = (user?.phone || '').replace(/\D/g, ''); // Remove all non-digits
                    const normalizedUserPhone = userPhone.startsWith('976') ? userPhone.slice(3) : userPhone;
                    return normalizedUserPhone === adminPhone;
                })() && (
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

                {/* Footer Info Section (Moved outside max-w-lg to allow full width) */}
            </div>

            <div className="bg-white border-t border-gray-100 mt-8 pt-10 pb-24">
                <div className="container mx-auto px-8 max-w-6xl">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-8 text-base">
                        {/* Тусламж */}
                        <div className="flex flex-col text-left">
                            <h3 className="font-bold text-gray-900 mb-4 text-lg flex items-start gap-2">
                                <div className="w-1.5 h-5 bg-costco-blue rounded-full shrink-0"></div>
                                Тусламж
                            </h3>
                            <ul className="space-y-3 ml-4">
                                <li>
                                    <button onClick={() => navigate('/terms')} className="text-gray-600 hover:text-costco-blue transition font-semibold text-left">
                                        Үйлчилгээний нөхцөл
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => navigate('/privacy')} className="text-gray-600 hover:text-costco-blue transition font-semibold text-left">
                                        Нууцлалын бодлого
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => navigate('/delete-data')} className="text-gray-600 hover:text-costco-blue transition font-semibold text-left">
                                        Өгөгдөл устгах
                                    </button>
                                </li>
                            </ul>
                        </div>

                        {/* Бидний тухай */}
                        <div className="flex flex-col text-left">
                            <h3 className="font-bold text-gray-900 mb-4 text-lg flex items-start gap-2">
                                <div className="w-1.5 h-5 bg-costco-blue rounded-full shrink-0"></div>
                                <span className="leading-tight">Бидний тухай</span>
                            </h3>
                            <ul className="space-y-3 ml-4">
                                <li>
                                    <button onClick={() => navigate('/about')} className="text-gray-600 hover:text-costco-blue transition font-semibold text-left">
                                        Costco танилцуулга
                                    </button>
                                </li>
                            </ul>
                        </div>

                        {/* Холбоо барих */}
                        <div className="flex flex-col text-left">
                            <h3 className="font-bold text-gray-900 mb-4 text-lg flex items-start gap-2">
                                <div className="w-1.5 h-5 bg-costco-blue rounded-full shrink-0"></div>
                                <span className="leading-tight">Холбоо барих</span>
                            </h3>
                            <div className="space-y-4 ml-4 font-semibold text-base">
                                <div className="flex flex-col gap-1 text-gray-600">
                                    <span className="text-gray-400 text-sm">Хаяг:</span>
                                    <span className="leading-tight">{settings?.address || 'Улаанбаатар хот'}</span>
                                </div>
                                <div className="flex flex-col gap-1 text-gray-600">
                                    <span className="text-gray-400 text-sm">Утас:</span>
                                    <span>{settings?.phone || '77xxxxxx'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

    {/* Build Info */ }
    <div className="text-center pb-8 opacity-30 text-xs font-mono">
        ver: {buildInfo.buildTime}
    </div>
        </div >
    );
}
