import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Phone, Info, Shield, Trash2, MapPin } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';

export default function AdminContentModal({ isOpen, onClose }) {
    const { settings, fetchSettings, updateSettings, isLoading } = useSettingsStore();
    const { showToast } = useUIStore();

    // Local state for form fields
    const [formData, setFormData] = useState({
        terms: '',
        privacy: '',
        dataDeletion: '',
        aboutUs: '',
        address: '',
        phone: ''
    });

    const [activeTab, setActiveTab] = useState('contact'); // 'contact', 'terms', 'privacy', 'deletion', 'about'
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchSettings();
        }
    }, [isOpen]);

    useEffect(() => {
        if (settings) {
            setFormData({
                terms: settings.terms || '',
                privacy: settings.privacy || '',
                dataDeletion: settings.dataDeletion || '',
                aboutUs: settings.aboutUs || '',
                address: settings.address || '',
                phone: settings.phone || ''
            });
        }
    }, [settings]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSettings(formData);
            showToast('Мэдээлэл амжилттай хадгалагдлаа', 'success');
            onClose();
        } catch (error) {
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
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800">Сайтын мэдээлэл засах</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-64 bg-gray-50 border-r flex flex-col p-2 gap-1 overflow-y-auto">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition text-left ${activeTab === tab.id
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
                    <div className="flex-1 p-6 overflow-y-auto bg-white">
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
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition"
                    >
                        Хаах
                    </button>
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
        </div>
    );
}
