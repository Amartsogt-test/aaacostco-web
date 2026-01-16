import { useEffect, useRef, useState } from 'react';
import { X, Camera, Image as ImageIcon, RotateCw } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export default function ScannerModal({ isOpen, onClose, onScan }) {
    const [isScanning, setIsScanning] = useState(true);
    const [cameraError, setCameraError] = useState('');
    const [hasCamera, setHasCamera] = useState(false);
    // const scannerRef = useRef(null); // Unused
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

    const handleRestart = () => {
        stopScanner().then(() => {
            setIsScanning(true);
            // Effect will trigger restart
        });
    };

    useEffect(() => {
        if (!isOpen) return;

        const startScanner = async () => {
            setCameraError('');
            try {
                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length) {
                    setHasCamera(true);

                    const html5QrCode = new Html5Qrcode("reader");
                    html5QrCodeRef.current = html5QrCode;

                    const config = {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                        formatsToSupport: [
                            Html5QrcodeSupportedFormats.QR_CODE,
                            Html5QrcodeSupportedFormats.EAN_13,
                            Html5QrcodeSupportedFormats.EAN_8,
                            Html5QrcodeSupportedFormats.CODE_128,
                            Html5QrcodeSupportedFormats.UPC_A
                        ]
                    };

                    await html5QrCode.start(
                        {
                            facingMode: "environment",
                            // Request scanning with continuous focus
                            videoConstraints: {
                                facingMode: "environment",
                                focusMode: "continuous",
                                advanced: [{ focusMode: "continuous" }]
                            }
                        },
                        config,
                        (decodedText) => {
                            // Handle success
                            console.log("Scan success:", decodedText);
                            onScan(decodedText);
                            stopScanner();
                        },
                        () => {
                            // Handle scan error (ignore mostly as it fires on every frame)
                        }
                    );

                    // Attempt to add tap-to-focus listener
                    setTimeout(() => {
                        const video = document.querySelector("#reader video");
                        if (video) {
                            video.addEventListener('click', async () => {
                                try {
                                    const stream = video.srcObject;
                                    const track = stream?.getVideoTracks()[0];
                                    if (track && track.getCapabilities && track.applyConstraints) {
                                        const capabilities = track.getCapabilities();
                                        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                                            await track.applyConstraints({
                                                advanced: [{ focusMode: 'continuous' }]
                                            });
                                            console.log("Triggered refocus");
                                        }
                                    }
                                } catch (e) {
                                    console.log("Focus failed", e);
                                }
                            });
                        }
                    }, 500);

                    setIsScanning(true);
                } else {
                    setCameraError('Камер олдсонгүй.');
                    setHasCamera(false);
                }
            } catch (err) {
                console.error("Error starting scanner:", err);
                setCameraError('Камер нээхэд алдаа гарлаа. Зөвшөөрлөө шалгана уу.');
                setHasCamera(false);
            }
        };

        if (isOpen && isScanning) {
            // Small delay to ensure DOM is ready
            setTimeout(startScanner, 100);
        }

        return () => {
            // Direct cleanup to avoid closure stale issues, or call stopScanner?
            // Safer to just try stop on ref directly in cleanup or use function if stable.
            // Using logic directly here is often safer for cleanup.
            if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                html5QrCodeRef.current.stop().catch(err => console.error("Cleanup error", err));
            }
        };
    }, [isOpen, onScan, isScanning]); // Added isScanning

    const handleClose = () => {
        stopScanner();
        onClose();
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const html5QrCode = new Html5Qrcode("reader-file");
        try {
            const decodedText = await html5QrCode.scanFile(file, true);
            onScan(decodedText);
            handleClose();
        } catch (err) {
            console.error("File scan error:", err);
            alert('Зургийг унших үед алдаа гарлаа эсвэл код олдсонгүй.');
        }
    };



    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden relative flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="font-bold text-gray-800">Barcode / QR уншуулах</h3>
                    <button
                        onClick={handleClose}
                        className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 bg-black relative flex items-center justify-center min-h-[300px]">
                    {!hasCamera && !cameraError && <div className="text-white text-sm">Камер ачааллаж байна...</div>}
                    {cameraError && <div className="text-red-400 text-sm px-4 text-center">{cameraError}</div>}

                    <div id="reader" className="w-full text-white"></div>
                    {/* Hidden reader for file upload */}
                    <div id="reader-file" className="hidden"></div>
                </div>

                <div className="p-6 bg-white">
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={handleRestart}
                            className="flex flex-col items-center justify-center gap-2 bg-gray-50 p-4 rounded-xl hover:bg-gray-100 transition"
                        >
                            <RotateCw className="text-costco-blue" size={24} />
                            <span className="text-sm font-bold text-gray-700">Дахин ачаалах</span>
                        </button>

                        <label className="flex flex-col items-center justify-center gap-2 bg-gray-50 p-4 rounded-xl hover:bg-gray-100 transition cursor-pointer">
                            <ImageIcon className="text-costco-blue" size={24} />
                            <span className="text-sm font-bold text-gray-700">Зураг сонгох</span>
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
        </div>
    );
}
