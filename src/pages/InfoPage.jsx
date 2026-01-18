import { useNavigate, useSearchParams } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Phone, FileText, Shield, Trash2, MapPin, Package, ChevronRight } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

export default function InfoPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') || 'help';

    const { settings, fetchSettings, isLoading } = useSettingsStore();
    const [activeTab, setActiveTab] = useState(initialTab);
    const [expandedSection, setExpandedSection] = useState(null);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex justify-center py-12">
                    <div className="w-10 h-10 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div>
                </div>
            );
        }

        switch (activeTab) {
            case 'contact':
                return (
                    <div className="space-y-6">
                        <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                            <h3 className="font-bold text-lg text-blue-900 mb-4 flex items-center gap-2">
                                <Phone className="fill-blue-500 text-white p-1 bg-blue-500 rounded-full w-8 h-8" size={20} />
                                Холбоо барих
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <MapPin className="text-blue-500 mt-1 shrink-0" size={20} />
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase font-bold">Хаяг</p>
                                        <p className="text-gray-800 font-medium">{settings?.address || 'Улаанбаатар хот'}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Phone className="text-blue-500 mt-1 shrink-0" size={20} />
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase font-bold">Утас</p>
                                        <p className="text-gray-800 font-medium">{settings?.phone || '77xxxxxx'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'about':
                return (
                    <div className="space-y-4">
                        <div className="w-full aspect-video bg-gray-100 rounded-xl overflow-hidden relative">
                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold text-2xl">
                                Costco Mongolia
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">Бидний тухай</h2>
                        <div className="text-gray-600 leading-relaxed whitespace-pre-wrap">
                            {settings?.aboutUs || "Мэдээлэл оруулаагүй байна."}
                        </div>
                    </div>
                );

            case 'help':
            default:
                return (
                    <div className="space-y-4">
                        {/* Shipping Rates */}
                        <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Package size={18} className="text-blue-600" />
                                Тээвэрлэлтийн үнэ
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-lg border border-gray-200">
                                    <p className="text-xs text-gray-500 mb-1">Газар (kg)</p>
                                    <p className="font-bold text-gray-900 text-xl">{settings?.transportationRates?.ground?.toLocaleString() || 0}₩</p>
                                </div>
                                <div className="bg-white p-4 rounded-lg border border-gray-200">
                                    <p className="text-xs text-gray-500 mb-1">Агаар (kg)</p>
                                    <p className="font-bold text-gray-900 text-xl">{settings?.transportationRates?.air?.toLocaleString() || 0}₩</p>
                                </div>
                            </div>
                        </div>

                        {/* Expandable Legal Sections */}
                        {[
                            { id: 'terms', label: 'Үйлчилгээний нөхцөл', icon: FileText, content: settings?.terms },
                            { id: 'privacy', label: 'Нууцлалын бодлого', icon: Shield, content: settings?.privacy },
                            { id: 'deletion', label: 'Өгөгдөл устгах', icon: Trash2, content: settings?.dataDeletion }
                        ].map((item) => (
                            <div key={item.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                                <button
                                    onClick={() => setExpandedSection(expandedSection === item.id ? null : item.id)}
                                    className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                            <item.icon size={18} />
                                        </div>
                                        <span className="font-bold text-gray-700">{item.label}</span>
                                    </div>
                                    <ChevronRight
                                        size={18}
                                        className={`text-gray-400 transition-transform ${expandedSection === item.id ? 'rotate-90' : ''}`}
                                    />
                                </button>
                                {expandedSection === item.id && (
                                    <div className="p-4 bg-gray-50 border-t border-gray-100 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                                        {item.content || "Мэдээлэл оруулаагүй байна."}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">Мэдээлэл</h1>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b sticky top-[64px] z-10">
                <div className="max-w-2xl mx-auto px-4">
                    <div className="flex gap-6 text-sm font-bold">
                        <button
                            onClick={() => setActiveTab('help')}
                            className={`py-3 border-b-2 transition ${activeTab === 'help' ? 'border-costco-blue text-costco-blue' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                        >
                            Тусламж
                        </button>
                        <button
                            onClick={() => setActiveTab('about')}
                            className={`py-3 border-b-2 transition ${activeTab === 'about' ? 'border-costco-blue text-costco-blue' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                        >
                            Бидний тухай
                        </button>
                        <button
                            onClick={() => setActiveTab('contact')}
                            className={`py-3 border-b-2 transition ${activeTab === 'contact' ? 'border-costco-blue text-costco-blue' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                        >
                            Холбоо барих
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                {renderContent()}
            </div>
        </div>
    );
}
