import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, GripVertical, Upload, RefreshCw, Film, Image as ImageIcon, Clock } from 'lucide-react';
import { db, storage } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export default function AdminBannerModal({ isOpen, onClose }) {
    const [banners, setBanners] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            fetchBanners();
        }
    }, [isOpen]);

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
        if (!file) {
            console.log('No file selected');
            return;
        }

        console.log('File selected:', file.name, file.type, file.size);

        // Reset input value so same file can be selected again
        e.target.value = '';

        if (banners.length >= 10) {
            window.alert("Хамгийн ихдээ 10 баннер оруулах боломжтой.");
            return;
        }

        setIsUploading(true);
        try {
            console.log('Starting upload...');
            const fileType = file.type.startsWith('video/') ? 'video' : 'image';
            const fileName = `banners/${Date.now()}_${file.name}`;
            console.log('Storage path:', fileName);

            const storageRef = ref(storage, fileName);
            console.log('Uploading to Firebase Storage...');

            const snapshot = await uploadBytes(storageRef, file);
            console.log('Upload complete, getting URL...');

            const url = await getDownloadURL(snapshot.ref);
            console.log('Download URL:', url);

            const newItem = {
                url,
                type: fileType,
                duration: 5,
                active: true,
                createdAt: new Date().toISOString()
            };

            setBanners(prev => [...prev, newItem]);
            console.log('Banner added successfully');
        } catch (error) {
            console.error("Upload error:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            window.alert(`Файл хуулахад алдаа гарлаа: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = (index) => {
        console.log('Delete clicked for index:', index);
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
            onClose();
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

        // Reset input value
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in">
                <div className="bg-costco-blue px-6 py-4 flex justify-between items-center text-white">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <ImageIcon size={24} />
                        Баннер удирдах
                    </h2>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    <p className="text-sm text-gray-500 mb-6">
                        Хамгийн ихдээ 10 зураг эсвэл бичлэг оруулах боломжтой.
                    </p>

                    <div className="space-y-3">
                        {banners.map((item, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="cursor-move text-gray-300 hover:text-gray-500">
                                    <GripVertical size={18} />
                                </div>

                                <div className="w-20 h-12 bg-gray-200 rounded-lg overflow-hidden shrink-0 relative">
                                    {item.type === 'video' ? (
                                        <video src={item.url} className="w-full h-full object-cover" muted />
                                    ) : (
                                        <img src={item.url} className="w-full h-full object-cover" alt="" />
                                    )}
                                    <div className="absolute top-1 right-1 bg-black/50 text-white rounded p-0.5">
                                        {item.type === 'video' ? <Film size={8} /> : <ImageIcon size={8} />}
                                    </div>
                                </div>

                                {/* Duration input with +/- buttons */}
                                <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => handleDurationChange(index, (item.duration || 5) - 1)}
                                        className="px-3 py-2 text-gray-400 hover:text-costco-blue hover:bg-gray-50 transition"
                                    >
                                        −
                                    </button>
                                    <span className="px-3 py-2 text-sm font-medium min-w-[50px] text-center">
                                        {item.duration || 5}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleDurationChange(index, (item.duration || 5) + 1)}
                                        className="px-3 py-2 text-gray-400 hover:text-costco-blue hover:bg-gray-50 transition"
                                    >
                                        +
                                    </button>
                                </div>

                                <div className="flex-1" />

                                {/* Replace image button */}
                                <label className="p-2 hover:bg-blue-50 text-blue-500 rounded-lg cursor-pointer" title="Зураг солих">
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*,video/*"
                                        onChange={(e) => handleReplaceImage(e, index)}
                                    />
                                    <RefreshCw size={18} />
                                </label>

                                {/* Delete button */}
                                <button
                                    type="button"
                                    onClick={() => handleDelete(index)}
                                    className="p-2 hover:bg-red-50 text-red-500 rounded-lg"
                                    title="Устгах"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}

                        {banners.length < 10 && (
                            <label className={`w-full h-20 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-costco-blue hover:bg-blue-50 transition ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="hidden"
                                    accept="image/*,video/*"
                                    onChange={handleFileUpload}
                                />
                                <div className="flex items-center gap-2 text-gray-400">
                                    {isUploading ? <RefreshCw className="animate-spin" size={20} /> : <Plus size={20} />}
                                    <span className="text-sm font-medium">
                                        {isUploading ? 'Хуулж байна...' : 'Зураг нэмэх'}
                                    </span>
                                </div>
                            </label>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t bg-gray-50 flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 py-3 px-4 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition">
                        Болих
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || isUploading}
                        className={`flex-[2] py-3 px-4 bg-costco-blue text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-100 transition ${isSaving || isUploading ? 'opacity-50' : 'hover:bg-blue-700'}`}
                    >
                        {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <Upload size={20} />}
                        Хадгалах
                    </button>
                </div>
            </div>
        </div>
    );
}
