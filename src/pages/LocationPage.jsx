import { useNavigate, useSearchParams } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCartStore } from '../store/cartStore';

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

// Component to handle map clicks
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

// Branches data
const branches = [
    { id: 'main', name: 'Төв салбар', lat: 47.9184, lng: 106.9176, address: 'Сүхбаатар дүүрэг, 1-р хороо' },
    { id: 'branch2', name: '2-р салбар', lat: 47.9100, lng: 106.9500, address: 'Баянзүрх дүүрэг' },
    { id: 'branch3', name: '3-р салбар', lat: 47.8916, lng: 106.9050, address: 'Хан-Уул дүүрэг, Зайсан' }
];

export default function LocationPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const mode = searchParams.get('mode') || 'branch'; // 'branch' or 'delivery'
    const { checkoutState, setCheckoutState } = useCartStore();

    const [pickedLocation, setPickedLocation] = useState(checkoutState.deliveryLocation);

    // Initial load
    useEffect(() => {
        if (mode === 'delivery' && checkoutState.deliveryLocation) {
            setPickedLocation(checkoutState.deliveryLocation);
        }
    }, [mode, checkoutState.deliveryLocation]);

    const handleConfirmLocation = () => {
        if (pickedLocation) {
            setCheckoutState({ deliveryLocation: pickedLocation, deliveryMode: 'delivery' });
            navigate(-1);
        }
    };

    const handleSelectBranch = (branch) => {
        setCheckoutState({ selectedBranch: branch.id, deliveryMode: 'pickup' });
        navigate(-1);
    };

    // Map refresh helper
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
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-[1001] shadow-sm">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <MapPin size={24} className="text-costco-blue" />
                            {mode === 'branch' ? 'Салбар сонгох' : 'Хүргэлтийн хаяг сонгох'}
                        </h1>
                        <p className="text-sm text-gray-500">
                            {mode === 'branch'
                                ? 'Газрын зураг дээрээс өөрт ойр салбарыг сонгоно уу'
                                : 'Газрын зураг дээр дарж хүргүүлэх байршлаа сонгоно уу'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div className="flex-1 relative w-full bg-gray-200 z-0">
                <MapContainer
                    center={(pickedLocation && pickedLocation.lat) ? pickedLocation : [47.9184, 106.9176]}
                    zoom={13}
                    className="h-full w-full absolute inset-0 outline-none"
                    zoomControl={true}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

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
                                            onClick={() => handleSelectBranch(branch)}
                                            className={`w-full py-2 px-4 rounded-lg font-bold text-sm transition ${checkoutState.selectedBranch === branch.id
                                                ? 'bg-green-600 text-white hover:bg-green-700'
                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                                }`}
                                        >
                                            {checkoutState.selectedBranch === branch.id ? 'Сонгогдсон' : 'Энэ салбарыг сонгох'}
                                        </button>
                                    </div>
                                </Popup>
                            </Marker>
                        ))
                    ) : (
                        <LocationMarker position={pickedLocation} setPosition={setPickedLocation} />
                    )}
                </MapContainer>

                {/* Delivery Mode Confirm Button */}
                {mode === 'delivery' && (
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-xs px-4">
                        <button
                            onClick={handleConfirmLocation}
                            disabled={!pickedLocation}
                            className={`w-full py-4 rounded-xl font-bold shadow-2xl transition-all transform active:scale-95 ${pickedLocation
                                ? 'bg-costco-blue text-white hover:bg-blue-700'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            {pickedLocation ? 'Байршил баталгаажуулах' : 'Газрын зураг дээр дарна уу'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
