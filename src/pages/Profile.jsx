import { LogOut, ShieldCheck, ChevronRight } from 'lucide-react';
import buildInfo from '../buildInfo.json';
import { useNavigate } from 'react-router-dom';
import React, { useEffect, Suspense } from 'react';
import { useAuthStore } from '../store/authStore';
import { auth } from '../firebase'; // Keep auth for signOut if needed, or move to store
import { useSettingsStore } from '../store/settingsStore';
import { useCartStore } from '../store/cartStore';
import { useChatStore } from '../store/chatStore';
import { useProductStore } from '../store/productStore';
import AdminPortal from './AdminPortal';

const LoyaltyCard = React.lazy(() => import('../components/LoyaltyCard'));
// Lazy: AddressManager pulls in Leaflet (~155kB). It sits below the fold, so we
// defer its chunk until after the profile's main content paints.
const AddressManager = React.lazy(() => import('../components/AddressManager'));


export default function Profile() {
    const navigate = useNavigate();
    const { logout, user, isAuthenticated, refreshUserSpend, syncUser } = useAuthStore();
    const { settings, fetchSettings } = useSettingsStore();
    const wonRate = useProductStore(state => state.wonRate);

    // Initial Load
    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        if (user?.uid) {
            syncUser(user.uid);
        }
        if (user?.uid || user?.phone) {
            // Attribute loyalty spend by account uid (works for Facebook users) + phone.
            // wonRate lets calculateUserSpend normalise MNT orders to won.
            refreshUserSpend(user?.uid, user?.phone, wonRate);
        }
    }, [user?.uid, user?.phone, wonRate, refreshUserSpend, syncUser]);

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
        }
    }, [isAuthenticated, navigate]);

    const handleLogout = async () => {
        // Clear per-user state so nothing leaks to the next user on a shared device.
        useCartStore.getState().clearCart();
        useCartStore.getState().resetCheckoutState();
        useChatStore.getState().cleanup(); // tear down the chat subscription + messages
        logout();
        try {
            await auth.signOut();
        } catch (err) {
            // A network hiccup on signOut shouldn't trap the user in the app —
            // the local session is already cleared above.
            console.error('signOut failed:', err);
        }
        navigate('/login');
    };




    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="min-h-screen pb-20">
            <div className="container mx-auto max-w-lg flex flex-col items-center gap-4 mb-6 relative mt-6">
                
                {/* Profile Picture & Name */}
                <div className="flex flex-col items-center gap-3 w-full px-8">
                    {user?.photoURL ? (
                        <img 
                            src={user.photoURL} 
                            alt="Profile" 
                            className="w-24 h-24 rounded-full border-4 border-white shadow-md object-cover"
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-full bg-costco-blue/10 flex items-center justify-center text-costco-blue shadow-md border-4 border-white">
                            <span className="text-3xl font-bold">
                                {user?.name ? user.name.charAt(0).toUpperCase() : String(user?.phone || '').replace('+976', '').substring(0,2) || 'Х'}
                            </span>
                        </div>
                    )}
                    
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-gray-900">
                            {user?.name || user?.phone || 'Хэрэглэгч'}
                        </h2>
                        {user?.isFacebookLinked && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md mt-1">
                                Facebook-ээр нэвтэрсэн
                            </span>
                        )}
                        {!user?.isFacebookLinked && user?.phone && (
                            <p className="text-gray-500 text-sm">{user.phone}</p>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleLogout}
                    className="absolute top-0 right-4 w-10 h-10 bg-white/80 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-full flex items-center justify-center transition shadow-sm backdrop-blur-sm"
                    title="Гарах"
                    aria-label="Гарах"
                >
                    <LogOut size={18} />
                </button>
            </div>

            {/* Admin Portal Embedded (Restricted to admins) */}
            {user?.isAdmin && (
                <div className="container mx-auto max-w-lg mb-6">
                    <AdminPortal embedded={true} />
                </div>
            )}

            {!user?.isAdmin && (
                <>
                    {/* Loyalty Tier Card */}
                    <div className="container mx-auto max-w-lg px-0 md:px-4" >
                        <Suspense fallback={<div className="h-32 bg-gray-50 animate-pulse rounded-2xl" />}>
                            <LoyaltyCard user={user} onLogout={handleLogout} />
                        </Suspense>
                    </div >

                    {/* Address Manager */}
                    <div className="container mx-auto max-w-lg px-4 mt-6 mb-6">
                        <Suspense fallback={<div className="h-40 bg-gray-50 animate-pulse rounded-2xl" />}>
                            <AddressManager />
                        </Suspense>
                    </div>
                </>
            )}


            <div className="container mx-auto max-w-lg px-4 mt-6 relative z-10">
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

            {/* Build Info */}
            <div className="text-center pb-8 text-gray-400 text-sm font-medium">
                Update хийгдсэн: {buildInfo.buildTime}
            </div>
        </div >
    );
}
