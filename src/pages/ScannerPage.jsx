import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { X, Camera, Image as ImageIcon, RotateCw, ArrowLeft } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { cleanBarcode } from '../utils/productUtils';

export default function ScannerPage() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [isScanning, setIsScanning] = useState(true);
    const [cameraError, setCameraError] = useState('');
    const [hasCamera, setHasCamera] = useState(false);
    const html5QrCodeRef = useRef(null);

    const stopScanner = async () => {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
            try {
                await html5QrCodeRef.current.stop();
                await html5QrCodeRef.current.clear();
                setIsScanning(false);
            } catch (err) {
                console.error("Error stopping scanner:", err);
            }
        }
    };

    const handleBack = () => {
        stopScanner();
        navigate(-1);
    };

    const handleRestart = () => {
        stopScanner().then(() => {
            setIsScanning(true);
        });
    };

    useEffect(() => {
        let retryCount = 0;
        const maxRetries = 3;

        const startScanner = async () => {
            setCameraError('');
            try {
                // Direct initialization - Library handles permission
                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length) {
                    setHasCamera(true);

                    const html5QrCode = new Html5Qrcode("reader");
                    html5QrCodeRef.current = html5QrCode;

                    const basicConfig = {
                        fps: 15,
                        qrbox: { width: 250, height: 140 }, // Smaller, wider box
                        aspectRatio: 1.777778, // 16:9
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

                    const handleScanSuccess = (decodedText) => {
                        console.log("Scan success:", decodedText);
                        const cleaned = cleanBarcode(decodedText);
                        stopScanner();
                        if (user?.isAdmin) {
                            navigate('/scan?code=' + cleaned, { replace: true });
                        } else {
                            navigate('/?q=' + cleaned, { replace: true });
                        }
                    };

                    await html5QrCode.start(
                        { facingMode: "environment" },
                        basicConfig,
                        handleScanSuccess,
                        () => { }
                    );

                    setIsScanning(true);
                } else {
                    setCameraError('Камер олдсонгүй.');
                    setHasCamera(false);
                }
            } catch (err) {
                console.error("Error starting scanner:", err);
                retryCount++;
                if (retryCount < maxRetries) {
                    console.log(`Retrying... (${retryCount}/${maxRetries})`);
                    setTimeout(startScanner, 300); // Reduced retry delay
                } else {
                    setCameraError('Камер нээхэд алдаа гарлаа. Хуудсыг refresh хийнэ үү.');
                    setHasCamera(false);
                }
            }
        };

        if (isScanning) {
            // Minimized delay to ensured DOM is ready
            setTimeout(startScanner, 50);
        }

        return () => {
            if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                html5QrCodeRef.current.stop().catch(err => console.error("Cleanup error", err));
            }
        };
    }, [isScanning, navigate]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const html5QrCode = new Html5Qrcode("reader-file");
        try {
            const decodedText = await html5QrCode.scanFile(file, true);
            const cleaned = cleanBarcode(decodedText);
            if (user?.isAdmin) {
                navigate('/scan?code=' + cleaned, { replace: true });
            } else {
                navigate('/?q=' + cleaned, { replace: true });
            }
        } catch (err) {
            console.error("File scan error:", err);
            alert('Зургийг унших үед алдаа гарлаа эсвэл код олдсонгүй.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col">
            <style>{`
                #reader > *:not(video) {
                    display: none !important;
                }
                #reader video {
                    object-fit: cover !important;
                }
            `}</style>

            {/* Camera Section - Top portion (increased height since header is gone) */}
            <div className="relative bg-black overflow-hidden" style={{ height: '50vh' }}>
                {/* Camera Preview - fills this container */}
                <div id="reader" className="absolute inset-0 w-full h-full"></div>

                {/* Overlay with cutout */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Top dark bar */}
                    <div className="absolute top-0 left-0 right-0 h-[15%] bg-black/60"></div>
                    {/* Bottom dark bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-[15%] bg-black/60"></div>
                    {/* Left dark bar */}
                    <div className="absolute top-[15%] left-0 w-[8%] h-[70%] bg-black/60"></div>
                    {/* Right dark bar */}
                    <div className="absolute top-[15%] right-0 w-[8%] h-[70%] bg-black/60"></div>
                </div>

                {/* Scan Frame with corner markers */}
                <div className="absolute pointer-events-none" style={{ top: '15%', left: '8%', right: '8%', bottom: '15%' }}>
                    {/* Top-left corner */}
                    <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
                    {/* Top-right corner */}
                    <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
                    {/* Bottom-left corner */}
                    <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
                    {/* Bottom-right corner */}
                    <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-xl"></div>

                    {/* Scanning line */}
                    {isScanning && (
                        <div className="absolute left-4 right-4 h-0.5 bg-green-400 animate-pulse" style={{ top: '50%' }}></div>
                    )}
                </div>

                {/* Loading/Error overlay */}
                {!hasCamera && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-white text-sm bg-black/70 px-4 py-2 rounded-full">
                            Камер ачааллаж байна...
                        </div>
                    </div>
                )}
                {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="text-red-400 text-sm px-4 py-3 text-center bg-red-900/80 rounded-xl">
                            {cameraError}
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden reader for file upload */}
            <div id="reader-file" className="hidden"></div>

            {/* Instructions */}
            <div className="bg-gray-900 text-center py-4">
                <p className="text-gray-400 text-sm">Баркодыг хүрээн дотор байрлуулна уу</p>
            </div>

            {/* Controls Section - Bottom portion */}
            <div className="flex-1 bg-gray-900 p-6">
                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                    {/* Back Button */}
                    <button
                        onClick={handleBack}
                        className="flex flex-col items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 p-4 rounded-2xl transition active:scale-95 border border-gray-700"
                    >
                        <ArrowLeft className="text-gray-400" size={24} />
                        <span className="text-xs font-bold text-gray-400">Буцах</span>
                    </button>

                    {/* Reload Button */}
                    <button
                        onClick={handleRestart}
                        className="flex flex-col items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 p-4 rounded-2xl transition active:scale-95 border border-gray-700"
                    >
                        <RotateCw className="text-blue-400" size={24} />
                        <span className="text-xs font-bold text-white">Дахин</span>
                    </button>

                    {/* Gallery Button */}
                    <label className="flex flex-col items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 p-4 rounded-2xl transition cursor-pointer active:scale-95 border border-gray-700">
                        <ImageIcon className="text-blue-400" size={24} />
                        <span className="text-xs font-bold text-white">Зураг</span>
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileUpload}
                            tabIndex={-1}
                        />
                    </label>
                </div>
            </div>
        </div>
    );
}
