import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';
import AdminMenuImages from '../components/AdminMenuImages';

export default function AdminMenuImagesPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-4 border-b flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition"
                    >
                        <ArrowLeft size={24} className="text-gray-600" />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <ImageIcon size={24} className="text-costco-blue" />
                        Цэсний Зураг Солих
                    </h1>
                </div>
            </div>

            <div className="flex-1 p-4 max-w-6xl mx-auto w-full">
                <AdminMenuImages />
            </div>
        </div>
    );
}
