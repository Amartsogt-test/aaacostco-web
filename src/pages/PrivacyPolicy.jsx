import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

const PrivacyPolicy = () => {
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
                        <Shield className="text-blue-500" size={24} />
                        Нууцлалын бодлого
                    </h1>
                </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="space-y-6 text-gray-700 leading-relaxed">
                        {settings?.privacy ? (
                            <div className="whitespace-pre-wrap">{settings.privacy}</div>
                        ) : (
                        <div className="whitespace-pre-wrap">
                            <h2 className="text-xl font-bold mb-4">Нууцлалын бодлого (Privacy Policy)</h2>
                            <p className="mb-4">Бид хэрэглэгчдийнхээ хувийн мэдээллийг хамгаалахыг нэн тэргүүнд тавьдаг. Энэхүү нууцлалын бодлого нь таныг манай вэбсайт болон аппликейшнд нэвтрэх, захиалга өгөх үед ямар мэдээлэл цуглуулж, түүнийгээ хэрхэн ашиглах талаар тайлбарлана.</p>
                            
                            <h3 className="text-lg font-bold mt-6 mb-2">1. Бид ямар мэдээлэл цуглуулдаг вэ?</h3>
                            <p className="mb-4">Та утасны дугаар (SMS баталгаажуулалт) эсвэл сошиал хаягаар дамжуулан манай системд нэвтрэх болон захиалга өгөх үед дараах мэдээллийг хүлээн авдаг. Үүнд:</p>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li>Таны овог, нэр болон утасны дугаар</li>
                                <li>Хүргэлтийн хаяг болон гаалийн бүрдүүлэлтэд шаардлагатай регистрийн дугаар</li>
                                <li>Таны цахим шуудангийн хаяг (хэрэв бүртгүүлсэн бол)</li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">2. Бид таны мэдээллийг хэрхэн ашиглах вэ?</h3>
                            <p className="mb-4">Цуглуулсан мэдээллийг зөвхөн дараах зорилгоор ашиглана:</p>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li>Таныг системд таних, хэрэглэгчийн бүртгэл болон урамшууллын оноог тооцох.</li>
                                <li>Таны захиалга, худалдан авалт болон гаалийн мэдүүлгийг бүрдүүлэх, хүргэлт хийх.</li>
                                <li>Танд захиалгын явцтай холбоотой чухал мэдээлэл, мэдэгдэл илгээх.</li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">3. Мэдээллийг гуравдагч этгээдтэй хуваалцах</h3>
                            <p className="mb-4">Бид таны хувийн мэдээллийг ямар нэгэн гуравдагч этгээдэд худалдахгүй, түрээслэхгүй. Зөвхөн олон улсын карго тээвэр, гаалийн бүрдүүлэлт болон хуулиар шаардсан тохиолдолд эрх бүхий байгууллагад дамжуулна.</p>

                            <h3 className="text-lg font-bold mt-6 mb-2">4. Мэдээллээ устгах</h3>
                            <p className="mb-4">Хэрэв та өөрийн мэдээллийг манай системээс бүрмөсөн устгуулахыг хүсвэл манай <strong>Өгөгдөл устгах (Data Deletion)</strong> хуудсаар зочилж заавартай танилцана уу.</p>
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

export default PrivacyPolicy;

