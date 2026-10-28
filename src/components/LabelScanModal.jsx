import { useState, useRef } from 'react';
import { Camera, Upload, X, Check, BadgeHelp, Loader2, ScanLine } from 'lucide-react';

import { aiApi } from '../services/apiClient';
import { productService } from '../services/productService';
import { useWishlistStore } from '../store/wishlistStore';
import { useUIStore } from '../store/uiStore';

// 📷 In-store label scanner for shoppers walking the Costco aisles.
// Capture/select a price-tag photo → AI OCR (aiProxy extractPriceTag) → look the code up
// in our catalog. If we carry it, it's added to Saved (wishlist). If not, the label's
// details (code/name/price) are stored so the shopper keeps a record + we learn demand.
export default function LabelScanModal({ onClose }) {
    const { addToWishlist, addScannedLabel, isInWishlist } = useWishlistStore();
    const { showToast } = useUIStore();

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null); // { found, product? , label? }

    const cameraRef = useRef(null);
    const galleryRef = useRef(null);

    // Resize to ≤1000px and return base64 (no data: prefix) — same approach as the admin scanner.
    const compress = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Зураг уншихад алдаа гарлаа.'));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Зураг уншихад алдаа (HEIC формат дэмжихгүй байж болзошгүй).'));
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                const MAX = 1000;
                if (width > height && width > MAX) { height *= MAX / width; width = MAX; }
                else if (height >= width && height > MAX) { width *= MAX / height; height = MAX; }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-picking the same file later
        if (!file) return;
        setError(null); setResult(null); setLoading(true);
        try {
            setMessage('Зургийг бэлтгэж байна...');
            const base64 = await compress(file);

            setMessage('AI шошгыг уншиж байна...');

            const data = await aiApi.scan(base64);
            if (!data || !data.code) throw new Error('Шошгоны код уншигдсангүй. Тод, ойроос дахин дарж үзнэ үү.');

            setMessage('Манай дэлгүүрээс хайж байна...');
            const product = await productService.getProductById(String(data.code));

            if (product) {
                if (!isInWishlist(product.id)) addToWishlist(product);
                setResult({ found: true, product });
                showToast('Манай дэлгүүрт байна — Хадгалсанд нэмлээ ✅', 'success');
            } else {
                const label = {
                    code: String(data.code),
                    name: data.extractedName || '',
                    brand: data.extractedBrand || '',
                    price: Number(data.extractedPrice) || 0,
                    originalPrice: Number(data.extractedOriginalPrice) || 0,
                    unitSize: data.unitSize || data.extractedBundleInfo || '',
                    scannedAt: new Date().toISOString(),
                };
                addScannedLabel(label);
                setResult({ found: false, label });
                showToast('Бараа олдсонгүй — шошгоны мэдээллийг хадгаллаа 📝', 'info');
            }
        } catch (err) {
            setError(err.message || 'Уншихад алдаа гарлаа. Дахин оролдоно уу.');
        } finally {
            setLoading(false); setMessage('');
        }
    };

    const reset = () => { setResult(null); setError(null); };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div
                className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <ScanLine size={20} className="text-costco-blue" />
                        <h2 className="font-bold text-gray-900">Шошго унших</h2>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5">
                    {/* Hidden inputs */}
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
                    <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

                    {loading ? (
                        <div className="py-10 flex flex-col items-center text-center">
                            <Loader2 size={36} className="text-costco-blue animate-spin mb-3" />
                            <p className="text-sm font-semibold text-gray-700">{message}</p>
                        </div>
                    ) : result ? (
                        <div className="text-center py-4">
                            {result.found ? (
                                <>
                                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                        <Check size={28} />
                                    </div>
                                    <p className="font-bold text-gray-900">Манай дэлгүүрт байна!</p>
                                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{result.product.name || result.product.name_mn}</p>
                                    <p className="text-xs text-emerald-600 font-semibold mt-2">Хадгалсан жагсаалтад нэмэгдлээ.</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
                                        <BadgeHelp size={28} />
                                    </div>
                                    <p className="font-bold text-gray-900">Одоогоор байхгүй бараа</p>
                                    <p className="text-sm text-gray-600 mt-1 font-semibold">{result.label.name || 'Нэр уншигдсангүй'}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">Код: {result.label.code}{result.label.price ? ` • ${result.label.price.toLocaleString()}₩` : ''}</p>
                                    <p className="text-xs text-sky-600 font-semibold mt-2">Шошгоны мэдээллийг хадгаллаа.</p>
                                </>
                            )}
                            <div className="flex gap-2 mt-5">
                                <button onClick={reset} className="flex-1 py-3 rounded-xl bg-costco-blue text-white font-bold text-sm active:scale-95 transition">
                                    Дахин унших
                                </button>
                                <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm active:scale-95 transition">
                                    Болсон
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-500 mb-4 leading-relaxed text-center">
                                Costco дэлгүүрийн лангуун дээрх <b>үнийн шошгыг</b> камераар уншуулаарай. Манайд байвал Хадгалсанд нэмнэ, байхгүй бол мэдээллийг нь тэмдэглэнэ.
                            </p>
                            {error && (
                                <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium text-center">{error}</div>
                            )}
                            <button
                                onClick={() => cameraRef.current?.click()}
                                className="w-full py-4 mb-3 rounded-2xl bg-costco-blue text-white font-bold flex items-center justify-center gap-2 active:scale-98 transition shadow-lg shadow-blue-600/15"
                            >
                                <Camera size={20} /> Камераар зураг дарах
                            </button>
                            <button
                                onClick={() => galleryRef.current?.click()}
                                className="w-full py-4 rounded-2xl bg-gray-100 text-gray-700 font-bold flex items-center justify-center gap-2 active:scale-98 transition"
                            >
                                <Upload size={20} /> Зургийн сангаас сонгох
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
