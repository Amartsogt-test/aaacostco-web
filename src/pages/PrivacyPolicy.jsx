import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

const PrivacyPolicy = () => {
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
                        <Shield className="text-blue-500" size={24} />
                        Нууцлалын бодлого
                    </h1>
                </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="space-y-6 text-gray-700 leading-relaxed">
                        <div className="whitespace-pre-wrap">
                            <h2 className="text-xl font-bold mb-4">Нууцлалын бодлого (Privacy Policy)</h2>
                            <p className="mb-4">Бид хэрэглэгчдийнхээ хувийн мэдээллийг хамгаалахыг нэн тэргүүнд тавьдаг. Энэхүү нууцлалын бодлого нь таныг манай аппликейшнд нэвтрэх үед ямар мэдээлэл цуглуулж, түүнийгээ хэрхэн ашиглах талаар тайлбарлана.</p>
                            
                            <h3 className="text-lg font-bold mt-6 mb-2">1. Бид ямар мэдээлэл цуглуулдаг вэ?</h3>
                            <p className="mb-4">Та Facebook-ээр дамжуулан манай системд нэвтрэх үед бид таны зөвшөөрсний дагуу зөвхөн нийтэд нээлттэй (public) мэдээллийг хүлээн авдаг. Үүнд:</p>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li>Таны нэр (Full name)</li>
                                <li>Таны цахим шуудангийн хаяг (Email address)</li>
                                <li>Таны профайл зураг (Profile picture)</li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">2. Бид таны мэдээллийг хэрхэн ашиглах вэ?</h3>
                            <p className="mb-4">Цуглуулсан мэдээллийг зөвхөн дараах зорилгоор ашиглана:</p>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li>Таныг системд таних, хэрэглэгчийн бүртгэл үүсгэх.</li>
                                <li>Таны захиалга, худалдан авалтын түүхийг бүртгэх.</li>
                                <li>Танд үйлчилгээтэй холбоотой чухал мэдээлэл, мэдэгдэл илгээх.</li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">3. Мэдээллийг гуравдагч этгээдтэй хуваалцах</h3>
                            <p className="mb-4">Бид таны хувийн мэдээллийг ямар нэгэн гуравдагч этгээдэд худалдахгүй, түрээслэхгүй, хуваалцахгүй болно. Зөвхөн хуулиар шаардсан онцгой тохиолдолд эрх бүхий байгууллагад гаргаж өгч болно.</p>

                            <h3 className="text-lg font-bold mt-6 mb-2">4. Мэдээллээ устгах</h3>
                            <p className="mb-4">Хэрэв та өөрийн мэдээллийг манай системээс бүрмөсөн устгуулахыг хүсвэл манай <strong>Өгөгдөл устгах (Data Deletion)</strong> хуудсаар зочилж заавартай танилцана уу.</p>
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

export default PrivacyPolicy;

