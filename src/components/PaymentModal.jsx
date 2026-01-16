import { useState } from 'react';
import { X, Copy, CheckCircle2 } from 'lucide-react';

export default function PaymentModal({ isOpen, onClose, totalAmount, onConfirm, recipientPhone, recipientPhone2, isEmbedded = false }) {
    const [copiedField, setCopiedField] = useState(null);
    const ACCOUNT_NUMBER = "980005005301849559"; // Updated account number
    const ACCOUNT_NAME = "Амарцогт Батбилэг";

    const copyToClipboard = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    if (!isOpen && !isEmbedded) return null;

    // Inner content
    const Content = (
        <div className={`bg-white rounded-2xl shadow-xl overflow-hidden ${isEmbedded ? 'w-full' : 'w-full max-w-md'} animate-scale-in`}>
            {/* Header */}
            <div className="bg-gray-50 px-6 py-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Гүйлгээ хийх</h3>
                {!isEmbedded && (
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition">
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">

                {/* Amount */}
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <p className="text-xs text-blue-600 font-medium mb-1">Шилжүүлэх дүн</p>
                    <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-costco-blue">{totalAmount}</span>
                        <button
                            onClick={() => copyToClipboard(totalAmount?.replace(/[^\d]/g, '') || '', 'amount')}
                            className="p-2 hover:bg-blue-100 rounded-lg transition text-blue-600 flex flex-col items-center gap-1"
                        >
                            {copiedField === 'amount' ? <CheckCircle2 size={18} className="text-green-600" /> : <Copy size={18} />}
                            <span className="text-[10px] font-bold">{copiedField === 'amount' ? 'Хуулсан' : 'Хуулах'}</span>
                        </button>
                    </div>
                </div>

                {/* Bank Info */}
                <div className="space-y-3">
                    <div className="p-4 border rounded-xl bg-gray-50">
                        <p className="text-xs text-gray-500 mb-1">Хүлээн авах данс (Хаан банк)</p>
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-900">MN&nbsp;&nbsp;&nbsp;{ACCOUNT_NUMBER}</span>
                            <button
                                onClick={() => copyToClipboard(ACCOUNT_NUMBER, 'account')}
                                className="p-2 hover:bg-gray-200 rounded-lg transition text-gray-600 flex flex-col items-center gap-1"
                            >
                                {copiedField === 'account' ? <CheckCircle2 size={18} className="text-green-600" /> : <Copy size={18} />}
                                <span className="text-[10px] font-bold">{copiedField === 'account' ? 'Хуулсан' : 'Хуулах'}</span>
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 uppercase font-medium">{ACCOUNT_NAME}</p>
                    </div>

                    <div className="p-4 border rounded-xl bg-gray-50 text-center">
                        <p className="text-sm text-gray-900 font-bold">Гүйлгээний утга дээр <span className="text-costco-red">{recipientPhone || recipientPhone2 || 'утасны дугаараа'}</span> бичнэ үү.</p>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-gray-50">
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onConfirm) {
                            onConfirm();
                        }
                    }}
                    style={{ pointerEvents: 'auto', position: 'relative', zIndex: 9999 }}
                    className="w-full bg-costco-blue text-white py-4 rounded-lg font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 cursor-pointer active:scale-95"
                >
                    Шилжүүлэг хийгдсэн бол энд дарна уу.
                </button>
            </div>
        </div>
    );

    // If embedded, return just the content
    if (isEmbedded) {
        return Content;
    }

    // Default Modal Behavior
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
            {Content}
        </div>
    );
}
