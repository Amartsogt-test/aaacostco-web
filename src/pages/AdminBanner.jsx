import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Trash2, GripVertical, Upload, RefreshCw, Film, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import { db, storage } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function AdminBanner() {
    const navigate = useNavigate();
    const [banners, setBanners] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [_loading, setLoading] = useState(true);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchBanners();
    }, []);

    const fetchBanners = async () => {
        try {
            const snap = await getDoc(doc(db, 'settings', 'home_banner'));
            if (snap.exists()) {
                const data = snap.data();
                setBanners(data.items || []);
            }
        } catch (error) {
            console.error("Error fetching banners:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        e.target.value = '';

        if (banners.length >= 10) {
            window.alert("Хамгийн ихдээ 10 баннер оруулах боломжтой.");
            return;
        }

        setIsUploading(true);
        try {
            const fileType = file.type.startsWith('video/') ? 'video' : 'image';
            const fileName = `banners/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, fileName);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);

            const newItem = {
                url,
                type: fileType,
                duration: 5,
                active: true,
                createdAt: new Date().toISOString()
            };

            setBanners(prev => [...prev, newItem]);
        } catch (error) {
            console.error("Upload error:", error);
            window.alert(`Файл хуулахад алдаа гарлаа: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = (index) => {
        const newBanners = banners.filter((_, i) => i !== index);
        setBanners(newBanners);
    };

    const handleDurationChange = (index, value) => {
        const newBanners = [...banners];
        newBanners[index].duration = parseInt(value) || 5;
        setBanners(newBanners);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'home_banner'), {
                items: banners,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            window.alert("Амжилттай хадгалагдлаа!");
            // navigate(-1); // Optional: stay on page or go back
        } catch (error) {
            console.error("Save error:", error);
            window.alert("Хадгалахад алдаа гарлаа.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleReplaceImage = async (e, index) => {
        const file = e.target.files?.[0];
        if (!file) return;

        e.target.value = '';
        setIsUploading(true);
        try {
            const fileType = file.type.startsWith('video/') ? 'video' : 'image';
            const storageRef = ref(storage, `banners/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);

            const newBanners = [...banners];
            newBanners[index] = {
                ...newBanners[index],
                url,
                type: fileType
            };
            setBanners(newBanners);
        } catch (error) {
            console.error("Replace error:", error);
            window.alert("Зураг солиход алдаа гарлаа.");
        } finally {
            setIsUploading(false);
        }
    };

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
                        Баннер удирдах
                    </h1>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving || isUploading}
                    className={`py-2 px-6 bg-costco-blue text-white rounded-lg font-bold flex items-center gap-2 shadow-lg transition ${isSaving || isUploading ? 'opacity-50' : 'hover:bg-blue-700'}`}
                >
                    {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <Upload size={20} />}
                    <span className="hidden sm:inline">Хадгалах</span>
                </button>
            </div>

            <div className="flex-1 p-4 max-w-4xl mx-auto w-full">
                <p className="text-sm text-gray-500 mb-6">
                    Хамгийн ихдээ 10 зураг эсвэл бичлэг оруулах боломжтой.
                </p>

                <div className="space-y-3">
                    {banners.map((item, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                            <div className="cursor-move text-gray-300 hover:text-gray-500">
                                <GripVertical size={18} />
                            </div>

                            <div className="w-24 h-16 bg-gray-100 rounded-lg overflow-hidden shrink-0 relative border">
                                {item.type === 'video' ? (
                                    <video src={item.url} className="w-full h-full object-cover" muted />
                                ) : (
                                    <img src={item.url} className="w-full h-full object-cover" alt="" />
                                )}
                                <div className="absolute top-1 right-1 bg-black/50 text-white rounded p-0.5">
                                    {item.type === 'video' ? <Film size={10} /> : <ImageIcon size={10} />}
                                </div>
                            </div>

                            {/* Duration input */}
                            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => handleDurationChange(index, (item.duration || 5) - 1)}
                                    className="px-3 py-2 text-gray-500 hover:bg-gray-200"
                                >
                                    −
                                </button>
                                <span className="w-10 text-center text-sm font-bold">
                                    {item.duration || 5}s
                                </span>
                                <button
                                    onClick={() => handleDurationChange(index, (item.duration || 5) + 1)}
                                    className="px-3 py-2 text-gray-500 hover:bg-gray-200"
                                >
                                    +
                                </button>
                            </div>

                            <div className="flex-1" />

                            <label className="p-2 hover:bg-blue-50 text-blue-500 rounded-lg cursor-pointer" title="Зураг солих">
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*,video/*"
                                    onChange={(e) => handleReplaceImage(e, index)}
                                />
                                <RefreshCw size={18} />
                            </label>

                            <button
                                onClick={() => handleDelete(index)}
                                className="p-2 hover:bg-red-50 text-red-500 rounded-lg"
                                title="Устгах"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}

                    {banners.length < 10 && (
                        <label className={`w-full h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-costco-blue hover:bg-blue-50 transition bg-white ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                accept="image/*,video/*"
                                onChange={handleFileUpload}
                            />
                            <div className="flex items-center gap-2 text-gray-500">
                                {isUploading ? <RefreshCw className="animate-spin" size={20} /> : <Plus size={20} />}
                                <span className="font-bold">
                                    {isUploading ? 'Хуулж байна...' : 'Зураг нэмэх'}
                                </span>
                            </div>
                        </label>
                    )}
                </div>
            </div>
        </div>
    );
}
