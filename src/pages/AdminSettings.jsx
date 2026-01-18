import { ArrowLeft } from 'lucide-react';
import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';

const AdminSettingsContent = React.lazy(() => import('../components/AdminSettingsContent'));

export default function AdminSettings() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-4 py-3 md:py-4 sticky top-0 z-30">
                <div className="container mx-auto max-w-6xl">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/admin')}
                            className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition"
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <h1 className="text-xl font-bold text-gray-900">
                            Сайтын мэдээлэл
                        </h1>
                    </div>
                </div>
            </div>

            <div className="container mx-auto max-w-6xl p-0 md:p-4 h-[calc(100vh-70px)] md:h-auto">
                <div className="h-full md:h-[calc(100vh-140px)]">
                    <Suspense fallback={<div className="flex justify-center items-center h-full">Уншиж байна...</div>}>
                        <AdminSettingsContent isEmbedded={true} />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
