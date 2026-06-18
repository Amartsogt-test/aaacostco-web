import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

const DataDeletion = () => {
    const navigate = useNavigate();
    const { fetchSettings } = useSettingsStore();

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
                        <div className="whitespace-pre-wrap">
                            <h2 className="text-xl font-bold mb-4">Facebook хэрэглэгчийн өгөгдөл устгах заавар (Data Deletion Instructions)</h2>
                            <p className="mb-4">Хэрэв та манай системээс өөрийн Facebook бүртгэлтэй холбоотой мэдээллээ устгахыг хүсвэл доорх зааврын дагуу хийнэ үү:</p>
                            <ol className="list-decimal list-inside space-y-2 mb-6 ml-4">
                                <li>Өөрийн Facebook хаяг руу нэвтэрч орно.</li>
                                <li>Баруун дээд буланд байрлах цэснээс <strong>Settings & Privacy</strong> &gt; <strong>Settings</strong> руу орно.</li>
                                <li>Зүүн талын цэснээс <strong>Apps and Websites</strong> хэсгийг сонгоно.</li>
                                <li>Жагсаалтаас манай <strong>Costco Mongolia</strong> аппликейшнийг олно.</li>
                                <li><strong>Remove</strong> (Устгах) товчийг дарна.</li>
                            </ol>
                            <p className="mb-4">Ингэснээр таны Facebook аккаунт болон манай системийн хоорондох холбоос тасрах бөгөөд бид таны мэдээлэл рүү дахин хандах боломжгүй болно.</p>
                            <p>Нэмэлт тусламж хэрэгтэй бол манай Facebook хуудсаар холбогдоно уу.</p>
                        </div>
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

