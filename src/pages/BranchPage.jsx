import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, MapPin, Navigation, Check } from 'lucide-react';

const BRANCHES = [
    {
        id: 1,
        name: "Costco - Хан-Уул",
        address: "Хан-Уул дүүрэг, 15-р хороо, Зайсангийн гудамж",
        coordinates: { lat: 47.88, lng: 106.91 }
    },
    {
        id: 2,
        name: "Costco - Баянзүрх",
        address: "Баянзүрх дүүрэг, 5-р хороо, Дарь Эхийн өргөн чөлөө",
        coordinates: { lat: 47.93, lng: 106.95 }
    },
    {
        id: 3,
        name: "Costco - Сүхбаатар",
        address: "Сүхбаатар дүүрэг, 1-р хороо, Энхтайваны өргөн чөлөө",
        coordinates: { lat: 47.92, lng: 106.92 }
    }
];

export default function BranchPage() {
    const navigate = useNavigate();
    const [selectedBranch, setSelectedBranch] = useState(null);

    const handleSelect = () => {
        if (selectedBranch) {
            // Store selection and navigate back
            localStorage.setItem('selectedBranch', JSON.stringify(selectedBranch));
            navigate(-1);
        }
    };

    const openInMaps = (branch) => {
        const url = `https://www.google.com/maps/search/?api=1&query=${branch.coordinates.lat},${branch.coordinates.lng}`;
        window.open(url, '_blank');
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <MapPin size={24} className="text-costco-blue" />
                            Салбар сонгох
                        </h1>
                        <p className="text-sm text-gray-500">Ойр байрлах салбарыг сонгоно уу</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                <div className="space-y-3">
                    {BRANCHES.map((branch) => (
                        <div
                            key={branch.id}
                            onClick={() => setSelectedBranch(branch)}
                            className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all ${selectedBranch?.id === branch.id
                                    ? 'border-costco-blue shadow-lg shadow-blue-100'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${selectedBranch?.id === branch.id
                                        ? 'bg-costco-blue text-white'
                                        : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    {selectedBranch?.id === branch.id ? <Check size={24} /> : <MapPin size={24} />}
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-900 text-lg">{branch.name}</h3>
                                    <p className="text-gray-500 text-sm mt-1">{branch.address}</p>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openInMaps(branch);
                                        }}
                                        className="mt-3 text-costco-blue text-sm font-bold flex items-center gap-1 hover:underline"
                                    >
                                        <Navigation size={14} />
                                        Газрын зураг дээр харах
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Confirm Button */}
                <div className="mt-6">
                    <button
                        onClick={handleSelect}
                        disabled={!selectedBranch}
                        className={`w-full py-4 rounded-xl font-bold text-lg transition ${selectedBranch
                                ? 'bg-costco-blue text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        {selectedBranch ? `${selectedBranch.name} сонгох` : 'Салбар сонгоно уу'}
                    </button>
                </div>
            </div>
        </div>
    );
}
