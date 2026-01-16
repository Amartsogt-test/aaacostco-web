import { useEffect, useRef, useState } from 'react';
import { X, RotateCw, Save, Scan, ChevronRight, ArrowLeft, ScanBarcode, Image as ImageIcon, Camera } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getProductWeight } from '../utils/productUtils';

export default function QuickScanModal({ isOpen, onClose }) {
    // Initial state: Not scanning, waiting for user choice
    const [isScanning, setIsScanning] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [scannedCode, setScannedCode] = useState(null);
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(false);

    // Edit Form State
    const [price, setPrice] = useState('');
    const [originalPrice, setOriginalPrice] = useState('');
    const [weight, setWeight] = useState('');
    const [discountEndDate, setDiscountEndDate] = useState('');
    const [isFeatured, setIsFeatured] = useState(false);

    const html5QrCodeRef = useRef(null);

    // Stop any active scanner instance
    const stopScanner = async () => {
        if (html5QrCodeRef.current) {
            try {
                if (html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                }
                html5QrCodeRef.current.clear();
            } catch (e) {
                console.warn("Stop error:", e);
            }
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        setCameraError('');

        // Ensure any running camera is stopped before file scan
        await stopScanner();
        setIsScanning(false);

        try {
            // Use a separate instance for file scan to ensure clean state
            const html5QrCode = new Html5Qrcode("quick-reader-file");
            const decodedText = await html5QrCode.scanFile(file, true);
            console.log("File scan success:", decodedText);
            handleScan(decodedText);
        } catch (err) {
            console.error("File scan error:", err);
            setLoading(false);
            setScannedCode(null);
            alert('Зургийг унших үед алдаа гарлаа эсвэл код олдсонгүй.\n(Supported formats: EAN, UPC, CODE128, CODE39, QR)');
        } finally {
            // Clear the input so the same file can be selected again if needed
            e.target.value = '';
        }
    };

    const startScannerLogic = async () => {
        setCameraError('');

        // Cleanup first
        await stopScanner();

        try {
            // Wait slightly for DOM
            if (!document.getElementById("quick-reader")) return;

            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length) {
                const html5QrCode = new Html5Qrcode("quick-reader");
                html5QrCodeRef.current = html5QrCode;

                await html5QrCode.start(
                    { facingMode: "environment" },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                        formatsToSupport: [
                            Html5QrcodeSupportedFormats.EAN_13,
                            Html5QrcodeSupportedFormats.EAN_8,
                            Html5QrcodeSupportedFormats.UPC_A,
                            Html5QrcodeSupportedFormats.CODE_128,
                            Html5QrcodeSupportedFormats.QR_CODE,
                            Html5QrcodeSupportedFormats.CODE_39
                        ],
                        videoConstraints: {
                            facingMode: "environment",
                            focusMode: "continuous",
                            advanced: [{ focusMode: "continuous" }]
                        }
                    },
                    (decodedText) => {
                        handleScan(decodedText);
                    },
                    () => {
                        // ignore frame errors 
                    }
                );
            } else {
                setCameraError('Камер олдсонгүй (No cameras found).');
            }
        } catch (err) {
            console.error("Error starting scanner:", err);
            setCameraError(`Камерын алдаа: ${err.message || err}`);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        if (isScanning) {
            const timer = setTimeout(startScannerLogic, 300);
            return () => clearTimeout(timer);
        } else {
            // If not scanning, ensure we stop
            stopScanner();
        }

        return () => {
            if (html5QrCodeRef.current) {
                html5QrCodeRef.current.stop().catch(e => console.warn("Cleanup error:", e));
            }
        };
    }, [isOpen, isScanning]);


    const handleScan = async (code) => {
        await stopScanner();
        setIsScanning(false);
        setScannedCode(code);
        setLoading(true);

        // Barcode Logic
        const candidates = [
            code,
            code.slice(0, -1),
            code.startsWith('0') ? code.slice(1, -1) : null
        ].filter(Boolean);

        try {
            let foundDocs = [];
            const collectionRef = collection(db, 'products');

            for (const cand of candidates) {
                const q1 = query(collectionRef, where('id', '==', cand));
                const snap1 = await getDocs(q1);
                if (!snap1.empty) {
                    foundDocs = [snap1.docs[0]];
                    break;
                }
                const q2 = query(collectionRef, where('id', '==', `cos_${cand}`));
                const snap2 = await getDocs(q2);
                if (!snap2.empty) {
                    foundDocs = [snap2.docs[0]];
                    break;
                }
            }

            if (foundDocs.length > 0) {
                const pData = foundDocs[0].data();
                setProduct({ ...pData, docId: foundDocs[0].id });
                setPrice(pData.price || '');
                setOriginalPrice(pData.originalPrice || '');

                // Weight Logic: Use DB weight if exists, otherwise try to calculate
                if (pData.weight) {
                    setWeight(pData.weight);
                } else {
                    const wInfo = getProductWeight(pData);
                    let calcWeight = '';
                    if (wInfo && wInfo.value) {
                        // Extract number from "1.5kg" or "14.4kg = 0.6 x 24"
                        const valStr = wInfo.value;
                        const equalsMatch = valStr.match(/=\s*(\d+(?:\.\d+)?)/);
                        const simpleMatch = valStr.match(/(\d+(?:\.\d+)?)/);

                        if (equalsMatch) calcWeight = equalsMatch[1];
                        else if (simpleMatch) calcWeight = simpleMatch[1];
                    }
                    setWeight(calcWeight);
                }

                setIsFeatured(pData.additionalCategories?.includes('Featured') || false);

                // Format date for input datetime-local (YYYY-MM-DDTHH:mm)
                if (pData.discountEndDate) {
                    try {
                        const date = pData.discountEndDate.toDate ? pData.discountEndDate.toDate() : new Date(pData.discountEndDate);
                        // Adjust to local timezone iso string for input
                        const iso = date.toISOString().slice(0, 16);
                        setDiscountEndDate(iso);
                    } catch {
                        setDiscountEndDate('');
                    }
                } else {
                    setDiscountEndDate('');
                }
            } else {
                setProduct(null); // Not found
            }
        } catch (error) {
            console.error("Search error:", error);
            setProduct(null);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!product || !product.docId) return;

        setLoading(true);
        try {
            const productRef = doc(db, 'products', product.docId);

            const updatePayload = {
                price: Number(price),
                originalPrice: originalPrice ? Number(originalPrice) : null,
                weight: Number(weight),
                isManualPrice: true, // Prevent scraper from overwriting
                updatedAt: serverTimestamp(),
                lastAdminUpdate: serverTimestamp()
            };

            if (discountEndDate) {
                updatePayload.discountEndDate = new Date(discountEndDate).toISOString();
                updatePayload.discountEndsAt = new Date(discountEndDate).toISOString(); // Legacy support
            } else {
                updatePayload.discountEndDate = null;
                updatePayload.discountEndsAt = null;
            }

            // Featured Logic
            let newCategories = [...(product.additionalCategories || [])];
            if (isFeatured) {
                if (!newCategories.includes('Featured')) newCategories.push('Featured');
            } else {
                newCategories = newCategories.filter(c => c !== 'Featured');
            }
            updatePayload.additionalCategories = newCategories;

            await updateDoc(productRef, updatePayload);

            alert('Амжилттай хадгаллаа! ✅');
            handleReset(); // Ready for next
        } catch (error) {
            console.error("Save failed:", error);
            alert("Хадгалахад алдаа гарлаа: " + error.message);
            setLoading(false);
        }
    };

    // Reset to "Ready to scan" state
    const handleReset = () => {
        setProduct(null);
        setScannedCode(null);
        setPrice('');
        setOriginalPrice('');
        setWeight('');
        setDiscountEndDate('');
        setIsFeatured(false);
        setIsScanning(false);
        stopScanner();
    }

    const handleClose = () => {
        stopScanner();
        onClose();
        setProduct(null);
        setIsScanning(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden relative flex flex-col max-h-[90vh] shadow-2xl">
                {/* Header */}
                <div className="p-4 flex items-center justify-between text-white bg-gray-900 border-b border-gray-800 shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <Scan className="text-blue-400" />
                        Турбо Засвар
                    </h3>
                    <button onClick={handleClose} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700">
                        <X size={20} />
                    </button>
                </div>

                {/* Main Content Area - Dynamic Content */}
                <div className="flex-1 flex flex-col relative overflow-hidden bg-white min-h-[300px]">

                    {/* 1. Camera View */}
                    {isScanning && (
                        <div className="flex-1 flex flex-col items-center justify-center bg-black relative">
                            {cameraError ? (
                                <div className="text-center w-full max-w-sm px-4">
                                    <div className="text-red-400 mb-6 bg-red-900/20 p-4 rounded-xl border border-red-900/50">
                                        <p className="font-bold mb-1">Камерын алдаа</p>
                                        <p className="text-sm opacity-80">{cameraError}</p>
                                    </div>
                                </div>
                            ) : (
                                <div id="quick-reader" className="w-full h-full object-cover"></div>
                            )}
                        </div>
                    )}

                    {/* 2. Loading State */}
                    {!isScanning && loading && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-900/80 text-white backdrop-blur-sm">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
                            <p>Уншиж байна...</p>
                        </div>
                    )}

                    {/* 3. Product Found Form */}
                    {!isScanning && product && (
                        <div className="flex-1 bg-gray-50 flex flex-col p-4 overflow-y-auto">
                            <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-4">
                                <div className="flex gap-4 border-b border-gray-100 pb-4">
                                    <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                                        <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-400 font-mono mb-1">{product.id}</div>
                                        <h2 className="font-bold text-gray-900 line-clamp-2 leading-tight">{product.name_mn || product.name}</h2>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Хямдралтай Үнэ (₩)</label>
                                        <input
                                            type="number"
                                            value={price}
                                            onChange={e => setPrice(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-lg font-bold text-red-600 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="Одоогийн зарах үнэ"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Үндсэн Үнэ (₩)</label>
                                        <input
                                            type="number"
                                            value={originalPrice}
                                            onChange={e => setOriginalPrice(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="Хямдрахын өмнөх"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Жин (кг)</label>
                                        <input
                                            type="number"
                                            value={weight}
                                            onChange={e => setWeight(e.target.value)}
                                            step="0.1"
                                            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Хямдрал дуусах</label>
                                        <input
                                            type="datetime-local"
                                            value={discountEndDate}
                                            onChange={e => setDiscountEndDate(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-2 py-3 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Featured Toggle */}
                                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-200">
                                    <span className="font-bold text-gray-700 flex items-center gap-2">
                                        <div className="bg-costco-red text-white rounded-full p-0.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                        </div>
                                        Онцлох
                                    </span>
                                    <button
                                        onClick={() => setIsFeatured(!isFeatured)}
                                        className={`w-14 h-8 rounded-full transition-colors relative ${isFeatured ? 'bg-yellow-400' : 'bg-gray-300'}`}
                                    >
                                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${isFeatured ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 4. Not Found / Initial Dashboard View */}
                    {!isScanning && !loading && !product && (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center">
                            {scannedCode ? (
                                <>
                                    <ScanBarcode size={48} className="text-red-400" />
                                    <h3 className="text-xl font-bold text-gray-900">Бараа олдсонгүй</h3>
                                    <p className="font-mono bg-gray-100 px-3 py-1 rounded text-lg">{scannedCode}</p>
                                    <p className="text-gray-500 text-sm">Дахин оролдоно уу эсвэл өөр код уншуулна уу.</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-2 animate-pulse">
                                        <Scan size={40} className="text-blue-600" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-800">Баркод уншуулахад бэлэн</h3>
                                    <p className="text-gray-500 text-sm max-w-[200px]">Доорх товчнуудыг ашиглан камераар эсвэл зургаар уншуулна уу.</p>
                                </>
                            )}
                        </div>
                    )}

                    {/* Hidden file reader - Essential for scanFile */}
                    <div id="quick-reader-file" className="hidden"></div>
                </div>

                {/* 5. PERSISTENT FIXED FOOTER */}
                <div className="p-4 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-20 shrink-0">
                    <div className="flex flex-col gap-3">
                        {/* 1. Save (Primary) */}
                        {(() => {
                            // Check for changes
                            const currentPrice = Number(price);
                            const initialPrice = Number(product?.price || 0);

                            const currentOriginal = Number(originalPrice);
                            const initialOriginal = Number(product?.originalPrice || 0);

                            const currentWeight = Number(weight);
                            const initialWeight = Number(product?.weight || 0);

                            // Date comparison
                            let initialDate = '';
                            if (product && product.discountEndDate) {
                                try {
                                    const d = product.discountEndDate.toDate ? product.discountEndDate.toDate() : new Date(product.discountEndDate);
                                    initialDate = d.toISOString().slice(0, 16);
                                } catch { /* ignore date parse error */ }
                            }

                            const hasChanges = product && (
                                currentPrice !== initialPrice ||
                                currentOriginal !== initialOriginal ||
                                currentWeight !== initialWeight ||
                                discountEndDate !== initialDate ||
                                isFeatured !== (product.additionalCategories?.includes('Featured') || false)
                            );

                            return (
                                <button
                                    onClick={handleSave}
                                    disabled={!product || !hasChanges} // Disabled if no product OR no changes
                                    className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition
                                        ${product && hasChanges
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 active:scale-[0.98]'
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}
                                    `}
                                >
                                    <Save size={20} />
                                    Save & Next
                                </button>
                            );
                        })()}

                        {/* Middle Action Grid */}
                        <div className="grid grid-cols-3 gap-3">
                            {/* 1. Back (Reset) */}
                            <button
                                onClick={handleReset}
                                className="flex flex-col items-center justify-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-bold text-xs active:scale-[0.98] transition"
                            >
                                <ArrowLeft size={20} />
                                <span>Back</span>
                            </button>

                            {/* 2. Gallery (Upload) */}
                            <label className="flex flex-col items-center justify-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-bold text-xs cursor-pointer active:scale-[0.98] transition">
                                <ImageIcon size={20} className="text-blue-600" />
                                <span>Gallery</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                    tabIndex={-1}
                                />
                            </label>

                            {/* 3. Reader (Camera) */}
                            <button
                                onClick={() => setIsScanning(true)}
                                className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl font-bold text-xs active:scale-[0.98] transition
                                    ${isScanning ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' : 'bg-gray-800 hover:bg-gray-900 text-white'}
                                `}
                            >
                                <ScanBarcode size={20} />
                                <span>Reader</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
