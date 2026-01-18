import { X, Save, FileText, Phone, Info, Shield, Trash2, MapPin, Image as ImageIcon, Globe, Package } from 'lucide-react';
import React, { useState, useEffect, Suspense } from 'react';
const AdminScraperSettings = React.lazy(() => import('./AdminScraperSettings'));
const BannerManager = React.lazy(() => import('./BannerManager'));
const AdminMenuImages = React.lazy(() => import('./AdminMenuImages'));
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';

export default function AdminSettingsContent({ isOpen, onClose, isEmbedded = false }) {
    const { settings, fetchSettings, updateSettings, isLoading } = useSettingsStore();
    const { showToast } = useUIStore();

    // Local state for form fields
    const [formData, setFormData] = useState({
        terms: '',
        privacy: '',
        dataDeletion: '',
        aboutUs: '',
        address: '',
        phone: '',
        transportationRates: { ground: 0, air: 0 }
    });

    const [activeTab, setActiveTab] = useState('contact'); // 'contact', 'terms', 'privacy', 'deletion', 'about'
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen || isEmbedded) {
            fetchSettings();
        }
    }, [isOpen, isEmbedded]);

    useEffect(() => {
        if (settings) {
            setFormData({
                terms: settings.terms || '',
                privacy: settings.privacy || '',
                dataDeletion: settings.dataDeletion || '',
                aboutUs: settings.aboutUs || '',
                address: settings.address || '',
                phone: settings.phone || '',
                // Map legacy 'transportation' or new 'transportationRates'
                transportationRates: settings.transportationRates || settings.transportation || { ground: 0, air: 0 }
            });
        }
    }, [settings]);

    if (!isOpen && !isEmbedded) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSettings(formData);
            showToast('Мэдээлэл амжилттай хадгалагдлаа', 'success');
            if (!isEmbedded && onClose) onClose();
        } catch {
            showToast('Хадгалахад алдаа гарлаа', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const tabs = [
        { id: 'contact', label: 'Холбоо барих', icon: Phone },
        { id: 'about', label: 'Бидний тухай', icon: Info },
        { id: 'terms', label: 'Үйлчилгээний нөхцөл', icon: FileText },
        { id: 'privacy', label: 'Нууцлал', icon: Shield },
        { id: 'deletion', label: 'Өгөгдөл устгах', icon: Trash2 },
        { id: 'transportation', label: 'Тээвэр', icon: Package },
        { id: 'banner', label: 'Баннер удирдах', icon: ImageIcon },
        { id: 'menuImages', label: 'Цэсний зураг', icon: ImageIcon },
        { id: 'scraper', label: 'Scraper', icon: Globe },
    ];

    // Inner content
    const Content = (
        <div className={`bg-white flex flex-col overflow-hidden ${isEmbedded ? 'w-full h-full shadow-none border-0 md:border md:border-gray-200 rounded-none md:rounded-xl' : 'w-full h-full md:h-auto md:max-w-4xl md:max-h-[90vh] shadow-none md:shadow-2xl rounded-none md:rounded-2xl'}`}>
            {/* Header - Only show if not embedded (modal mode) */}
            {!isEmbedded && (
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50 shrink-0">
                    <h2 className="text-xl font-bold text-gray-800">Сайтын мэдээлэл засах</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>
            )}

            {/* Body */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                {/* Sidebar Tabs */}
                <div className="w-full md:w-64 bg-gray-50 border-b md:border-b-0 md:border-r flex flex-row md:flex-col p-2 gap-1 overflow-x-auto md:overflow-y-auto shrink-0 no-scrollbar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-xl text-sm font-bold transition whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-white text-costco-blue shadow-sm'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                }`}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 p-4 md:p-6 overflow-y-auto bg-white">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-full">Уншиж байна...</div>
                    ) : (
                        <div className="h-full flex flex-col gap-4">
                            {activeTab === 'contact' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Хаяг</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                            <input
                                                type="text"
                                                value={formData.address}
                                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                                                className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none"
                                                placeholder="Улаанбаатар хот..."
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Утас</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                            <input
                                                type="text"
                                                value={formData.phone}
                                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                                className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none"
                                                placeholder="7711-xxxx"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'about' && (
                                <div className="h-full flex flex-col">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Бидний тухай (HTML/Text)</label>
                                    <textarea
                                        value={formData.aboutUs}
                                        onChange={e => setFormData({ ...formData, aboutUs: e.target.value })}
                                        className="flex-1 w-full p-4 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none font-mono text-sm resize-none"
                                        placeholder="HTML эсвэл Текст оруулна уу..."
                                    />
                                </div>
                            )}

                            {activeTab === 'terms' && (
                                <div className="h-full flex flex-col">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Үйлчилгээний нөхцөл (HTML/Text)</label>
                                    <textarea
                                        value={formData.terms}
                                        onChange={e => setFormData({ ...formData, terms: e.target.value })}
                                        className="flex-1 w-full p-4 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none font-mono text-sm resize-none"
                                        placeholder="Нийтлэг нөхцөлүүд..."
                                    />
                                </div>
                            )}

                            {activeTab === 'privacy' && (
                                <div className="h-full flex flex-col">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Нууцлалын бодлого (HTML/Text)</label>
                                    <textarea
                                        value={formData.privacy}
                                        onChange={e => setFormData({ ...formData, privacy: e.target.value })}
                                        className="flex-1 w-full p-4 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none font-mono text-sm resize-none"
                                        placeholder="Хувийн мэдээлэл..."
                                    />
                                </div>
                            )}

                            {activeTab === 'deletion' && (
                                <div className="h-full flex flex-col">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Өгөгдөл устгах заавар (HTML/Text)</label>
                                    <textarea
                                        value={formData.dataDeletion}
                                        onChange={e => setFormData({ ...formData, dataDeletion: e.target.value })}
                                        className="flex-1 w-full p-4 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none font-mono text-sm resize-none"
                                        placeholder="Хэрэглэгч бүртгэлээ хэрхэн устгах вэ..."
                                    />
                                </div>
                            )}



                            {activeTab === 'scraper' && (
                                <Suspense fallback={<div>Уншиж байна...</div>}>
                                    <AdminScraperSettings />
                                </Suspense>
                            )}

                            {activeTab === 'banner' && (
                                <Suspense fallback={<div>Уншиж байна...</div>}>
                                    <BannerManager isEmbedded={true} />
                                </Suspense>
                            )}

                            {activeTab === 'menuImages' && (
                                <Suspense fallback={<div>Уншиж байна...</div>}>
                                    <AdminMenuImages isEmbedded={true} />
                                </Suspense>
                            )}

                            {activeTab === 'transportation' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Газар (₩/kg)
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500 sm:text-sm">₩</span>
                                            </div>
                                            <input
                                                type="number"
                                                value={formData.transportationRates.ground}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    transportationRates: { ...formData.transportationRates, ground: Number(e.target.value) }
                                                })}
                                                className="pl-7 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 border"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Агаар (₩/kg)
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500 sm:text-sm">₩</span>
                                            </div>
                                            <input
                                                type="number"
                                                value={formData.transportationRates.air}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    transportationRates: { ...formData.transportationRates, air: Number(e.target.value) }
                                                })}
                                                className="pl-7 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 border"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>


            {/* Footer Actions */}
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 shrink-0">
                {!isEmbedded && (
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition"
                    >
                        Хаах
                    </button>
                )}
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2 bg-costco-blue hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                    <Save size={18} />
                    {isSaving ? 'Хадгалж байна...' : 'Хадгалах'}
                </button>
            </div>
        </div>
    );

    // If embedded, return just the content
    if (isEmbedded) {
        return Content;
    }

    // Default Modal Behavior
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm">
            {Content}
        </div >
    );
}

