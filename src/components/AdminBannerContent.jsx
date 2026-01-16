import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, GripVertical, RefreshCw, Film, Image as ImageIcon } from 'lucide-react';
import { db, storage } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function AdminBannerContent() {
    const [banners, setBanners] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef(null);

    // Exchange rate banner text settings
    const [exchangeRateText, setExchangeRateText] = useState({
        line1: 'Солонгост хамгийн өндөр ханшаар',
        line2: 'воныг {rate} -аар бодож',
        line3: 'төгрөг шилжүүлж байна'
    });

    useEffect(() => {
        fetchBanners();
    }, []);

    const fetchBanners = async () => {
        try {
            const snap = await getDoc(doc(db, 'settings', 'home_banner'));
            if (snap.exists()) {
                const data = snap.data();
                setBanners(data.items || []);
                // Load exchange rate text if exists
                if (data.exchangeRateText) {
                    setExchangeRateText(data.exchangeRateText);
                }
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
                exchangeRateText: exchangeRateText,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            window.alert("Амжилттай хадгалагдлаа!");
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

    if (loading) return <div>Уншиж байна...</div>;

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-gray-800">Нүүр хуудасны баннер</h3>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || isUploading}
                    className={`py-2 px-4 bg-costco-blue text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition ${isSaving || isUploading ? 'opacity-50' : 'hover:bg-blue-700'}`}
                >
                    {isSaving ? <RefreshCw className="animate-spin" size={16} /> : null}
                    Хадгалах
                </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
                Хамгийн ихдээ 10 зураг эсвэл бичлэг оруулах боломжтой.
            </p>

            {/* Exchange Rate Banner Text Editor */}
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                <h4 className="font-bold text-sm text-blue-800 mb-3">🇰🇷 Ханшийн баннер текст</h4>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">1-р мөр (дээд)</label>
                        <input
                            type="text"
                            value={exchangeRateText.line1}
                            onChange={(e) => setExchangeRateText(prev => ({ ...prev, line1: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Солонгост хамгийн өндөр ханшаар"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">2-р мөр (гол) - {'{rate}'} = ханш</label>
                        <input
                            type="text"
                            value={exchangeRateText.line2}
                            onChange={(e) => setExchangeRateText(prev => ({ ...prev, line2: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="воныг {rate} -аар бодож"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">3-р мөр (доод)</label>
                        <input
                            type="text"
                            value={exchangeRateText.line3}
                            onChange={(e) => setExchangeRateText(prev => ({ ...prev, line3: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="төгрөг шилжүүлж байна"
                        />
                    </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    💡 {'{rate}'} гэж бичвэл автоматаар одоогийн ханшаар солигдоно
                </p>
            </div>

            <div className="space-y-3 pb-4 overflow-y-auto pr-2">
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
    );
}
