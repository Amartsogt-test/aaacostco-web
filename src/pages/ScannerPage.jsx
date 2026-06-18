import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Image as ImageIcon, RotateCw, ArrowLeft, ZoomIn, ZoomOut, Flashlight } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { cleanBarcode } from '../utils/productUtils';
import { useUIStore } from '../store/uiStore';
import buildInfo from '../buildInfo.json';

export default function ScannerPage() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const { showToast } = useUIStore();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const detectorRef = useRef(null);
    const processedRef = useRef(false);

    const [cameraError, setCameraError] = useState('');
    const [isScanning, setIsScanning] = useState(true);
    const [zoomVal, setZoomVal] = useState(1);
    const [zoomSupported, setZoomSupported] = useState(false);
    const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
    const [torchOn, setTorchOn] = useState(false);
    const [torchSupported, setTorchSupported] = useState(false);
    const [detectorSupported, setDetectorSupported] = useState(true);

    const stopCamera = useCallback(() => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    const handleResult = useCallback((code) => {
        if (processedRef.current) return;
        processedRef.current = true;
        const cleaned = cleanBarcode(code);
        stopCamera();
        if (user?.isAdmin) {
            navigate('/scan?code=' + cleaned, { replace: true });
        } else {
            navigate('/?q=' + cleaned, { replace: true });
        }
    }, [navigate, user?.isAdmin, stopCamera]);

    const getTrack = () => {
        if (!streamRef.current) return null;
        const tracks = streamRef.current.getVideoTracks();
        return tracks.length > 0 ? tracks[0] : null;
    };

    const handleZoomChange = async (newVal) => {
        const val = parseFloat(newVal);
        setZoomVal(val);
        const track = getTrack();
        if (track) {
            try {
                await track.applyConstraints({ advanced: [{ zoom: val }] });
            } catch (err) {
                console.warn("Zoom failed:", err);
            }
        }
    };

    const toggleTorch = async () => {
        const track = getTrack();
        if (track) {
            const newVal = !torchOn;
            try {
                await track.applyConstraints({ advanced: [{ torch: newVal }] });
                setTorchOn(newVal);
            } catch (err) {
                console.warn("Torch toggle failed:", err);
            }
        }
    };

    // Start native BarcodeDetector scanning loop
    const startDetectionLoop = useCallback((video) => {
        if (!detectorRef.current || !video) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        scanIntervalRef.current = setInterval(async () => {
            if (processedRef.current || video.readyState < 2) return;
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            try {
                const barcodes = await detectorRef.current.detect(canvas);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                    handleResult(barcodes[0].rawValue);
                }
            } catch {
                // Ignore detection errors - keep scanning
            }
        }, 120); // ~8 scans per second
    }, [handleResult]);

    // Start camera
    useEffect(() => {
        if (!isScanning) return;
        processedRef.current = false;

        let cancelled = false;

        const initCamera = async () => {
            setCameraError('');

            // Check BarcodeDetector support
            if ('BarcodeDetector' in window) {
                try {
                    detectorRef.current = new window.BarcodeDetector({
                        formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code', 'code_39']
                    });
                } catch (e) {
                    console.warn("BarcodeDetector init failed:", e);
                    setDetectorSupported(false);
                }
            } else {
                setDetectorSupported(false);
            }

            try {
                // Request camera with high resolution for small barcodes
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false
                });

                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                streamRef.current = stream;

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                // Apply focus, zoom, torch after camera is running
                const track = stream.getVideoTracks()[0];
                if (track) {
                    // Wait a bit for camera to stabilize
                    await new Promise(r => setTimeout(r, 500));
                    const caps = track.getCapabilities();

                    // Focus: continuous or macro
                    if (caps.focusMode) {
                        const mode = caps.focusMode.includes('continuous') ? 'continuous'
                            : caps.focusMode.includes('macro') ? 'macro' : null;
                        if (mode) {
                            try { await track.applyConstraints({ focusMode: mode }); }
                            catch { try { await track.applyConstraints({ advanced: [{ focusMode: mode }] }); } catch { /* focus not supported */ } }
                        }
                    }

                    // Zoom: start at 2x
                    if (caps.zoom) {
                        setZoomSupported(true);
                        setZoomRange({ min: caps.zoom.min, max: caps.zoom.max });
                        const target = Math.min(2, caps.zoom.max);
                        setZoomVal(target);
                        try { await track.applyConstraints({ advanced: [{ zoom: target }] }); } catch { /* zoom not supported */ }
                    }

                    // Torch support check
                    if (caps.torch) {
                        setTorchSupported(true);
                    }

                    // Focus distance for close-up
                    if (caps.focusDistance) {
                        try {
                            const close = caps.focusDistance.min + (caps.focusDistance.max - caps.focusDistance.min) * 0.15;
                            await track.applyConstraints({ advanced: [{ focusDistance: close }] });
                        } catch { /* focusDistance not supported */ }
                    }
                }

                // Start detection
                if (detectorRef.current) {
                    startDetectionLoop(videoRef.current);
                }
            } catch (err) {
                console.error("Camera init failed:", err);
                if (!cancelled) {
                    setCameraError('Камер нээхэд алдаа гарлаа. Зөвшөөрлөө шалгана уу.');
                }
            }
        };

        initCamera();

        return () => {
            cancelled = true;
            stopCamera();
        };
    }, [isScanning, startDetectionLoop, stopCamera]);

    const handleBack = () => {
        stopCamera();
        navigate(-1);
    };

    const handleRestart = () => {
        stopCamera();
        processedRef.current = false;
        setIsScanning(false);
        setTimeout(() => setIsScanning(true), 100);
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const html5QrCode = new Html5Qrcode("scanner-file-reader");
            const decodedText = await html5QrCode.scanFile(file, true);
            const cleaned = cleanBarcode(decodedText);
            stopCamera();
            if (user?.isAdmin) {
                navigate('/scan?code=' + cleaned, { replace: true });
            } else {
                navigate('/?q=' + cleaned, { replace: true });
            }
        } catch (err) {
            console.error("File scan error:", err);
            showToast('Зургийг унших үед алдаа гарлаа эсвэл код олдсонгүй.', 'error');
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col">
            {/* Update Time Bar */}
            <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
                <span className="text-gray-400 text-[11px] font-mono">
                    Шинэчлэгдсэн: {buildInfo.buildTime}
                </span>
                {!detectorSupported && (
                    <span className="text-yellow-400 text-[10px] bg-yellow-900/30 px-2 py-0.5 rounded">
                        Fallback Mode
                    </span>
                )}
            </div>

            {/* Camera Section */}
            <div className="relative bg-black overflow-hidden" style={{ height: '55vh' }}>
                {/* Native Video Element */}
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: 'scaleX(1)' }}
                />

                {/* Hidden canvas for BarcodeDetector */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Overlay with cutout */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Top dark bar */}
                    <div className="absolute top-0 left-0 right-0 h-[15%] bg-black/50"></div>
                    {/* Bottom dark bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-[15%] bg-black/50"></div>
                    {/* Left dark bar */}
                    <div className="absolute top-[15%] left-0 w-[5%] h-[70%] bg-black/50"></div>
                    {/* Right dark bar */}
                    <div className="absolute top-[15%] right-0 w-[5%] h-[70%] bg-black/50"></div>
                </div>

                {/* Scan Frame with corner markers */}
                <div className="absolute pointer-events-none" style={{ top: '15%', left: '5%', right: '5%', bottom: '15%' }}>
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-green-400 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-green-400 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-green-400 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-green-400 rounded-br-lg"></div>

                    {/* Scanning line animation */}
                    <div className="absolute left-2 right-2 h-0.5 bg-green-400/80 animate-pulse" style={{ top: '50%' }}></div>
                </div>

                {/* Error overlay */}
                {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center p-4 z-20">
                        <div className="text-red-400 text-sm px-4 py-3 text-center bg-red-900/80 rounded-xl backdrop-blur-sm">
                            {cameraError}
                        </div>
                    </div>
                )}

                {/* Fallback overlay */}
                {!detectorSupported && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center p-6 z-20 pointer-events-none">
                        <div className="text-yellow-100 text-sm px-5 py-4 text-center bg-yellow-900/90 border border-yellow-700 rounded-xl shadow-2xl backdrop-blur-sm max-w-sm pointer-events-auto">
                            <div className="font-bold mb-1.5 text-yellow-400 text-base">Шууд унших боломжгүй</div>
                            Таны хөтөч дээр шууд скан хийх үйлдэл дэмжигдсэнгүй. <br/>
                            Доорх <b>Зураг</b> товчийг дарж утаснаасаа зураг сонгож уншуулна уу.
                        </div>
                    </div>
                )}

                {/* Zoom + Torch Controls */}
                <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-3 z-30 pointer-events-auto">
                    {zoomSupported && (
                        <div className="flex items-center gap-2 bg-black/70 px-3 py-2 rounded-2xl shadow-lg border border-gray-700">
                            <button
                                type="button"
                                onClick={() => handleZoomChange(Math.max(zoomRange.min, zoomVal - 0.5))}
                                className="text-white bg-gray-700 hover:bg-gray-600 w-9 h-9 rounded-full flex items-center justify-center font-bold text-base active:scale-90 transition"
                            >
                                <ZoomOut size={18} />
                            </button>
                            <span className="text-white text-xs font-bold min-w-[50px] text-center">
                                {zoomVal.toFixed(1)}x
                            </span>
                            <button
                                type="button"
                                onClick={() => handleZoomChange(Math.min(zoomRange.max, zoomVal + 0.5))}
                                className="text-white bg-gray-700 hover:bg-gray-600 w-9 h-9 rounded-full flex items-center justify-center font-bold text-base active:scale-90 transition"
                            >
                                <ZoomIn size={18} />
                            </button>
                        </div>
                    )}
                    {torchSupported && (
                        <button
                            type="button"
                            onClick={toggleTorch}
                            className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition active:scale-90 ${
                                torchOn
                                    ? 'bg-yellow-500 border-yellow-400 text-black'
                                    : 'bg-black/70 border-gray-700 text-white'
                            }`}
                        >
                            <Flashlight size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Hidden file reader element for html5-qrcode file scanning */}
            <div id="scanner-file-reader" className="hidden"></div>

            {/* Manual Entry Section */}
            <div className="bg-gray-900 px-6 py-4">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const input = e.target.elements.manualCode.value.trim();
                        if (input.length > 2) {
                            stopCamera();
                            if (user?.isAdmin) {
                                navigate('/scan?code=' + input, { replace: true });
                            } else {
                                navigate('/?q=' + input, { replace: true });
                            }
                        }
                    }}
                    className="flex gap-2 max-w-md mx-auto"
                >
                    <input
                        name="manualCode"
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Баркод гараар бичих..."
                        className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-xl font-bold outline-none border border-gray-700 focus:border-blue-500 transition-colors placeholder:font-normal placeholder:text-gray-500"
                    />
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-xl font-bold transition-colors"
                    >
                        GO
                    </button>
                </form>
            </div>

            {/* Controls Section */}
            <div className="flex-1 bg-gray-900 p-6">
                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                    <button
                        onClick={handleBack}
                        className="flex flex-col items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 p-4 rounded-2xl transition active:scale-95 border border-gray-700"
                    >
                        <ArrowLeft className="text-gray-400" size={24} />
                        <span className="text-xs font-bold text-gray-400">Буцах</span>
                    </button>

                    <button
                        onClick={handleRestart}
                        className="flex flex-col items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 p-4 rounded-2xl transition active:scale-95 border border-gray-700"
                    >
                        <RotateCw className="text-blue-400" size={24} />
                        <span className="text-xs font-bold text-white">Дахин</span>
                    </button>

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
