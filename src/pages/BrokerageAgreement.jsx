import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ScrollText } from 'lucide-react';

/**
 * Зуучлалын гэрээний нөхцөл — consolidated-express загварын гол баримт.
 * Захиалга бүрд хэрэглэгч энэ нөхцөлийг зөвшөөрснөөр (сагсны checkbox)
 * хэрэглэгч=барааны эзэн, компани=худалдан авах, тээвэрлэх зуучлагч гэдэг
 * харилцаа баталгаажна. Зөвшөөрөл нь захиалга дээр brokerageConsent /
 * brokerageConsentAt талбараар бүртгэгдэнэ.
 */
const BrokerageAgreement = () => {
    const navigate = useNavigate();

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
                        <ScrollText className="text-blue-600" size={24} />
                        Зуучлалын гэрээний нөхцөл
                    </h1>
                </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="space-y-6 text-gray-700 leading-relaxed">
                        <div className="whitespace-pre-wrap">
                            <h2 className="text-xl font-bold mb-2">ХУДАЛДАН АВАЛТ, ТЭЭВРИЙН ЗУУЧЛАЛЫН ГЭРЭЭ</h2>
                            <p className="mb-6 text-sm text-gray-500">
                                Захиалга өгөх бүрд та энэхүү нөхцөлийг хүлээн зөвшөөрснөөр гэрээ
                                цахим хэлбэрээр байгуулагдсанд тооцно.
                            </p>

                            <h3 className="text-lg font-bold mt-6 mb-2">1. Талууд</h3>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li><b>Зуучлагч:</b> Costco.mn — цаашид «Зуучлагч» гэх.</li>
                                <li><b>Захиалагч:</b> Захиалгад нэр, регистрийн дугаар, хаягаа бүртгүүлсэн хэрэглэгч — цаашид «Захиалагч» гэх.</li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">2. Гэрээний зорилго</h3>
                            <p className="mb-6">
                                Захиалагч нь Бүгд Найрамдах Солонгос Улсаас хувийн хэрэглээнийхээ
                                барааг худалдан авах хүсэлтээ Зуучлагчид илгээх ба Зуучлагч нь
                                Захиалагчийн нэрийн өмнөөс, Захиалагчийн зардлаар тухайн барааг
                                худалдан авч, Монгол Улс руу тээвэрлэн, Захиалагчид хүргэх
                                зуучлалын үйлчилгээ үзүүлнэ.
                            </p>

                            <h3 className="text-lg font-bold mt-6 mb-2">3. Барааны өмчлөл</h3>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li>Худалдан авсан бараа худалдан авсан агшнаас эхлэн <b>Захиалагчийн өмч</b> болно.</li>
                                <li>Зуучлагч нь барааны эзэмшигч биш бөгөөд зөвхөн худалдан авах болон тээвэрлэх үйлчилгээ үзүүлэгч болно.</li>
                                <li>Зуучлагч барааг өөрийн нэр дээр худалдаж аваад дараа нь Захиалагчид дахин зарахгүй.</li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">4. Төлбөр</h3>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li>Захиалагч барааны үнийг урьдчилан төлнө (бараа Захиалагчийн зардлаар худалдагдана).</li>
                                <li>Захиалагч тээвэр болон зуучлалын үйлчилгээний хөлсийг төлнө.</li>
                                <li>Хэрэв илгээмж гаалийн чөлөөлөх босгоос хэтэрч татвар ногдвол уг татварыг Захиалагч хариуцна.</li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">5. Гаалийн бүрдүүлэлт</h3>
                            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
                                <li>Бараа Захиалагчийн нэр, регистрийн дугаар дээр гаалийн бүрдүүлэлт хийгдэнэ.</li>
                                <li>Захиалагч гаалийн бүрдүүлэлтэд шаардлагатай үнэн зөв мэдээллийг өгөх үүрэгтэй.</li>
                                <li>
                                    Нэг илгээмжийн нийт үнэ 3,000,000₮-өөс доош, ижил төрлийн бараа
                                    2-оос илүүгүй байх нөхцөлд илгээмж гаалийн татвараас чөлөөлөгдөнө.
                                    Их хэмжээний захиалгыг систем автоматаар хэд хэдэн илгээмж болгон
                                    хувааж болно.
                                </li>
                            </ul>

                            <h3 className="text-lg font-bold mt-6 mb-2">6. Гэрээ байгуулагдах хэлбэр</h3>
                            <p className="mb-4">
                                Захиалга өгөх үед «Зуучлалын гэрээний нөхцөлийг хүлээн зөвшөөрч
                                байна» сонголтыг идэвхжүүлснээр энэхүү гэрээ цахим хэлбэрээр
                                байгуулагдаж, зөвшөөрлийн огноо, цаг захиалгын бүртгэлд хадгалагдана.
                            </p>
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

export default BrokerageAgreement;
