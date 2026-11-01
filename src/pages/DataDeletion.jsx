import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';
import { userApi, setToken } from '../services/apiClient';

const DataDeletion = () => {
    const navigate = useNavigate();
    const { settings, fetchSettings } = useSettingsStore();
    const { isAuthenticated, user, logout } = useAuthStore();
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleInstantDelete = async () => {
        if (!window.confirm('Та өөрийн бүртгэл болон хувийн мэдээллээ системээс бүрмөсөн устгахдаа итгэлтэй байна уу? (Are you sure you want to permanently delete your account?)')) {
            return;
        }
        setDeleting(true);
        try {
            await userApi.deleteAccount();
        } catch {
            // Proceed with local cleanup even if session expired
        }
        useCartStore.getState().clearCart();
        useCartStore.getState().resetCheckoutState();
        useChatStore.getState().cleanup();
        setToken('');
        logout();
        useUIStore.getState().showToast('Таны бүртгэл болон хувийн мэдээлэл системээс бүрмөсөн устгагдлаа.', 'success');
        setDeleting(false);
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition text-gray-600"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Trash2 className="text-red-500" size={24} />
                        Өгөгдөл ба бүртгэл устгах (Account &amp; Data Deletion)
                    </h1>
                </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    {isAuthenticated && (
                        <div className="mb-8 p-5 bg-red-50/70 border border-red-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-base font-bold text-red-900">
                                    Бүртгэлээ шууд устгах (Delete My Account Now)
                                </h3>
                                <p className="text-sm text-red-700 mt-1">
                                    Одоо нэвтэрсэн бүртгэл ({user?.phone || user?.name || 'Хэрэглэгч'}) болон хадгалсан мэдээллийг системээс тэр даруй устгах.
                                </p>
                            </div>
                            <button
                                onClick={handleInstantDelete}
                                disabled={deleting}
                                className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shrink-0 transition"
                            >
                                <Trash2 size={18} />
                                {deleting ? 'Устгаж байна...' : 'Бүртгэл устгах (Delete Account)'}
                            </button>
                        </div>
                    )}

                    <div className="space-y-6 text-gray-700 leading-relaxed">
                        {settings?.dataDeletion ? (
                            <div className="whitespace-pre-wrap">{settings.dataDeletion}</div>
                        ) : (
                        <div className="whitespace-pre-wrap">
                            <h2 className="text-xl font-bold mb-4">Хэрэглэгчийн өгөгдөл устгах заавар (Data Deletion Instructions)</h2>
                            <p className="mb-4">Хэрэв та манай системээс өөрийн утасны дугаар болон бүртгэлтэй холбоотой хувийн мэдээллээ бүрмөсөн устгуулахыг хүсвэл дараах аргуудаар устгах боломжтой:</p>
                            <ol className="list-decimal list-inside space-y-2 mb-6 ml-4">
                                <li>Аппликейшн дотор <strong>Профайл (Profile) &gt; Бүртгэл устгах (Delete Account)</strong> товчийг дарж өөрийн бүртгэлийг шууд устгах.</li>
                                <li>Вэбсайт болон аппликейшний баруун доод буланд байрлах <strong>Тусламжийн чат</strong>-аар «Бүртгэл устгуулах» хүсэлт бичих.</li>
                                <li>Эсвэл бүртгэлтэй утасны дугаараасаа <strong>contact@tegbe.com</strong> цахим шуудан руу хүсэлт илгээх.</li>
                            </ol>
                            <p className="mb-4">Апп доторх «Бүртгэл устгах» товчийг дармагц таны бүртгэл тэр даруй устах бөгөөд имэйл/чатаар ирүүлсэн хүсэлтийг ажлын 48 цагийн дотор системээс устгаж баталгаажуулна.</p>
                        </div>
                        )}
                    </div>

                    <div className="mt-12 pt-8 border-t border-gray-100 text-sm text-gray-500">
                        Сүүлд шинэчлэгдсэн: {new Date().toLocaleDateString()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataDeletion;
