import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

const TermsOfService = () => {
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
                        <FileText className="text-blue-600" size={24} />
                        Үйлчилгээний нөхцөл
                    </h1>
                </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="space-y-6 text-gray-700 leading-relaxed">
                        <div className="whitespace-pre-wrap">
                            <h2 className="text-xl font-bold mb-4">Үйлчилгээний нөхцөл (Terms of Service)</h2>
                            <p className="mb-4">Энэхүү үйлчилгээний нөхцөл нь манай вэбсайт болон аппликейшнийг ашиглах үеийн дүрэм журмыг зохицуулна.</p>
                            
                            <h3 className="text-lg font-bold mt-6 mb-2">1. Ерөнхий нөхцөл</h3>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li>Хэрэглэгч нь манай үйлчилгээг ашиглахдаа өөрийн мэдээллийн үнэн зөв байдлыг бүрэн хариуцна.</li>
                                <li>Бид таны мэдээллийг зөвхөн үйлчилгээ үзүүлэх зорилгоор, нууцлалын бодлогын дагуу ашиглана.</li>
                                <li>Системийн хэвийн үйл ажиллагаанд санаатайгаар саад учруулах, бусдын эрхэнд халдахыг хатуу хориглоно.</li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">2. Бүртгэл болон Аюулгүй байдал</h3>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li>Хэрэглэгч өөрийн бүртгэлийн (Facebook логин) аюулгүй байдлыг хангах үүрэгтэй.</li>
                                <li>Бусдын нэрээр хуурамч хаяг нээх, эсвэл бусдын хаягийг зөвшөөрөлгүй ашиглахыг хориглоно.</li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">3. Нөхцөлд өөрчлөлт оруулах</h3>
                            <p className="mb-4">Бид шаардлагатай тохиолдолд үйлчилгээний нөхцөлдөө өөрчлөлт оруулах эрхтэй бөгөөд өөрчлөлт орсон тохиолдолд системээр дамжуулан хэрэглэгчдэд мэдэгдэх болно.</p>
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

export default TermsOfService;

