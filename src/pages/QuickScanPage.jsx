import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RotateCw, Save, Scan, ScanBarcode, Image as ImageIcon } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getProductWeight, cleanBarcode } from '../utils/productUtils';

export default function QuickScanPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const urlCode = searchParams.get('code');

    const [isScanning, setIsScanning] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [scannedCode, setScannedCode] = useState(null);
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(false);

    // Initial load from URL
    useEffect(() => {
        if (urlCode) {
            handleScan(cleanBarcode(urlCode));
        }
    }, [urlCode]);

    const [price, setPrice] = useState('');
    const [originalPrice, setOriginalPrice] = useState('');
    const [weight, setWeight] = useState('');
    const [discountEndDate, setDiscountEndDate] = useState('');
    const [isFeatured, setIsFeatured] = useState(false);

    const html5QrCodeRef = useRef(null);

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
        await stopScanner();
        setIsScanning(false);

        try {
            const html5QrCode = new Html5Qrcode("quick-reader-file");
            const decodedText = await html5QrCode.scanFile(file, true);
            handleScan(decodedText);
        } catch (err) {
            console.error("File scan error:", err);
            setLoading(false);
            alert('Зургийг унших үед алдаа гарлаа эсвэл код олдсонгүй.');
        } finally {
            e.target.value = '';
        }
    };

    const startScannerLogic = async () => {
        setCameraError('');
        await stopScanner();

        try {
            if (!document.getElementById("quick-reader")) return;

            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length) {
                const html5QrCode = new Html5Qrcode("quick-reader");
                html5QrCodeRef.current = html5QrCode;

                const basicConfig = {
                    fps: 15,
                    qrbox: { width: 300, height: 200 },
                    aspectRatio: 1.0,
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.QR_CODE,
                        Html5QrcodeSupportedFormats.CODE_39
                    ],
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true
                    }
                };

                await html5QrCode.start(
                    { facingMode: "environment" },
                    basicConfig,
                    (decodedText) => handleScan(decodedText),
                    () => { }
                );
            } else {
                setCameraError('Камер олдсонгүй.');
            }
        } catch (err) {
            console.error("Error starting scanner:", err);
            setCameraError(`Камер нээхэд алдаа гарлаа. Зөвшөөрлөө шалгана уу.`);
        }
    };

    useEffect(() => {
        if (isScanning) {
            const timer = setTimeout(startScannerLogic, 300);
            return () => clearTimeout(timer);
        } else {
            stopScanner();
        }

        return () => {
            if (html5QrCodeRef.current) {
                html5QrCodeRef.current.stop().catch(e => console.warn("Cleanup error:", e));
            }
        };
    }, [isScanning]);

    const handleScan = async (rawCode) => {
        await stopScanner();
        setIsScanning(false);
        const code = cleanBarcode(rawCode);
        setScannedCode(code);
        setLoading(true);

        const candidates = [code, code.slice(0, -1), code.startsWith('0') ? code.slice(1, -1) : null].filter(Boolean);

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

                if (pData.weight) {
                    setWeight(pData.weight);
                } else {
                    const wInfo = getProductWeight(pData);
                    let calcWeight = '';
                    if (wInfo && wInfo.value) {
                        const valStr = wInfo.value;
                        const equalsMatch = valStr.match(/=\s*(\d+(?:\.\d+)?)/);
                        const simpleMatch = valStr.match(/(\d+(?:\.\d+)?)/);
                        if (equalsMatch) calcWeight = equalsMatch[1];
                        else if (simpleMatch) calcWeight = simpleMatch[1];
                    }
                    setWeight(calcWeight);
                }

                setIsFeatured(pData.additionalCategories?.includes('Featured') || false);

                if (pData.discountEndDate) {
                    try {
                        const date = pData.discountEndDate.toDate ? pData.discountEndDate.toDate() : new Date(pData.discountEndDate);
                        setDiscountEndDate(date.toISOString().slice(0, 16));
                    } catch {
                        setDiscountEndDate('');
                    }
                } else {
                    setDiscountEndDate('');
                }
            } else {
                setProduct(null);
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
                isManualPrice: true,
                updatedAt: serverTimestamp(),
                lastAdminUpdate: serverTimestamp()
            };

            if (discountEndDate) {
                updatePayload.discountEndDate = new Date(discountEndDate).toISOString();
                updatePayload.discountEndsAt = new Date(discountEndDate).toISOString();
            } else {
                updatePayload.discountEndDate = null;
                updatePayload.discountEndsAt = null;
            }

            let newCategories = [...(product.additionalCategories || [])];
            if (isFeatured) {
                if (!newCategories.includes('Featured')) newCategories.push('Featured');
            } else {
                newCategories = newCategories.filter(c => c !== 'Featured');
            }
            updatePayload.additionalCategories = newCategories;

            await updateDoc(productRef, updatePayload);
            alert('Амжилттай хадгаллаа! ✅');
            handleReset();
        } catch (error) {
            console.error("Save failed:", error);
            alert("Хадгалахад алдаа гарлаа: " + error.message);
            setLoading(false);
        }
    };

    const handleReset = () => {
        if (!product && !scannedCode && !isScanning) {
            navigate(-1);
            return;
        }

        setProduct(null);
        setScannedCode(null);
        setPrice('');
        setOriginalPrice('');
        setWeight('');
        setDiscountEndDate('');
        setIsFeatured(false);
        setIsScanning(false);
        stopScanner();
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col">
            {/* Header Removed */}

            {/* Main Content */}
            <div className="flex-1 flex flex-col max-w-lg mx-auto w-full">
                {/* Camera View */}
                {isScanning && (
                    <div className="flex-1 flex flex-col items-center justify-center bg-black relative min-h-[300px]">
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

                {/* Loading State */}
                {!isScanning && loading && (
                    <div className="flex-1 flex flex-col items-center justify-center bg-gray-900/80 text-white min-h-[300px]">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
                        <p>Уншиж байна...</p>
                    </div>
                )}

                {/* Product Found Form */}
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
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Үндсэн Үнэ (₩)</label>
                                    <input
                                        type="number"
                                        value={originalPrice}
                                        onChange={e => setOriginalPrice(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
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
                                <span className="font-bold text-gray-700">⭐ Онцлох</span>
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

                {/* Initial/Not Found View */}
                {!isScanning && !loading && !product && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center bg-gray-800 min-h-[300px]">
                        {scannedCode ? (
                            <>
                                <ScanBarcode size={48} className="text-red-400" />
                                <h3 className="text-xl font-bold text-white">Бараа олдсонгүй</h3>
                                <p className="font-mono bg-gray-700 text-white px-3 py-1 rounded text-lg">{scannedCode}</p>
                            </>
                        ) : (
                            <>
                                <div className="w-20 h-20 bg-blue-900/50 rounded-full flex items-center justify-center mb-2 animate-pulse">
                                    <Scan size={40} className="text-blue-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white">Баркод уншуулахад бэлэн</h3>
                                <p className="text-gray-400 text-sm">Доорх товчнуудыг ашиглана уу</p>
                            </>
                        )}
                    </div>
                )}

                {/* Hidden file reader */}
                <div id="quick-reader-file" className="hidden"></div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-gray-900 border-t border-gray-800 max-w-lg mx-auto w-full">
                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleSave}
                        disabled={!product}
                        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition ${product ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        <Save size={20} />
                        Save & Next
                    </button>

                    <div className="grid grid-cols-3 gap-3">
                        <button
                            onClick={handleReset}
                            className="flex flex-col items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl font-bold text-xs"
                        >
                            <ArrowLeft size={20} />
                            <span>Back</span>
                        </button>

                        <label className="flex flex-col items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl font-bold text-xs cursor-pointer">
                            <ImageIcon size={20} className="text-blue-400" />
                            <span>Gallery</span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                        </label>

                        <button
                            onClick={() => setIsScanning(true)}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl font-bold text-xs ${isScanning ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-white'
                                }`}
                        >
                            <ScanBarcode size={20} />
                            <span>Reader</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
