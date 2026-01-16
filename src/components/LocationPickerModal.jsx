import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, MapPin } from 'lucide-react';

// Import leaflet assets
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

// Component to handle map clicks for picking location
function LocationMarker({ position, setPosition }) {
    useMapEvents({
        click(e) {
            setPosition(e.latlng);
        },
    });

    return position === null ? null : (
        <Marker position={position}>
            <Popup>Таны сонгосон байршил</Popup>
        </Marker>
    );
}

// Mock Branches
const branches = [
    { id: 'main', name: 'Төв салбар', lat: 47.9184, lng: 106.9176, address: 'Сүхбаатар дүүрэг, 1-р хороо' },
    { id: 'branch2', name: '2-р салбар', lat: 47.9100, lng: 106.9500, address: 'Баянзүрх дүүрэг' },
    { id: 'branch3', name: '3-р салбар', lat: 47.8916, lng: 106.9050, address: 'Хан-Уул дүүрэг, Зайсан' }
];

export default function LocationPickerModal({ isOpen, onClose, onSelect, mode = 'branch', initialLocation = null, selectedBranchId = null }) {
    const [pickedLocation, setPickedLocation] = useState(initialLocation);

    useEffect(() => {
        if (isOpen && initialLocation) {
            setPickedLocation(initialLocation);
        }
    }, [isOpen, initialLocation]);

    if (!isOpen) return null;

    const handleConfirmLocation = () => {
        if (pickedLocation) {
            onSelect(pickedLocation);
            onClose();
        }
    };

    // Helper component to trigger invalidateSize inside MapContainer
    const MapRefresh = () => {
        const map = useMap();
        useEffect(() => {
            if (map) {
                setTimeout(() => {
                    map.invalidateSize();
                }, 300);
            }
        }, [map]);
        return null;
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col relative overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white z-10">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">
                            {mode === 'branch' ? 'Салбар сонгох' : 'Хүргэлтийн хаяг сонгох'}
                        </h2>
                        <p className="text-sm text-gray-500">
                            {mode === 'branch'
                                ? 'Газрын зураг дээрээс өөрт ойр салбарыг сонгоно уу'
                                : 'Газрын зураг дээр дарж хүргүүлэх байршлаа сонгоно уу'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={24} className="text-gray-500" />
                    </button>
                </div>

                {/* Map Container */}
                <div className="flex-1 w-full h-full relative">
                    <MapContainer
                        center={[47.9184, 106.9176]}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={true}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />

                        {/* Ensure map fills the container correctly */}
                        <MapRefresh />

                        {mode === 'branch' ? (
                            branches.map((branch) => (
                                <Marker
                                    key={branch.id}
                                    position={[branch.lat, branch.lng]}
                                >
                                    <Popup>
                                        <div className="min-w-[200px] p-1">
                                            <h3 className="font-bold text-lg mb-1">{branch.name}</h3>
                                            <p className="text-sm text-gray-600 mb-3">{branch.address}</p>
                                            <button
                                                onClick={() => onSelect(branch.id)}
                                                className={`w-full py-2 px-4 rounded-lg font-bold text-sm transition-colors ${selectedBranchId === branch.id
                                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                                    }`}
                                            >
                                                {selectedBranchId === branch.id ? 'Сонгогдсон' : 'Энэ салбарыг сонгох'}
                                            </button>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))
                        ) : (
                            <LocationMarker position={pickedLocation} setPosition={setPickedLocation} />
                        )}
                    </MapContainer>

                    {/* Delivery Mode Confirm Button Overlay */}
                    {mode === 'delivery' && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-xs px-4">
                            <button
                                onClick={handleConfirmLocation}
                                disabled={!pickedLocation}
                                className={`w-full py-3 rounded-xl font-bold shadow-lg transition-all ${pickedLocation
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                {pickedLocation ? 'Байршил баталгаажуулах' : 'Газрын зураг дээр дарна уу'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
