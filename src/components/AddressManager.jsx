import React, { useState, useEffect } from 'react';
import { MapPin, Phone, Plus, X, Edit2, Trash2, CheckCircle2, Check } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function LocationMarker({ position, setPosition }) {
    useMapEvents({
        click(e) {
            setPosition(e.latlng);
        },
    });
    return position === null ? null : <Marker position={position}></Marker>;
}

export default function AddressManager() {
    const { user, login } = useAuthStore();
    const { showToast } = useUIStore();

    const [phone, setPhone] = useState('');
    const [isEditingPhone, setIsEditingPhone] = useState(false);
    
    const [addresses, setAddresses] = useState([]);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAddressId, setEditingAddressId] = useState(null);
    const [addressTitle, setAddressTitle] = useState('');
    const [addressDetail, setAddressDetail] = useState('');
    const [position, setPosition] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Улаанбаатар хотын төв цэг
    const defaultCenter = [47.9189, 106.9177];

    useEffect(() => {
        if (user) {
            setPhone(user.phone || '');
            if (user.addresses) {
                setAddresses(user.addresses);
            }
        }
    }, [user]);

    const handleSavePhone = async () => {
        if (!user?.uid) return;
        setIsSaving(true);
        try {
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, { phone }, { merge: true });
            login({ ...user, phone });
            setIsEditingPhone(false);
        } catch (error) {
            console.error("Утасны дугаар хадгалахад алдаа гарлаа:", error);
            showToast('Алдаа гарлаа. Дахин оролдоно уу.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const openModal = (addr = null) => {
        if (addr) {
            setEditingAddressId(addr.id);
            setAddressTitle(addr.title);
            setAddressDetail(addr.detail);
            setPosition(addr.position ? { lat: addr.position.lat, lng: addr.position.lng } : null);
        } else {
            setEditingAddressId(null);
            setAddressTitle('Гэр');
            setAddressDetail('');
            setPosition(null);
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingAddressId(null);
        setAddressTitle('');
        setAddressDetail('');
        setPosition(null);
    };

    const handleSaveAddress = async () => {
        if (!user?.uid) return;
        if (!addressDetail) {
            showToast('Дэлгэрэнгүй хаягаа оруулна уу.', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            let newAddresses = [...addresses];
            const existingAddr = editingAddressId ? addresses.find(a => a.id === editingAddressId) : null;
            const newAddr = {
                id: editingAddressId || Date.now().toString(),
                title: addressTitle || 'Хаяг',
                detail: addressDetail,
                position: position ? { lat: position.lat, lng: position.lng } : null,
                // Preserve isDefault when editing, only auto-set for first address
                isDefault: editingAddressId ? (existingAddr?.isDefault || false) : (addresses.length === 0)
            };

            if (editingAddressId) {
                newAddresses = newAddresses.map(a => a.id === editingAddressId ? { ...a, ...newAddr } : a);
            } else {
                newAddresses.push(newAddr);
            }

            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, { addresses: newAddresses }, { merge: true });
            login({ ...user, addresses: newAddresses });
            setAddresses(newAddresses);
            closeModal();
        } catch (error) {
            console.error("Хаяг хадгалахад алдаа гарлаа:", error);
            showToast('Алдаа гарлаа. Дахин оролдоно уу.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAddress = async (id) => {
        if (!confirm('Энэ хаягийг устгах уу?')) return;
        if (!user?.uid) return;
        
        try {
            const newAddresses = addresses.filter(a => a.id !== id);
            // Хэрэв default хаягийг устгасан бол дараагийнхийг нь default болгох
            if (newAddresses.length > 0 && !newAddresses.find(a => a.isDefault)) {
                newAddresses[0].isDefault = true;
            }

            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, { addresses: newAddresses }, { merge: true });
            login({ ...user, addresses: newAddresses });
            setAddresses(newAddresses);
        } catch (error) {
            console.error("Хаяг устгахад алдаа гарлаа:", error);
        }
    };

    const handleSetDefault = async (id) => {
        if (!user?.uid) return;
        try {
            const newAddresses = addresses.map(a => ({
                ...a,
                isDefault: a.id === id
            }));

            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, { addresses: newAddresses }, { merge: true });
            login({ ...user, addresses: newAddresses });
            setAddresses(newAddresses);
        } catch (error) {
            console.error("Үндсэн хаяг болгоход алдаа гарлаа:", error);
        }
    };

    return (
        <div className="w-full bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                    <div className="w-1.5 h-5 bg-costco-blue rounded-full shrink-0"></div>
                    Хувийн мэдээлэл
                </h3>
            </div>

            <div className="p-5 space-y-6">
                {/* Phone Section */}
                <div>
                    <label className="text-sm font-semibold text-gray-500 flex items-center gap-2 mb-2">
                        <Phone size={16} /> Утасны дугаар
                    </label>
                    {isEditingPhone ? (
                        <div className="flex gap-2">
                            <input 
                                type="tel" 
                                value={phone} 
                                onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-costco-blue transition"
                                placeholder="+976 88xxxxxx"
                            />
                            <button 
                                onClick={handleSavePhone}
                                disabled={isSaving}
                                className="bg-costco-blue text-white px-4 rounded-xl font-bold"
                            >
                                {isSaving ? '...' : 'Хадгалах'}
                            </button>
                        </div>
                    ) : (
                        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <span className="font-medium text-gray-800">{phone || 'Оруулаагүй байна'}</span>
                            <button 
                                onClick={() => setIsEditingPhone(true)}
                                className="text-costco-blue hover:text-blue-700 p-2 bg-white rounded-lg shadow-sm border border-gray-100 transition"
                            >
                                <Edit2 size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Addresses Section */}
                <div>
                    <label className="text-sm font-semibold text-gray-500 flex items-center gap-2 mb-3">
                        <MapPin size={16} /> Хүргэлтийн хаяг ({addresses.length}/5)
                    </label>
                    
                    <div className="space-y-3">
                        {addresses.map(addr => (
                            <div key={addr.id} className={`p-4 rounded-xl border ${addr.isDefault ? 'border-costco-blue bg-blue-50/30' : 'border-gray-200 bg-gray-50'} relative transition`}>
                                <div className="flex justify-between items-start pr-12">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-gray-900">{addr.title}</h4>
                                            {addr.isDefault && (
                                                <span className="text-[10px] font-bold bg-costco-blue text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                    Үндсэн
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 leading-tight">{addr.detail}</p>
                                    </div>
                                </div>
                                
                                <div className="absolute right-3 top-3 flex flex-col gap-2">
                                    <button 
                                        onClick={() => openModal(addr)}
                                        className="text-gray-400 hover:text-costco-blue transition bg-white p-1.5 rounded-md shadow-sm border border-gray-100"
                                        title="Засах"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteAddress(addr.id)}
                                        className="text-gray-400 hover:text-red-500 transition bg-white p-1.5 rounded-md shadow-sm border border-gray-100"
                                        title="Устгах"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                {!addr.isDefault && (
                                    <button 
                                        onClick={() => handleSetDefault(addr.id)}
                                        className="mt-3 text-xs font-semibold text-costco-blue flex items-center gap-1 hover:underline"
                                    >
                                        <CheckCircle2 size={14} /> Үндсэн хаяг болгох
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {addresses.length < 5 && (
                        <button 
                            onClick={() => openModal()}
                            className="w-full mt-3 py-3.5 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-semibold hover:border-costco-blue hover:text-costco-blue transition flex items-center justify-center gap-2 bg-gray-50/50"
                        >
                            <Plus size={18} /> Шинэ хаяг нэмэх
                        </button>
                    )}
                </div>
            </div>

            {/* Map Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-lg">{editingAddressId ? 'Хаяг засах' : 'Шинэ хаяг нэмэх'}</h3>
                            <button onClick={closeModal} className="p-2 hover:bg-gray-200 rounded-full transition text-gray-500">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-5 overflow-y-auto flex-1 space-y-5">
                            <div>
                                <label className="text-sm font-semibold text-gray-600 block mb-2">Хаягийн нэр</label>
                                <div className="flex gap-2 mb-2">
                                    {['Гэр', 'Ажил', 'Аавынх', 'Ээжийнх'].map(t => (
                                        <button 
                                            key={t}
                                            onClick={() => setAddressTitle(t)}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${addressTitle === t ? 'bg-costco-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                                <input 
                                    type="text" 
                                    value={addressTitle}
                                    onChange={e => setAddressTitle(e.target.value)}
                                    placeholder="Өөр нэр өгөх бол энд бичнэ үү"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-costco-blue transition"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-semibold text-gray-600 block mb-2">Газрын зураг (Монголд бол хатгана уу, Солонгост бол алгасаж болно)</label>
                                <div className="h-64 rounded-xl overflow-hidden border border-gray-200 relative z-0">
                                    <MapContainer 
                                        center={position || defaultCenter} 
                                        zoom={13} 
                                        scrollWheelZoom={true} 
                                        style={{ height: '100%', width: '100%' }}
                                    >
                                        <TileLayer
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <LocationMarker position={position} setPosition={setPosition} />
                                    </MapContainer>
                                </div>
                                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                    <MapPin size={12} /> Монголын хаяг бол зураг дээр дарж байршлаа сонгоно уу
                                </p>
                            </div>

                            <div>
                                <label className="text-sm font-semibold text-gray-600 block mb-2">Дэлгэрэнгүй хаяг</label>
                                <textarea 
                                    value={addressDetail}
                                    onChange={e => setAddressDetail(e.target.value)}
                                    placeholder="Дүүрэг, Хороо, Хотхон, Орц, Давхар, Тоот..."
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-costco-blue transition min-h-[100px] resize-y"
                                />
                            </div>
                        </div>

                        <div className="p-5 border-t border-gray-100 bg-gray-50/50">
                            <button 
                                onClick={handleSaveAddress}
                                disabled={isSaving}
                                className="w-full bg-costco-blue hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-blue-500/20 flex justify-center items-center gap-2"
                            >
                                {isSaving ? 'Хадгалж байна...' : <><Check size={20} /> Хадгалах</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
