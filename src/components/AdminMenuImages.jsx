import { useState, useEffect } from 'react';
import { Upload, Save, RotateCcw } from 'lucide-react';
import { db, storage } from '../firebase';
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MENU_DATA } from '../data/menuData';

export default function AdminMenuImages({ isEmbedded = false }) {
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState({}); // Map of categoryId -> boolean
    const [categories, setCategories] = useState([]);
    const [unsavedChanges, setUnsavedChanges] = useState({}); // Map of categoryId -> newUrl
    const [dbBanners, setDbBanners] = useState({}); // Map of categoryId -> dbUrl

    // Load current Firestore banners
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
            // Upload to Firebase Storage
            const storageRef = ref(storage, `menu-images/${categoryCode}_${Date.now()}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            // Update unsaved changes state
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

            // Update local state
            setDbBanners(prev => ({
                ...prev,
                [categoryCode]: newUrl
            }));
            setUnsavedChanges(prev => {
                const next = { ...prev };
                delete next[categoryCode];
                return next;
            });
            alert("Амжилттай хадгаллаа!");

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
            const { deleteField } = await import('firebase/firestore');
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
        <div className={`h-full flex flex-col ${isEmbedded ? '' : 'p-6 bg-gray-50'}`}>
            {loading ? (
                <div className="text-center py-20 text-gray-500">Уншиж байна...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                    {categories.map((cat) => {
                        const currentUrl = unsavedChanges[cat.code] || dbBanners[cat.code] || cat.banner;
                        const isModified = !!dbBanners[cat.code];
                        const hasUnsaved = !!unsavedChanges[cat.code];
                        const isProcessing = uploading[cat.code];

                        return (
                            <div key={cat.code} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        {cat.icon && <cat.icon size={16} className="text-gray-500" />}
                                        <span className="font-bold text-gray-800 text-sm">{cat.label}</span>
                                    </div>
                                    <span className="text-xs text-gray-400 font-mono">600x200px</span>
                                </div>

                                <div className="relative aspect-[3/1] bg-gray-200 group">
                                    <img
                                        src={currentUrl}
                                        alt={cat.label}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent pointer-events-none flex items-center px-6">
                                        <h3 className="text-white font-bold text-xl drop-shadow-md">{cat.label}</h3>
                                    </div>

                                    <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer">
                                        <div className="bg-white text-gray-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg">
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
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                        </div>
                                    )}
                                </div>

                                <div className="p-3 bg-white flex justify-between items-center gap-2">
                                    {hasUnsaved ? (
                                        <button
                                            onClick={() => handleSave(cat.code)}
                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition"
                                        >
                                            <Save size={16} />
                                            Хадгалах
                                        </button>
                                    ) : (
                                        <div className="flex-1 text-xs text-gray-400 text-center py-2">
                                            {isModified ? "Өөрчлөгдсөн" : "Үндсэн зураг"}
                                        </div>
                                    )}

                                    {isModified && (
                                        <button
                                            onClick={() => handleReset(cat.code)}
                                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition"
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
    );
}
