import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, GripVertical, Image as ImageIcon, Plus, RefreshCw, Trash2, Upload, Film } from 'lucide-react';
import { adminService } from '../services/adminService';
import { useUIStore } from '../store/uiStore';

export default function BannerManager({ isEmbedded = false }) {
    const navigate = useNavigate();
    const { showToast } = useUIStore();
    const [banners, setBanners] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [_loading, setLoading] = useState(true); // prefixed with _ to ignore unused warning
    const fileInputRef = useRef(null);
    const [isActive, setIsActive] = useState(true);

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
            const data = await adminService.getHomeBanners();
            const { items, exchangeRateText: text, isActive: activeStatus } = data || {};
            setBanners((items || []).map(item => ({ ...item, duration: Number(item.duration) || 5 })));
            if (text) {
                setExchangeRateText(text);
            }
            setIsActive(activeStatus !== false); // default to true if undefined
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
            showToast('Хамгийн ихдээ 10 баннер оруулах боломжтой.', 'warning');
            return;
        }

        setIsUploading(true);
        try {
            const url = await adminService.uploadHomeBanner(file);
            const fileType = file.type.startsWith('video/') ? 'video' : 'image';

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
            showToast(`Файл хуулахад алдаа гарлаа: ${error.message}`, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = (index) => {
        setBanners(prev => prev.filter((_, i) => i !== index));
    };

    const handleDurationChange = (index, value) => {
        let val = parseInt(value);
        if (isNaN(val)) val = 5;
        if (val < 1) val = 1;
        if (val > 60) val = 60;

        setBanners(prev => {
            const newBanners = [...prev];
            newBanners[index] = { ...newBanners[index], duration: val };
            return newBanners;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            console.log("Saving banners:", banners);
            await adminService.saveHomeBanners(banners, exchangeRateText, isActive);

            // Re-fetch to verify
            await fetchBanners();

            showToast('Амжилттай хадгалагдлаа!', 'success');
            // if (!isEmbedded) navigate(-1); 
        } catch (error) {
            console.error("Save error:", error);
            showToast('Хадгалахад алдаа гарлаа.', 'error');
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
            const url = await adminService.uploadHomeBanner(file);
            const fileType = file.type.startsWith('video/') ? 'video' : 'image';

            setBanners(prev => {
                const newBanners = [...prev];
                newBanners[index] = {
                    ...newBanners[index],
                    url,
                    type: fileType
                };
                return newBanners;
            });
        } catch (error) {
            console.error("Replace error:", error);
            showToast('Зураг солиход алдаа гарлаа.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className={`flex flex-col ${isEmbedded ? 'h-full' : 'min-h-screen bg-gray-50'}`}>
            {/* Header */}
            <div className={`bg-white px-4 py-4 border-b flex items-center justify-between sticky top-0 z-10 shadow-sm ${isEmbedded ? 'rounded-t-xl' : ''}`}>
                <div className="flex items-center gap-4">
                    {!isEmbedded && (
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-gray-100 rounded-full transition"
                        >
                            <ArrowLeft size={24} className="text-gray-600" />
                        </button>
                    )}
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

            <div className="flex-1 p-4 w-full overflow-y-auto">
                <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 mb-6 shadow-sm">
                    <div>
                        <h3 className="font-bold text-gray-900">Баннер харуулах</h3>
                        <p className="text-sm text-gray-500">Нүүр хуудсан дээр баннер (зураг, ханш) хэсгийг харуулах эсэх</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                        />
                        <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                </div>

                <p className="text-sm text-gray-500 mb-6">
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
