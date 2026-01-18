
import React, { useState, useEffect } from 'react';
import { X, Phone, Info, FileText, Shield, Trash2, MapPin, Package, HelpCircle, ChevronRight } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

export default function InfoModal({ isOpen, onClose, initialTab = 'help', isEmbedded = false }) {
    const { settings, fetchSettings, isLoading } = useSettingsStore();
    const [activeTab, setActiveTab] = useState(initialTab);
    const [expandedSection, setExpandedSection] = useState(null);

    useEffect(() => {
        if (isOpen || isEmbedded) {
            fetchSettings();
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setActiveTab(initialTab);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setExpandedSection(null);
        }
    }, [isOpen, isEmbedded, initialTab, fetchSettings]);

    if (!isOpen && !isEmbedded) return null;

    const renderContent = () => {
        if (isLoading) {
            return <div className="p-8 text-center text-gray-500">Уншиж байна...</div>;
        }

        switch (activeTab) {
            case 'contact':
                return (
                    <div className="space-y-6">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <h3 className="font-bold text-lg text-blue-900 mb-4 flex items-center gap-2">
                                <Phone className="fill-blue-500 text-white p-1 bg-blue-500 rounded-full w-8 h-8" size={20} />
                                Холбоо барих
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <MapPin className="text-blue-500 mt-1 shrink-0" size={20} />
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase font-bold text-left">Хаяг</p>
                                        <p className="text-gray-800 text-left font-medium">{settings?.address || 'Улаанбаатар хот'}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Phone className="text-blue-500 mt-1 shrink-0" size={20} />
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase font-bold text-left">Утас</p>
                                        <p className="text-gray-800 text-left font-medium">{settings?.phone || '77xxxxxx'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Interactive Google Map could go here later */}
                    </div>
                );

            case 'about':
                return (
                    <div className="space-y-4">
                        <div className="w-full aspect-video bg-gray-100 rounded-xl overflow-hidden mb-4 relative">
                            {/* Placeholder for eventual brand image or use settings image if available */}
                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold text-2xl">
                                Costco Mongolia
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 text-left">Бидний тухай</h2>
                        <div className="text-gray-600 leading-relaxed whitespace-pre-wrap text-sm text-left">
                            {settings?.aboutUs || "Мэдээлэл оруулаагүй байна."}
                        </div>
                    </div>
                );

            case 'help':
            default:
                return (
                    <div className="space-y-2">
                        {/* Shipping Rates */}
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-4">
                            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-left">
                                <Package size={18} className="text-blue-600" />
                                Тээвэрлэлтийн үнэ
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <p className="text-xs text-gray-500 mb-1 text-left">Газар (kg)</p>
                                    <p className="font-bold text-gray-900 text-left">{settings?.transportationRates?.ground?.toLocaleString() || 0}₩</p>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <p className="text-xs text-gray-500 mb-1 text-left">Агаар (kg)</p>
                                    <p className="font-bold text-gray-900 text-left">{settings?.transportationRates?.air?.toLocaleString() || 0}₩</p>
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
                                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                            <item.icon size={16} />
                                        </div>
                                        <span className="font-bold text-gray-700 text-sm">{item.label}</span>
                                    </div>
                                    <ChevronRight
                                        size={16}
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

    // Inner content (reusable for both modal and embedded mode)
    const Content = (
        <div className={`bg-white flex flex-col ${isEmbedded ? 'w-full h-full rounded-2xl' : 'w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh]'} shadow-xl overflow-hidden`}>
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between bg-white shrink-0">
                <div className="flex gap-4 text-sm font-bold">
                    <button
                        onClick={() => setActiveTab('help')}
                        className={`pb-2 border-b-2 transition ${activeTab === 'help' ? 'border-costco-blue text-costco-blue' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                        Тусламж
                    </button>
                    <button
                        onClick={() => setActiveTab('about')}
                        className={`pb-2 border-b-2 transition ${activeTab === 'about' ? 'border-costco-blue text-costco-blue' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                        Бидний тухай
                    </button>
                    <button
                        onClick={() => setActiveTab('contact')}
                        className={`pb-2 border-b-2 transition ${activeTab === 'contact' ? 'border-costco-blue text-costco-blue' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                        Холбоо барих
                    </button>
                </div>
                {!isEmbedded && (
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition -mr-2">
                        <X size={20} className="text-gray-500" />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-white text-left">
                {renderContent()}
            </div>
        </div>
    );

    // If embedded, return just the content (no modal wrapper)
    if (isEmbedded) {
        return Content;
    }

    // Default Modal Behavior
    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            {Content}
        </div>
    );
}
