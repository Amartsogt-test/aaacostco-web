import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

const AboutUs = () => {
    const navigate = useNavigate();
    const { settings, fetchSettings, isLoading } = useSettingsStore();

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

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
                        <Info className="text-costco-blue" size={24} />
                        Бидний тухай
                    </h1>
                </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="mb-8 p-6 bg-blue-50 rounded-xl border border-blue-100">
                        <h2 className="text-2xl font-bold text-blue-900 mb-2">Costco Mongolia</h2>
                        <p className="text-blue-700">Таны итгэлт түнш</p>
                    </div>

                    <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <div className="w-10 h-10 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : settings?.aboutUs ? (
                            <div className="whitespace-pre-wrap">{settings.aboutUs}</div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                                <p>Одоогоор мэдээлэл оруулаагүй байна.</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-12 pt-8 border-t border-gray-100 text-sm text-gray-500 flex justify-between items-center">
                        <span>© {new Date().getFullYear()} Costco Mongolia</span>
                        <span>Сүүлд шинэчлэгдсэн: {new Date().toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AboutUs;

