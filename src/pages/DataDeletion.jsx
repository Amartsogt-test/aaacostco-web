import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

const DataDeletion = () => {
    const navigate = useNavigate();
    const { settings, fetchSettings } = useSettingsStore();

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
                        <Trash2 className="text-red-500" size={24} />
                        Өгөгдөл устгах заавар
                    </h1>
                </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="space-y-6 text-gray-700 leading-relaxed">
                        {settings?.dataDeletion ? (
                            <div className="whitespace-pre-wrap">{settings.dataDeletion}</div>
                        ) : (
                        <div className="whitespace-pre-wrap">
                            <h2 className="text-xl font-bold mb-4">Хэрэглэгчийн өгөгдөл устгах заавар (Data Deletion Instructions)</h2>
                            <p className="mb-4">Хэрэв та манай системээс өөрийн утасны дугаар болон бүртгэлтэй холбоотой хувийн мэдээллээ бүрмөсөн устгуулахыг хүсвэл дараах сувгуудаар хүсэлт илгээнэ үү:</p>
                            <ol className="list-decimal list-inside space-y-2 mb-6 ml-4">
                                <li>Вэбсайт болон аппликейшний баруун доод буланд байрлах <strong>Тусламжийн чат</strong>-аар «Бүртгэл устгуулах» хүсэлт бичих.</li>
                                <li>Эсвэл бүртгэлтэй утасны дугаараасаа <strong>admin@costco.mn</strong> цахим шуудан руу хүсэлт илгээх.</li>
                                <li>Хэрэв Facebook хаягаар холбосон бол Facebook-ийн <strong>Settings &amp; Privacy &gt; Apps and Websites</strong> хэсгээс <strong>Costco Mongolia</strong> аппликейшнийг <strong>Remove</strong> хийх.</li>
                            </ol>
                            <p className="mb-4">Бид таны хүсэлтийг хүлээн авснаас хойш ажлын 48 цагийн дотор таны хувийн мэдээллийг системээс устгаж баталгаажуулна.</p>
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

