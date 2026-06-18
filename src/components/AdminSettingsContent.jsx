import { X, Save, FileText, Phone, Info, Shield, Trash2, MapPin, Image as ImageIcon, Globe, Package, Mail, MessageCircle, Crown } from 'lucide-react';
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
        chatReminder: '',
        transportationRates: { ground: 0, air: 0 },
        membershipBenefits: { silver: '', gold: '', platinum: '' },
        discountRates: { silver: 0, gold: 0, platinum: 0 },
        launchSale: { active: true, percent: 5, endsAt: '' }
    });

    const [activeTab, setActiveTab] = useState('contact'); // 'contact', 'terms', 'privacy', 'deletion', 'about'
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen || isEmbedded) {
            fetchSettings();
        }
    }, [isOpen, isEmbedded, fetchSettings]);

    useEffect(() => {
        if (settings) {
            setFormData({
                terms: settings.terms || '',
                privacy: settings.privacy || '',
                dataDeletion: settings.dataDeletion || '',
                aboutUs: settings.aboutUs || '',
                address: settings.address || '',
                phone: settings.phone || '',
                email: settings.email || 'admin@costco.mn',
                messengerLink: settings.messengerLink || '',
                // Map legacy 'transportation' or new 'transportationRates'
                transportationRates: settings.transportationRates || settings.transportation || { ground: 0, air: 0 },
                membershipBenefits: settings.membershipBenefits || { silver: '', gold: '', platinum: '' },
                discountRates: settings.discountRates || { silver: 0, gold: 0, platinum: 0 },
                launchSale: {
                    active: settings.launchSale?.active !== false, // default ON
                    percent: settings.launchSale?.percent ?? 5,
                    endsAt: settings.launchSale?.endsAt || ''
                }
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
        { id: 'membership', label: 'Гишүүнчлэл', icon: Crown },
        { id: 'chatReminder', label: 'Чат Санамж', icon: MessageCircle },
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
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">И-мэйл</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                            <input
                                                type="text"
                                                value={formData.email}
                                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none"
                                                placeholder="admin@costco.mn"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Facebook Messenger холбоос</label>
                                        <div className="relative">
                                            <MessageCircle className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                            <input
                                                type="text"
                                                value={formData.messengerLink}
                                                onChange={e => setFormData({ ...formData, messengerLink: e.target.value })}
                                                className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none"
                                                placeholder="https://m.me/таны-page"
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">Facebook хуудасныхаа m.me холбоосыг оруулна уу (ж: https://m.me/costco.mn). Чат цонхонд "Messenger-ээр холбогдох" товч гарч ирнэ. Хоосон бол товч харагдахгүй.</p>
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

                            {activeTab === 'chatReminder' && (
                                <div className="h-full flex flex-col">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Чат дээрх санамж (Text)</label>
                                    <textarea
                                        value={formData.chatReminder}
                                        onChange={e => setFormData({ ...formData, chatReminder: e.target.value })}
                                        className="flex-1 w-full p-4 border rounded-xl focus:ring-2 focus:ring-costco-blue/20 outline-none font-sans text-sm resize-none whitespace-pre-wrap"
                                        placeholder="Санамж..."
                                    />
                                    <p className="text-xs text-gray-500 mt-2">Энэ санамж нь хэрэглэгч чат нээх үед автоматаар харагдана. Шинэ мөрнүүд шууд харагдана.</p>
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

                            {activeTab === 'membership' && (
                                <div className="space-y-4 h-full flex flex-col">
                                    <p className="text-sm text-gray-500 font-medium">Гишүүнчлэлийн давуу талуудыг энд оруулна уу. Энэ нь хэрэглэгчийн "Таны ангилал" хэсгийн "Гишүүнчлэлийн давуу тал" цэсэнд харагдах болно.</p>

                                    <div className="flex flex-col flex-1 gap-2 border p-4 rounded-xl bg-gray-50/50">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="block text-sm font-bold text-gray-700">Silver гишүүн</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={formData.discountRates.silver}
                                                    onChange={e => setFormData({ ...formData, discountRates: { ...formData.discountRates, silver: Number(e.target.value) } })}
                                                    className="w-16 px-2 py-1 text-sm border rounded text-right focus:ring-2 focus:ring-costco-blue/20 outline-none"
                                                />
                                                <span className="text-xs font-bold text-gray-600">% хямдрал</span>
                                            </div>
                                        </div>
                                        <textarea
                                            value={formData.membershipBenefits.silver}
                                            onChange={e => setFormData({
                                                ...formData,
                                                membershipBenefits: { ...formData.membershipBenefits, silver: e.target.value }
                                            })}
                                            className="w-full h-20 p-3 border rounded-lg focus:ring-2 focus:ring-costco-blue/20 outline-none text-sm resize-none"
                                            placeholder="Ж: Бүртгүүлсэн бүх хэрэглэгч. Таны худалдан авалт 10,000,000₩ хүртэл."
                                        />
                                    </div>

                                    <div className="flex flex-col flex-1 gap-2 border p-4 rounded-xl bg-gray-50/50">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="block text-sm font-bold text-gray-700">Gold гишүүн</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={formData.discountRates.gold}
                                                    onChange={e => setFormData({ ...formData, discountRates: { ...formData.discountRates, gold: Number(e.target.value) } })}
                                                    className="w-16 px-2 py-1 text-sm border rounded text-right focus:ring-2 focus:ring-costco-blue/20 outline-none"
                                                />
                                                <span className="text-xs font-bold text-gray-600">% хямдрал</span>
                                            </div>
                                        </div>
                                        <textarea
                                            value={formData.membershipBenefits.gold}
                                            onChange={e => setFormData({
                                                ...formData,
                                                membershipBenefits: { ...formData.membershipBenefits, gold: e.target.value }
                                            })}
                                            className="w-full h-20 p-3 border rounded-lg focus:ring-2 focus:ring-costco-blue/20 outline-none text-sm resize-none"
                                            placeholder="Ж: Нийт худалдан авалт 10,000,000₩ давсан хэрэглэгч. 2% хөнгөлөлттэй."
                                        />
                                    </div>

                                    <div className="flex flex-col flex-1 gap-2 border p-4 rounded-xl bg-gray-50/50">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="block text-sm font-bold text-gray-700">Platinum гишүүн</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={formData.discountRates.platinum}
                                                    onChange={e => setFormData({ ...formData, discountRates: { ...formData.discountRates, platinum: Number(e.target.value) } })}
                                                    className="w-16 px-2 py-1 text-sm border rounded text-right focus:ring-2 focus:ring-costco-blue/20 outline-none"
                                                />
                                                <span className="text-xs font-bold text-gray-600">% хямдрал</span>
                                            </div>
                                        </div>
                                        <textarea
                                            value={formData.membershipBenefits.platinum}
                                            onChange={e => setFormData({
                                                ...formData,
                                                membershipBenefits: { ...formData.membershipBenefits, platinum: e.target.value }
                                            })}
                                            className="w-full h-20 p-3 border rounded-lg focus:ring-2 focus:ring-costco-blue/20 outline-none text-sm resize-none"
                                            placeholder="Ж: Нийт худалдан авалт 20,000,000₩ давсан хэрэглэгч. 5% хөнгөлөлттэй."
                                        />
                                    </div>

                                {/* 🎉 Нээлтийн хямдрал (бонус оноо) */}
                                <div className="mt-6 border-2 border-red-200 p-4 rounded-xl bg-red-50/50 space-y-4">
                                    <h4 className="text-sm font-bold text-red-700">🎉 Нээлтийн хямдрал (бонус оноо)</h4>
                                    <p className="text-xs text-gray-500">Үнийг шууд хасахгүй. Худалдан авалт баталгаажихад барааны дүнгийн доорх хувийг лояалти бонус оноо болгож хэрэглэгчийн дансанд (воноор) олгоно.</p>

                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-1">
                                            <input
                                                type="checkbox"
                                                checked={formData.launchSale.active}
                                                onChange={e => setFormData({ ...formData, launchSale: { ...formData.launchSale, active: e.target.checked } })}
                                                className="w-4 h-4 accent-red-600"
                                            />
                                            Нээлтийн бонус идэвхтэй (бүх хэрэглэгчид)
                                        </label>
                                        <div className="flex items-center gap-2 ml-6">
                                            <input
                                                type="number"
                                                value={formData.launchSale.percent}
                                                onChange={e => setFormData({ ...formData, launchSale: { ...formData.launchSale, percent: Number(e.target.value) } })}
                                                className="w-20 px-2 py-1 text-sm border rounded text-right focus:ring-2 focus:ring-costco-blue/20 outline-none"
                                            />
                                            <span className="text-xs font-bold text-gray-600">% бонус оноо</span>
                                        </div>
                                    </div>

                                    {/* Дуусах огноо (хоосон бол байнгын) */}
                                    <div className="border-t border-red-100 pt-3">
                                        <label className="block text-xs font-bold text-gray-600 mb-1">Дуусах огноо (хоосон = байнгын)</label>
                                        <input
                                            type="date"
                                            value={formData.launchSale.endsAt}
                                            onChange={e => setFormData({ ...formData, launchSale: { ...formData.launchSale, endsAt: e.target.value } })}
                                            className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-costco-blue/20 outline-none"
                                        />
                                    </div>
                                </div>
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
                                            Газар (₮/kg)
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500 sm:text-sm">₮</span>
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
                                            Агаар (₮/kg)
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500 sm:text-sm">₮</span>
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

