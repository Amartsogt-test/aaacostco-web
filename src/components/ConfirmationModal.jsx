import { X, AlertTriangle } from 'lucide-react';

export default function ConfirmationModal({ isOpen, onClose, onConfirm, title, message }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-scale-in">
                <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                    <p className="text-gray-500 mb-6">{message}</p>

                    <div className="flex gap-3">
                        {!onConfirm ? (
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 bg-costco-blue text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-lg shadow-blue-100"
                            >
                                Ойлголоо
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                                >
                                    Үгүй
                                </button>
                                <button
                                    onClick={() => {
                                        onConfirm();
                                        onClose();
                                    }}
                                    className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition shadow-lg shadow-red-100"
                                >
                                    Тийм
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
