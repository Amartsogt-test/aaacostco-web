import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

const TermsOfService = () => {
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
                        <FileText className="text-blue-600" size={24} />
                        Үйлчилгээний нөхцөл
                    </h1>
                </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="space-y-6 text-gray-700 leading-relaxed">
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <div className="w-10 h-10 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : settings?.terms ? (
                            <div className="whitespace-pre-wrap">{settings.terms}</div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                                <p>Одоогоор мэдээлэл оруулаагүй байна.</p>
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

export default TermsOfService;

