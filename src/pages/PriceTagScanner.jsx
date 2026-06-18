import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { callFunction, ensureSignedIn, db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { productService } from '../services/productService';
import { useUIStore } from '../store/uiStore';
import {
    Camera, Upload, ArrowLeft, Check, X, RefreshCw,
    AlertTriangle, Package, Calendar, Info, Layers, 
    Ruler, ShieldAlert, BadgeHelp 
} from 'lucide-react';

const INITIAL_FORM = {
    code: '',
    extractedName: '',
    extractedBrand: '',
    packageQuantity: 1,
    packageUnit: '개',
    extractedBundleInfo: '',
    unitSize: '',
    extractedPrice: 0,
    extractedOriginalPrice: 0,
    extractedDiscount: 0,
    hasDiscount: false,
    restockStatus: 'normal',
    weightKg: '',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    extractedSpecs: ''
};

export default function PriceTagScanner() {
    const navigate = useNavigate();
    const { showToast } = useUIStore();

    // UI States
    const [imagePreview, setImagePreview] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState(null);
    const [step, setStep] = useState(1); // 1: Capture, 2: Review & Compare

    // Data States
    const [, setExtractedData] = useState(null);
    const [dbProduct, setDbProduct] = useState(null);
    const [formData, setFormData] = useState(INITIAL_FORM);

    const cameraInputRef = useRef(null);
    const galleryInputRef = useRef(null);

    // Resizes image and converts to base64
    const handleImageProcessing = (file) => {
        if (!file) return;

        setIsLoading(true);
        setLoadingMessage('Зургийг бэлтгэж байна...');
        setError(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            setImagePreview(e.target.result);

            // Compress image using canvas
            const img = new Image();
            img.onerror = () => {
                setIsLoading(false);
                setError('Зураг уншихад алдаа гарлаа. Өөр зураг сонгоно уу (HEIC дэмжихгүй байж болзошгүй).');
            };
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Max dimensions 1000px
                const MAX_WIDTH = 1000;
                const MAX_HEIGHT = 1000;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to compressed jpeg base64
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                // Strip metadata prefix (data:image/jpeg;base64,)
                const base64Data = compressedBase64.split(',')[1];

                callAIScanner(base64Data);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    const handleCameraClick = () => {
        cameraInputRef.current.click();
    };

    const handleGalleryClick = () => {
        galleryInputRef.current.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageProcessing(file);
        }
    };

    // Invoke Cloud Function
    const callAIScanner = async (base64Data) => {
        setLoadingMessage('AI сканнер шошгыг шинжилж байна...');
        try {
            await ensureSignedIn(); // aiProxy requires an authenticated caller
            const response = await callFunction('aiProxy', {
                action: 'extractPriceTag',
                payload: { imageBase64: base64Data }
            });

            const data = response.data;
            if (!data || !data.code) {
                throw new Error('Шошгоны мэдээлэл уншихад алдаа гарлаа. Барааны код олдсонгүй.');
            }

            setExtractedData(data);
            
            // Populate Form State
            const updatedForm = {
                code: data.code,
                extractedName: data.extractedName || '',
                extractedBrand: data.extractedBrand || '',
                packageQuantity: data.packageQuantity !== undefined ? data.packageQuantity : 1,
                packageUnit: data.packageUnit || '개',
                extractedBundleInfo: data.extractedBundleInfo || '',
                unitSize: data.unitSize || '',
                extractedPrice: data.extractedPrice || 0,
                extractedOriginalPrice: data.extractedOriginalPrice || 0,
                extractedDiscount: data.extractedDiscount || 0,
                hasDiscount: !!data.hasDiscount,
                restockStatus: data.restockStatus || 'normal',
                weightKg: data.weightKg !== null && data.weightKg !== undefined ? data.weightKg : '',
                lengthCm: data.dimensions?.lengthCm || '',
                widthCm: data.dimensions?.widthCm || '',
                heightCm: data.dimensions?.heightCm || '',
                extractedSpecs: data.extractedSpecs || ''
            };
            setFormData(updatedForm);

            // Fetch Database match
            setLoadingMessage('Баазаас тухайн барааг хайж байна...');
            const dbMatch = await productService.getProductById(data.code);
            setDbProduct(dbMatch);

            // Move to Step 2
            setIsLoading(false);
            setStep(2);
        } catch (err) {
            console.error('OCR Error:', err);
            setError(err.message || 'Шошгыг унших үед алдаа гарлаа. Та дахин оролдоно уу.');
            setIsLoading(false);
        }
    };

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleNumericChange = (e) => {
        const { name, value } = e.target;
        const parsed = parseFloat(value);
        setFormData(prev => ({
            ...prev,
            [name]: value === '' ? '' : (isNaN(parsed) ? '' : parsed)
        }));
    };

    const handleRestockSelect = (status) => {
        setFormData(prev => ({
            ...prev,
            restockStatus: status
        }));
    };

    // Save changes to Firestore
    const handleSave = async () => {
        setIsLoading(true);
        setLoadingMessage('Баазыг шинэчилж байна...');
        setError(null);

        try {
            const productCode = formData.code;
            const updates = {
                code: productCode,
                productId: productCode,
                brand: formData.extractedBrand,
                name: formData.extractedName,
                // If main name is korean/english, save to target fields too
                name_mn: dbProduct?.name_mn || formData.extractedName,
                englishName: dbProduct?.englishName || formData.extractedBrand + ' ' + formData.extractedName,
                
                // Prices
                price: Number(formData.extractedPrice) || 0,
                originalPrice: Number(formData.extractedOriginalPrice) || 0,
                discount: Number(formData.extractedDiscount) || 0,
                hasDiscount: formData.hasDiscount,
                priceKRW: Number(formData.extractedPrice) || 0,
                estimatedWarehousePrice: Number(formData.extractedPrice) || 0,
                manualPriceKRW: Number(formData.extractedPrice) || 0,
                manualOriginalPriceKRW: Number(formData.extractedOriginalPrice) || 0,
                priceUSD: 0,
                currency: 'KRW',

                // Bundle info
                packageQuantity: parseInt(formData.packageQuantity, 10) || 1,
                packageUnit: formData.packageUnit,
                extractedBundleInfo: formData.extractedBundleInfo,
                unitSize: formData.unitSize,

                // Restock status
                restockStatus: formData.restockStatus,

                // Logistics / Dimensions
                weightKg: formData.weightKg !== '' ? parseFloat(formData.weightKg) : null,
                dimensions: formData.lengthCm !== '' || formData.widthCm !== '' || formData.heightCm !== '' ? {
                    lengthCm: formData.lengthCm !== '' ? parseFloat(formData.lengthCm) : null,
                    widthCm: formData.widthCm !== '' ? parseFloat(formData.widthCm) : null,
                    heightCm: formData.heightCm !== '' ? parseFloat(formData.heightCm) : null,
                } : null,

                specifications: formData.extractedSpecs ? [formData.extractedSpecs] : (dbProduct?.specifications || []),
                updatedAt: new Date().toISOString()
            };

            if (dbProduct) {
                // UPDATE
                const productRef = doc(db, 'products', dbProduct.id);
                await updateDoc(productRef, updates);
                
                // Update in special collections if it is currently inside them
                const specialCollections = ['products_sale', 'products_new', 'products_kirkland', 'products_featured'];
                for (const col of specialCollections) {
                    const specDocRef = doc(db, col, dbProduct.id);
                    const specDocSnap = await getDoc(specDocRef);
                    if (specDocSnap.exists()) {
                        await updateDoc(specDocRef, {
                            price: updates.price,
                            originalPrice: updates.originalPrice,
                            hasDiscount: updates.hasDiscount,
                            restockStatus: updates.restockStatus,
                            packageQuantity: updates.packageQuantity,
                            estimatedWarehousePrice: updates.estimatedWarehousePrice,
                            manualPriceKRW: updates.manualPriceKRW,
                            manualOriginalPriceKRW: updates.manualOriginalPriceKRW
                        });
                    }
                }
            } else {
                // CREATE NEW
                const newDocRef = doc(db, 'products', productCode);
                await setDoc(newDocRef, {
                    ...updates,
                    status: 'active',
                    createdAt: new Date().toISOString()
                });
            }

            setIsLoading(false);
            showToast(dbProduct ? 'Бараа амжилттай шинэчлэгдлээ!' : 'Шинэ бараа амжилттай нэмэгдлээ!', 'success');
            resetScanner();
        } catch (err) {
            console.error('Save Error:', err);
            setError('Мэдээлэл хадгалахад алдаа гарлаа: ' + err.message);
            setIsLoading(false);
        }
    };

    const resetScanner = () => {
        setImagePreview(null);
        setExtractedData(null);
        setDbProduct(null);
        setFormData(INITIAL_FORM); // clear last scan so stale fields can't carry over
        setStep(1);
        setError(null);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
            {/* Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md bg-opacity-80">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => step === 2 ? resetScanner() : navigate('/admin')}
                        className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-slate-50 tracking-tight">Үнийн Шошго Сканнер</h1>
                        <p className="text-xs text-slate-400">Gemini AI OCR & Харьцуулалт</p>
                    </div>
                </div>
                {step === 2 && (
                    <button 
                        onClick={resetScanner}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl flex items-center gap-2 transition active:scale-95 border border-slate-700"
                    >
                        <RefreshCw size={14} />
                        Дахин уншуулах
                    </button>
                )}
            </div>

            {/* Error Message */}
            {error && (
                <div className="mx-6 mt-6 p-4 bg-red-950/40 border border-red-800/80 rounded-2xl flex items-start gap-3 text-red-300 animate-fadeIn">
                    <AlertTriangle className="flex-shrink-0 text-red-500" size={20} />
                    <div className="text-sm font-medium">{error}</div>
                </div>
            )}

            {/* LOADING OVERLAY */}
            {isLoading && (
                <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                    <div className="relative mb-6">
                        <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin"></div>
                        <div className="absolute inset-2 w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center">
                            <Camera size={20} className="text-indigo-400 animate-pulse" />
                        </div>
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-1">{loadingMessage}</h3>
                    <p className="text-xs text-slate-500 max-w-xs">AI сканнер үр дүнг боловсруулж байна, түр хүлээнэ үү...</p>
                </div>
            )}

            <div className="flex-1 p-2 sm:p-4 lg:p-6 flex flex-col items-center justify-start sm:justify-center">
                {/* STEP 1: CAPTURE PHOTO */}
                {step === 1 && (
                    <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-3xl p-8 text-center backdrop-blur-lg shadow-2xl">
                        <div className="mb-6 flex justify-center">
                            <div className="w-20 h-20 bg-indigo-950/50 text-indigo-400 rounded-3xl flex items-center justify-center border border-indigo-900/50 shadow-inner">
                                <Camera size={36} />
                            </div>
                        </div>
                        <h2 className="text-xl font-bold text-slate-50 mb-2">Шошгоны зураг оруулах</h2>
                        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                            Costco дэлгүүрийн лангуун дээрх үнийн шошгоны зургийг тодоор дарах буюу файлаар оруулж AI-аар уншуулна уу.
                        </p>

                        <div className="space-y-4">
                            {/* Hidden Inputs */}
                            <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <input
                                ref={galleryInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                            />

                            <button
                                onClick={handleCameraClick}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-indigo-600/15 active:scale-98 transition"
                            >
                                <Camera size={20} />
                                Камер ажиллуулж зураг дарах
                            </button>

                            <button
                                onClick={handleGalleryClick}
                                className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl flex items-center justify-center gap-3 border border-slate-700 active:scale-98 transition"
                            >
                                <Upload size={20} />
                                Зургийн файлаас сонгох
                            </button>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-800/80 flex justify-center gap-6">
                            <div className="text-center">
                                <span className="text-xs text-slate-500 block mb-1">Монгол веб</span>
                                <span className="text-sm font-bold text-indigo-400">costco.mn</span>
                            </div>
                            <div className="w-px h-8 bg-slate-800 align-middle"></div>
                            <div className="text-center">
                                <span className="text-xs text-slate-500 block mb-1">Дэмжих шошго</span>
                                <span className="text-sm font-bold text-emerald-400">KR 🇰🇷 & US 🇺🇸</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 2: REVIEW & COMPARE */}
                {step === 2 && (
                    <div className="w-full max-w-7xl flex flex-col gap-3 sm:gap-4 lg:gap-6 animate-fadeIn">
                        
                        {/* TOP: IMAGES & STATUS */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                            {/* SCANNED IMAGE */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl flex relative h-24 sm:h-36">
                                {imagePreview ? (
                                    <>
                                        <div className="w-1/3 flex flex-col justify-center px-3 sm:px-6 relative z-10 bg-slate-900/80 backdrop-blur-sm">
                                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Зураг</span>
                                            <span className="text-xs sm:text-sm font-semibold text-slate-200">AI уншсан</span>
                                        </div>
                                        <div className="absolute right-0 top-0 bottom-0 w-2/3">
                                            <img src={imagePreview} alt="Scanned" className="w-full h-full object-cover opacity-60" />
                                            <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-transparent to-transparent"></div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full flex items-center justify-center text-slate-500 text-sm">Зураг оруулаагүй байна</div>
                                )}
                            </div>

                            {/* DB STATUS & IMAGE */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-xl flex items-center justify-between h-24 sm:h-36">
                                <div className="flex-1 px-2">
                                    {dbProduct ? (
                                        <div className="flex items-center gap-2 sm:gap-4">
                                            <div className="w-9 h-9 sm:w-12 sm:h-12 bg-emerald-950/60 rounded-lg sm:rounded-xl flex items-center justify-center border border-emerald-900/50 flex-shrink-0">
                                                <Check className="text-emerald-400" size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-slate-50 text-sm sm:text-lg truncate">Баазад Бүртгэлтэй</h3>
                                                <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">Таарах бараа олдлоо</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 sm:gap-4">
                                            <div className="w-9 h-9 sm:w-12 sm:h-12 bg-sky-950/60 rounded-lg sm:rounded-xl flex items-center justify-center border border-sky-900/50 flex-shrink-0">
                                                <BadgeHelp className="text-sky-400" size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-slate-50 text-sm sm:text-lg truncate">Шинэ Бараа</h3>
                                                <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">Скан кодоор олдсонгүй</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {dbProduct && dbProduct.image && (
                                    <div className="h-full aspect-square bg-slate-950 rounded-2xl p-2 border border-slate-800 shadow-inner">
                                        <img src={dbProduct.image} alt="DB" className="w-full h-full object-contain rounded-xl hover:scale-105 transition-transform" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* BOTTOM: FULL WIDTH FORM */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                            {/* Sticky Header with Actions */}
                            <div className="bg-slate-900/95 backdrop-blur-xl px-3 py-2.5 sm:px-6 sm:py-4 flex items-center justify-between border-b border-slate-800 sticky top-0 z-20 gap-2">
                                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                    <div className="w-7 h-7 sm:w-9 sm:h-9 bg-indigo-950/60 rounded-lg flex items-center justify-center border border-indigo-900/50 flex-shrink-0">
                                        <Package size={14} className="text-indigo-400" />
                                    </div>
                                    <h3 className="font-bold text-slate-50 text-xs sm:text-sm truncate">
                                        Хянах {dbProduct && <span className="hidden sm:inline text-indigo-400 font-medium text-[10px] border border-indigo-500/30 px-2 py-0.5 rounded-full bg-indigo-500/10 uppercase">AI vs Бааз</span>}
                                    </h3>
                                </div>
                                <div className="flex gap-1.5 sm:gap-3 flex-shrink-0">
                                    <button onClick={resetScanner} className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg sm:rounded-xl text-[10px] sm:text-xs border border-slate-700 active:scale-95 transition">Цуцлах</button>
                                    <button onClick={handleSave} className="px-3 sm:px-6 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg sm:rounded-xl text-[10px] sm:text-xs flex items-center gap-1 sm:gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition">
                                        <Check size={12} /> {dbProduct ? 'Хадгалах' : 'Бүртгэх'}
                                    </button>
                                </div>
                            </div>

                            {/* Forms - Compact Layout */}
                            <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-5 lg:space-y-6">
                                
                                {/* ROW 1: Code, Brand, Name */}
                                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-6">
                                    {/* Code */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Код</label>
                                        <input type="text" name="code" value={formData.code} onChange={handleFormChange} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 font-bold text-xs sm:text-sm outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="text" readOnly value={dbProduct.code || dbProduct.productId || ''} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 font-bold text-[10px] sm:text-xs outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>
                                    {/* Brand */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Брэнд</label>
                                        <input type="text" name="extractedBrand" value={formData.extractedBrand} onChange={handleFormChange} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 font-medium text-xs sm:text-sm outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="text" readOnly value={dbProduct.brand || ''} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 font-medium text-[10px] sm:text-xs outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>
                                    {/* Name */}
                                    <div className="col-span-2 sm:col-span-2 lg:col-span-1">
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Барааны нэр</label>
                                        <input type="text" name="extractedName" value={formData.extractedName} onChange={handleFormChange} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 font-bold text-xs sm:text-sm outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="text" readOnly value={dbProduct.name || dbProduct.name_mn || ''} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 font-bold text-[10px] sm:text-xs outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>
                                </div>

                                <div className="border-t border-slate-800/60"></div>

                                {/* ROW 2: Prices & Restock */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                                    {/* Restock Status */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide flex items-center gap-1">
                                            <ShieldAlert size={11} className="text-slate-400" /> Нийлүүлэлт
                                        </label>
                                        <div className="grid grid-cols-1">
                                            <div className="grid grid-cols-3 gap-1">
                                                <button type="button" onClick={() => handleRestockSelect('normal')} className={`py-2 px-1 text-[10px] font-bold rounded-lg border transition active:scale-95 ${formData.restockStatus === 'normal' ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}`}>Хэвийн</button>
                                                <button type="button" onClick={() => handleRestockSelect('no_restock')} className={`py-2 px-1 text-[10px] font-bold rounded-lg border transition active:scale-95 ${formData.restockStatus === 'no_restock' ? 'bg-red-950/40 border-red-500 text-red-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}`}>Ирэхгүй</button>
                                                <button type="button" onClick={() => handleRestockSelect('uncertain')} className={`py-2 px-1 text-[10px] font-bold rounded-lg border transition active:scale-95 ${formData.restockStatus === 'uncertain' ? 'bg-amber-950/40 border-amber-500 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}`}>Тодорхойгүй</button>
                                            </div>
                                            {dbProduct && (
                                                <div className="bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center opacity-60">
                                                    <span className="text-[11px] font-bold text-slate-400">
                                                        {dbProduct.restockStatus === 'no_restock' ? '⚠️ Ирэхгүй' : dbProduct.restockStatus === 'uncertain' ? '⏳ Тодорхойгүй' : '✅ Хэвийн'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Final Price */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Эцсийн үнэ (₩)</label>
                                        <input type="number" name="extractedPrice" value={formData.extractedPrice} onChange={handleNumericChange} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 font-bold text-xs sm:text-sm outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="number" readOnly value={dbProduct.price || 0} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 font-bold text-[10px] sm:text-xs outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>

                                    {/* Original Price */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Үндсэн үнэ (₩)</label>
                                        <input type="number" name="extractedOriginalPrice" value={formData.extractedOriginalPrice} onChange={handleNumericChange} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 font-bold text-xs sm:text-sm outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="number" readOnly value={dbProduct.originalPrice || 0} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 font-bold text-[10px] sm:text-xs outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>
                                </div>

                                <div className="border-t border-slate-800/60"></div>

                                {/* ROW 3: Discounts & Package Info */}
                                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-6">
                                    {/* Discount Amount */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Хямдрал</label>
                                        <input type="number" name="extractedDiscount" value={formData.extractedDiscount} onChange={handleNumericChange} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 text-xs sm:text-sm font-semibold outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="number" readOnly value={dbProduct.discount || 0} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 text-[10px] sm:text-xs font-semibold outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>

                                    {/* Has Discount Checkbox */}
                                    <div className="flex items-end pb-1 sm:pb-2">
                                        <div>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" name="hasDiscount" checked={formData.hasDiscount} onChange={handleFormChange} className="w-4 h-4 bg-slate-950 border border-slate-800 rounded text-indigo-500 outline-none focus:ring-0 focus:ring-offset-0" />
                                                <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase">Хямдралтай</span>
                                            </label>
                                            {dbProduct && (
                                                <span className="text-[10px] font-bold text-slate-500 opacity-50 mt-1 block">
                                                    {dbProduct.hasDiscount ? '☑ Тийм' : '☐ Үгүй'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Package Qty */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Ширхэг</label>
                                        <input type="number" name="packageQuantity" value={formData.packageQuantity} onChange={handleNumericChange} min="1" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 font-bold text-xs sm:text-sm outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="number" readOnly value={dbProduct.packageQuantity || 1} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 font-bold text-[10px] sm:text-xs outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>

                                    {/* Package Unit */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Нэгж</label>
                                        <input type="text" name="packageUnit" value={formData.packageUnit} onChange={handleFormChange} placeholder="개, 팩" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 text-xs sm:text-sm font-semibold outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="text" readOnly value={dbProduct.packageUnit || ''} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 text-[10px] sm:text-xs font-semibold outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>
                                </div>

                                <div className="border-t border-slate-800/60"></div>

                                {/* ROW 4: Sizes & Logistics */}
                                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-6">
                                    {/* Bundle Info Raw */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Багц (Raw)</label>
                                        <input type="text" name="extractedBundleInfo" value={formData.extractedBundleInfo} onChange={handleFormChange} placeholder="940G X 2" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 text-xs sm:text-sm font-semibold outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="text" readOnly value={dbProduct.extractedBundleInfo || ''} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 text-[10px] sm:text-xs font-semibold outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>

                                    {/* Unit Size */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Хэмжээ</label>
                                        <input type="text" name="unitSize" value={formData.unitSize} onChange={handleFormChange} placeholder="940G" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 text-xs sm:text-sm font-semibold outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="text" readOnly value={dbProduct.unitSize || ''} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 text-[10px] sm:text-xs font-semibold outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>

                                    {/* Weight */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Жин (kg)</label>
                                        <input type="number" step="any" name="weightKg" value={formData.weightKg} onChange={handleNumericChange} placeholder="1.88" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-100 font-bold text-xs sm:text-sm outline-none focus:border-indigo-500 transition" />
                                        {dbProduct && <input type="text" readOnly value={dbProduct.weightKg || ''} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-slate-500 font-bold text-[10px] sm:text-xs outline-none cursor-not-allowed opacity-50 mt-1" />}
                                    </div>

                                    {/* Dimensions */}
                                    <div>
                                        <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">У/Ө/Ө (cm)</label>
                                        <div className="grid grid-cols-3 gap-1">
                                            <input type="number" name="lengthCm" value={formData.lengthCm} onChange={handleNumericChange} placeholder="У" title="Урт" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1 py-1.5 sm:py-2 text-center text-slate-100 text-[10px] sm:text-xs outline-none focus:border-indigo-500 transition" />
                                            <input type="number" name="widthCm" value={formData.widthCm} onChange={handleNumericChange} placeholder="Ө" title="Өргөн" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1 py-1.5 sm:py-2 text-center text-slate-100 text-[10px] sm:text-xs outline-none focus:border-indigo-500 transition" />
                                            <input type="number" name="heightCm" value={formData.heightCm} onChange={handleNumericChange} placeholder="Ө" title="Өндөр" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1 py-1.5 sm:py-2 text-center text-slate-100 text-[10px] sm:text-xs outline-none focus:border-indigo-500 transition" />
                                        </div>
                                        {dbProduct && dbProduct.dimensions && (
                                            <div className="mt-1 text-[10px] font-semibold text-slate-500 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 flex items-center justify-center opacity-60">
                                                Бааз: {dbProduct.dimensions.lengthCm || '-'} x {dbProduct.dimensions.widthCm || '-'} x {dbProduct.dimensions.heightCm || '-'}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Raw Specs Textarea */}
                                <div>
                                    <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1 sm:mb-1.5 uppercase tracking-wide">Specs</label>
                                    <textarea name="extractedSpecs" value={formData.extractedSpecs} onChange={handleFormChange} rows="2" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-slate-300 font-medium text-[10px] sm:text-xs outline-none focus:border-indigo-500 transition resize-none custom-scrollbar" placeholder="▶크기: 545 X 1,430 X 600MM..." />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
</div>
        </div>
    );
}
