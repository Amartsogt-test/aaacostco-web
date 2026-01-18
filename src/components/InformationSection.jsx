import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, FileText, Shield, Trash2, Info, ChevronRight } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

export default function InformationSection() {
    const navigate = useNavigate();
    const { settings, fetchSettings } = useSettingsStore();

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const legalLinks = [
        { id: 'about', label: 'Бидний тухай', icon: Info, path: '/about', color: 'text-blue-600', bg: 'bg-blue-50' },
        { id: 'terms', label: 'Үйлчилгээний нөхцөл', icon: FileText, path: '/terms', color: 'text-blue-600', bg: 'bg-blue-50' },
        { id: 'privacy', label: 'Нууцлалын бодлого', icon: Shield, path: '/privacy', color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 'deletion', label: 'Өгөгдөл устгах', icon: Trash2, path: '/delete-data', color: 'text-red-500', bg: 'bg-red-50' }
    ];

    return (
        <div className="mt-12 mb-8 space-y-6">
            <h3 className="text-xl font-bold text-gray-900 px-1 flex items-center gap-2">
                <Info size={24} className="text-costco-blue" />
                Мэдээлэл
            </h3>

            {/* Shipping Rates Card */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Package size={18} className="text-costco-blue" />
                    Тээвэрлэлтийн үнэ
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1 font-medium">Газар (kg)</p>
                        <p className="font-bold text-gray-900 text-xl">
                            {settings?.transportationRates?.ground?.toLocaleString() || 0}₩
                        </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1 font-medium">Агаар (kg)</p>
                        <p className="font-bold text-gray-900 text-xl">
                            {settings?.transportationRates?.air?.toLocaleString() || 0}₩
                        </p>
                    </div>
                </div>
            </div>

            {/* Legal Links Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {legalLinks.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => navigate(item.path)}
                        className="flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition rounded-2xl border border-gray-100 shadow-sm group"
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${item.bg} ${item.color} flex items-center justify-center`}>
                                <item.icon size={22} />
                            </div>
                            <span className="font-bold text-gray-700">{item.label}</span>
                        </div>
                        <ChevronRight
                            size={20}
                            className="text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all"
                        />
                    </button>
                ))}
            </div>

            <div className="text-center pt-4">
                <p className="text-xs text-gray-400">© {new Date().getFullYear()} Costco Mongolia. All rights reserved.</p>
            </div>
        </div>
    );
}
