import { X, MapPin, Navigation, Locate } from 'lucide-react';
import { useState } from 'react';

const BRANCHES = [
    {
        id: 1,
        name: "Costco - Хан-Уул",
        address: "Хан-Уул дүүрэг, 19-р хороолол, Чингисийн өргөн чөлөө",
        coordinates: { lat: 47.91, lng: 106.90 }
    },
    {
        id: 2,
        name: "Costco - Баянзүрх",
        address: "Баянзүрх дүүрэг, 26-р хороо, Их Монгол Улсын гудамж",
        coordinates: { lat: 47.93, lng: 106.95 }
    },
    {
        id: 3,
        name: "Costco - Сүхбаатар",
        address: "Сүхбаатар дүүрэг, 1-р хороо, Энхтайваны өргөн чөлөө",
        coordinates: { lat: 47.92, lng: 106.92 }
    }
];

export default function BranchModal({ isOpen, onClose, onSelect, isEmbedded = false }) {
    const [selectedId, setSelectedId] = useState(null);

    if (!isOpen && !isEmbedded) return null;

    const handleSelect = () => {
        if (selectedId) {
            const branch = BRANCHES.find(b => b.id === selectedId);
            onSelect(branch);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[600px] overflow-hidden animate-scale-in flex flex-col">
                {/* Header */}
                {/* Header */}
                <div className="bg-white px-6 py-4 border-b flex items-center justify-between shrink-0">
                    <div className="flex-1 max-w-sm flex items-center gap-3">
                        <div className="h-10 shrink-0">
                            <img
                                src="/cu-post.png"
                                alt="CU Post"
                                className="h-full w-auto object-contain rounded-md"
                            />
                        </div>
                        <input
                            type="text"
                            placeholder="Салбарын дугаар оруулах"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-costco-blue focus:border-costco-blue outline-none text-sm"
                        />
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition ml-4">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Map Area (Mock) */}
                    <div className="w-full bg-gray-100 relative">
                        {/* Placeholder for actual Google Map */}
                        <div className="absolute inset-0 flex items-center justify-center bg-[#E5E5E5] bg-opacity-50">
                            <img
                                src="https://static-maps.yandex.ru/1.x/?ll=106.917,47.918&z=13&l=map&size=650,450"
                                alt="Ulaanbaatar Map"
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center pointer-events-none">
                                    <div className="bg-white p-4 rounded-full shadow-lg mb-4 inline-block animate-bounce">
                                        <MapPin size={48} className="text-red-500" fill="currentColor" />
                                    </div>
                                    <p className="text-gray-500 font-medium bg-white/80 px-4 py-1 rounded-full backdrop-blur-sm">Google Map Loading...</p>
                                </div>
                            </div>

                            {/* Mock Pins - Interactive */}
                            <button
                                onClick={() => setSelectedId(1)}
                                className={`absolute top-1/4 left-1/4 transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition group z-10 focus:outline-none`}
                            >
                                <div className={`relative ${selectedId === 1 ? 'scale-125' : ''}`}>
                                    <MapPin size={48} className={`${selectedId === 1 ? 'text-red-600' : 'text-costco-blue'} drop-shadow-xl`} fill="currentColor" />
                                    {selectedId === 1 && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-black/20 blur-sm rounded-full"></div>}
                                </div>
                                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white px-3 py-1 rounded-lg text-xs font-bold shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                    Хан-Уул
                                </span>
                            </button>

                            <button
                                onClick={() => setSelectedId(2)}
                                className={`absolute top-1/2 right-1/3 transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition group z-10 focus:outline-none`}
                            >
                                <div className={`relative ${selectedId === 2 ? 'scale-125' : ''}`}>
                                    <MapPin size={48} className={`${selectedId === 2 ? 'text-red-600' : 'text-costco-blue'} drop-shadow-xl`} fill="currentColor" />
                                    {selectedId === 2 && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-black/20 blur-sm rounded-full"></div>}
                                </div>
                                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white px-3 py-1 rounded-lg text-xs font-bold shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                    Баянзүрх
                                </span>
                            </button>

                            <button
                                onClick={() => setSelectedId(3)}
                                className={`absolute bottom-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition group z-10 focus:outline-none`}
                            >
                                <div className={`relative ${selectedId === 3 ? 'scale-125' : ''}`}>
                                    <MapPin size={48} className={`${selectedId === 3 ? 'text-red-600' : 'text-costco-blue'} drop-shadow-xl`} fill="currentColor" />
                                    {selectedId === 3 && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-black/20 blur-sm rounded-full"></div>}
                                </div>
                                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white px-3 py-1 rounded-lg text-xs font-bold shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                    Сүхбаатар
                                </span>
                            </button>
                        </div>

                        {/* Find My Location Button */}
                        <button
                            onClick={() => {
                                // Simulated geolocation
                                const nearestBranch = BRANCHES[0]; // Mock nearest branch
                                setSelectedId(nearestBranch.id);
                            }}
                            className={`absolute right-6 bg-white p-3 rounded-full shadow-lg text-gray-600 hover:text-costco-blue hover:shadow-xl transition-all duration-300 z-50 ${selectedId ? 'bottom-36' : 'bottom-6'}`}
                            title="Миний байршил"
                        >
                            <Locate size={24} />
                        </button>

                        {/* Selected Branch Overlay on Map */}
                        {selectedId && (
                            <div className="absolute bottom-6 left-6 right-6 bg-white p-4 rounded-xl shadow-lg border border-gray-100 animate-slide-up">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-costco-blue text-white rounded-lg flex items-center justify-center">
                                            <Navigation size={24} />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Сонгогдсон салбар</p>
                                            <h3 className="font-bold text-gray-900 text-lg">
                                                {BRANCHES.find(b => b.id === selectedId)?.name}
                                            </h3>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleSelect}
                                        className="bg-costco-blue text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200"
                                    >
                                        Баталгаажуулах
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
