import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Upload, Image as ImageIcon, Save, RotateCcw, ArrowLeft } from 'lucide-react';
import { db, storage } from '../firebase';
import { doc, updateDoc, setDoc, getDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MENU_DATA } from '../data/menuData';

export default function AdminMenuImagesPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState({}); // Map of categoryId -> boolean
    const [categories, setCategories] = useState([]);
    const [unsavedChanges, setUnsavedChanges] = useState({}); // Map of categoryId -> newUrl
    const [dbBanners, setDbBanners] = useState({}); // Map of categoryId -> dbUrl

    useEffect(() => {
        const loadBanners = async () => {
            setLoading(true);
            try {
                const banners = {};
                const promises = MENU_DATA.map(async (cat) => {
                    const docRef = doc(db, 'categories', cat.code);
                    const snap = await getDoc(docRef);
                    if (snap.exists() && snap.data().banner) {
                        banners[cat.code] = snap.data().banner;
                    }
                });

                await Promise.all(promises);
                setDbBanners(banners);
                setCategories(MENU_DATA);
            } catch (error) {
                console.error("Error loading banners:", error);
                alert("Өгөгдөл уншихад алдаа гарлаа.");
            } finally {
                setLoading(false);
            }
        };

        loadBanners();
    }, []);

    const handleImageUpload = async (e, categoryCode) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(prev => ({ ...prev, [categoryCode]: true }));
        try {
            const storageRef = ref(storage, `menu-images/${categoryCode}_${Date.now()}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            setUnsavedChanges(prev => ({
                ...prev,
                [categoryCode]: downloadURL
            }));

        } catch (error) {
            console.error("Upload failed:", error);
            alert("Зураг хуулахад алдаа гарлаа.");
        } finally {
            setUploading(prev => ({ ...prev, [categoryCode]: false }));
        }
    };

    const handleSave = async (categoryCode) => {
        const newUrl = unsavedChanges[categoryCode];
        if (!newUrl) return;

        setUploading(prev => ({ ...prev, [categoryCode]: true }));
        try {
            const docRef = doc(db, 'categories', categoryCode);
            await setDoc(docRef, { banner: newUrl }, { merge: true });

            setDbBanners(prev => ({
                ...prev,
                [categoryCode]: newUrl
            }));
            setUnsavedChanges(prev => {
                const next = { ...prev };
                delete next[categoryCode];
                return next;
            });
        } catch (error) {
            console.error("Save failed:", error);
            alert("Хадгалахад алдаа гарлаа.");
        } finally {
            setUploading(prev => ({ ...prev, [categoryCode]: false }));
        }
    };

    const handleReset = async (categoryCode) => {
        if (!window.confirm("Та энэ зурагны тохиргоог устгаж, үндсэн зураг руу буцаахдаа итгэлтэй байна уу?")) return;

        setUploading(prev => ({ ...prev, [categoryCode]: true }));
        try {
            const docRef = doc(db, 'categories', categoryCode);
            await updateDoc(docRef, { banner: deleteField() });

            setDbBanners(prev => {
                const next = { ...prev };
                delete next[categoryCode];
                return next;
            });
            setUnsavedChanges(prev => {
                const next = { ...prev };
                delete next[categoryCode];
                return next;
            });

        } catch (error) {
            console.error("Reset failed:", error);
            alert("Алдаа гарлаа. Баримт олдохгүй байж магадгүй.");
        } finally {
            setUploading(prev => ({ ...prev, [categoryCode]: false }));
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
                        Цэсний Зураг Солих
                    </h1>
                </div>
            </div>

            <div className="flex-1 p-4 max-w-6xl mx-auto w-full">
                {loading ? (
                    <div className="text-center py-20 text-gray-500">Уншиж байна...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {categories.map((cat) => {
                            const currentUrl = unsavedChanges[cat.code] || dbBanners[cat.code] || cat.banner;
                            const isModified = !!dbBanners[cat.code];
                            const hasUnsaved = !!unsavedChanges[cat.code];
                            const isProcessing = uploading[cat.code];

                            return (
                                <div key={cat.code} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col group/card hover:shadow-md transition">
                                    {/* Header */}
                                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            {cat.icon && <cat.icon size={16} className="text-gray-500" />}
                                            <span className="font-bold text-gray-800 text-sm">{cat.label}</span>
                                        </div>
                                        <span className="text-xs text-gray-400 font-mono">{cat.code}</span>
                                    </div>

                                    {/* Image Preview */}
                                    <div className="relative aspect-[16/9] bg-gray-200 group">
                                        <img
                                            src={currentUrl}
                                            alt={cat.label}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none flex items-end p-4">
                                            {/* Optional: Add text overlay if needed */}
                                        </div>

                                        {/* Upload Overlay */}
                                        <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer">
                                            <div className="bg-white text-gray-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg transform translate-y-2 group-hover:translate-y-0 transition">
                                                <Upload size={16} />
                                                Зураг солих
                                            </div>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => handleImageUpload(e, cat.code)}
                                                disabled={isProcessing}
                                            />
                                        </label>

                                        {isProcessing && (
                                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-costco-blue"></div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="p-3 bg-white flex justify-between items-center gap-2 mt-auto">
                                        {hasUnsaved ? (
                                            <button
                                                onClick={() => handleSave(cat.code)}
                                                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition"
                                            >
                                                <Save size={16} />
                                                Хадгалах
                                            </button>
                                        ) : (
                                            <div className="flex-1 text-xs text-gray-400 text-center py-2 flex items-center justify-center gap-1">
                                                {isModified ? <span className="text-blue-500 font-medium">● Өөрчлөгдсөн</span> : "Үндсэн зураг"}
                                            </div>
                                        )}

                                        {isModified && (
                                            <button
                                                onClick={() => handleReset(cat.code)}
                                                className="px-3 py-2 bg-gray-100 hover:bg-red-50 hover:text-red-500 text-gray-500 rounded-lg transition"
                                                title="Үндсэн зураг руу буцаах"
                                            >
                                                <RotateCcw size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
