import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileText, Phone, Info, Shield, Trash2, MapPin, Image as ImageIcon, Globe, Package } from 'lucide-react';
import React, { useState, useEffect, Suspense } from 'react';
const AdminMenuImages = React.lazy(() => import('../components/AdminMenuImages'));
const AdminScraperSettings = React.lazy(() => import('../components/AdminScraperSettings'));
const BannerManager = React.lazy(() => import('../components/BannerManager'));
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';

export default function AdminContent() {
    const navigate = useNavigate();
    const { settings, fetchSettings, updateSettings, isLoading } = useSettingsStore();
    const { showToast } = useUIStore();

    const [formData, setFormData] = useState({
        terms: '',
        privacy: '',
        dataDeletion: '',
        aboutUs: '',
        address: '',
        phone: '',
        transportationRates: { ground: 0, air: 0 }
    });

    const [activeTab, setActiveTab] = useState('contact');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        if (settings) {
            setFormData({
                terms: settings.terms || '',
                privacy: settings.privacy || '',
                dataDeletion: settings.dataDeletion || '',
                aboutUs: settings.aboutUs || '',
                address: settings.address || '',
                phone: settings.phone || '',
                transportationRates: settings.transportationRates || settings.transportation || { ground: 0, air: 0 }
            });
        }
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSettings(formData);
            showToast('Мэдээлэл амжилттай хадгалагдлаа', 'success');
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
        { id: 'images', label: 'Цэсний зураг', icon: ImageIcon },
        { id: 'banner', label: 'Баннер', icon: ImageIcon },
        { id: 'transportation', label: 'Тээвэр', icon: Package },
        { id: 'scraper', label: 'Scraper', icon: Globe },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate('/admin')}
                        className="p-2 hover:bg-gray-100 rounded-full transition"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-gray-900">Сайтын мэдээлэл</h1>
                        <p className="text-sm text-gray-500">Контент удирдлага</p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-costco-blue text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Save size={18} />
                        {isSaving ? 'Хадгалж байна...' : 'Хадгалах'}
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="max-w-6xl mx-auto">
                <div className="flex min-h-[calc(100vh-80px)]">
                    {/* Sidebar Tabs */}
                    <div className="w-64 bg-white border-r p-4 space-y-1">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition text-left ${activeTab === tab.id
                                    ? 'bg-costco-blue/10 text-costco-blue'
                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                    }`}
                            >
                                <tab.icon size={18} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-6 bg-gray-50">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-full">
                                <div className="w-10 h-10 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-sm border p-6 min-h-[500px]">
                                {activeTab === 'contact' && (
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-lg mb-4">Холбоо барих мэдээлэл</h3>
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
                                        <h3 className="font-bold text-lg mb-4">Бидний тухай</h3>
                                        <textarea
                                            value={formData.aboutUs}
                                            onChange={e => setFormData({ ...formData, aboutUs: e.target.value })}
                                            className="flex-1 w-full p-4 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none font-mono text-sm resize-none min-h-[400px]"
                                            placeholder="HTML эсвэл Текст оруулна уу..."
                                        />
                                    </div>
                                )}

                                {activeTab === 'terms' && (
                                    <div className="h-full flex flex-col">
                                        <h3 className="font-bold text-lg mb-4">Үйлчилгээний нөхцөл</h3>
                                        <textarea
                                            value={formData.terms}
                                            onChange={e => setFormData({ ...formData, terms: e.target.value })}
                                            className="flex-1 w-full p-4 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none font-mono text-sm resize-none min-h-[400px]"
                                            placeholder="Нийтлэг нөхцөлүүд..."
                                        />
                                    </div>
                                )}

                                {activeTab === 'privacy' && (
                                    <div className="h-full flex flex-col">
                                        <h3 className="font-bold text-lg mb-4">Нууцлалын бодлого</h3>
                                        <textarea
                                            value={formData.privacy}
                                            onChange={e => setFormData({ ...formData, privacy: e.target.value })}
                                            className="flex-1 w-full p-4 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none font-mono text-sm resize-none min-h-[400px]"
                                            placeholder="Хувийн мэдээлэл..."
                                        />
                                    </div>
                                )}

                                {activeTab === 'deletion' && (
                                    <div className="h-full flex flex-col">
                                        <h3 className="font-bold text-lg mb-4">Өгөгдөл устгах заавар</h3>
                                        <textarea
                                            value={formData.dataDeletion}
                                            onChange={e => setFormData({ ...formData, dataDeletion: e.target.value })}
                                            className="flex-1 w-full p-4 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none font-mono text-sm resize-none min-h-[400px]"
                                            placeholder="Хэрэглэгч бүртгэлээ хэрхэн устгах вэ..."
                                        />
                                    </div>
                                )}

                                {activeTab === 'images' && (
                                    <Suspense fallback={<div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div></div>}>
                                        <AdminMenuImages isEmbedded={true} />
                                    </Suspense>
                                )}

                                {activeTab === 'banner' && (
                                    <Suspense fallback={<div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div></div>}>
                                        <BannerManager isEmbedded={true} />
                                    </Suspense>
                                )}

                                {activeTab === 'scraper' && (
                                    <Suspense fallback={<div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div></div>}>
                                        <AdminScraperSettings />
                                    </Suspense>
                                )}

                                {activeTab === 'transportation' && (
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-lg mb-4">Тээвэрлэлтийн үнэ</h3>
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
                                                        className="pl-7 block w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 border"
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
                                                        className="pl-7 block w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 border"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
