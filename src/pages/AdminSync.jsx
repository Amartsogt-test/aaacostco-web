import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productService } from '../services/productService';
import { RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

export default function AdminSync() {
    const [searchParams] = useSearchParams();
    const autostart = searchParams.get('autostart') === 'true';
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [isStarted, setIsStarted] = useState(false);

    const isComplete = status?.state === 'completed';

    const startSync = async () => {
        setIsStarted(true);
        setError(null);
        try {
            await productService.triggerProductSync();
        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    // Listen to real-time status
    useEffect(() => {
        const unsub = productService.subscribeToSyncStatus((data) => {
            setStatus(data);
        });
        return () => unsub();
    }, []);

    // Auto-start sync
    useEffect(() => {
        if (autostart && !isStarted) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            startSync();
        }
    }, [autostart, isStarted]);

    const INITIAL_STEPS = [
        { label: 'Хямдралтай (Sale)', status: 'pending', percentage: 0, processed: 0, total: 0 },
        { label: 'Онцлох (Featured)', status: 'pending', percentage: 0, processed: 0, total: 0 },
        { label: 'Шинэ (New)', status: 'pending', percentage: 0, processed: 0, total: 0 },
        { label: 'Kirkland Signature', status: 'pending', percentage: 0, processed: 0, total: 0 }
    ];

    const displaySteps = status?.steps || INITIAL_STEPS;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center font-sans">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">

                {/* Header Icon */}
                <div className="mb-6 flex justify-center">
                    {error ? (
                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
                            <AlertTriangle size={32} />
                        </div>
                    ) : isComplete ? (
                        <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center ring-4 ring-green-50/50">
                            <CheckCircle size={32} />
                        </div>
                    ) : (
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center animate-spin">
                            <RefreshCw size={32} />
                        </div>
                    )}
                </div>

                {/* Title */}
                <h1 className="text-xl font-bold text-gray-900 mb-2">
                    {error ? 'Алдаа гарлаа' : isComplete ? 'Амжилттай дууслаа' : 'Өгөгдөл шинэчилж байна'}
                </h1>

                <p className="text-gray-500 text-sm mb-8">
                    {error ? error : isComplete ? 'Бүх барааны мэдээлэл шинэчлэгдлээ.' : 'Түр хүлээнэ үү, мэдээллийг татаж байна...'}
                </p>

                {/* Queue List */}
                {!error && (
                    <div className="w-full space-y-4 mb-6 text-left">
                        {displaySteps.map((step, index) => {
                            const isCurrent = step.status === 'running';
                            const isDone = step.status === 'completed';
                            const isPending = step.status === 'pending';

                            return (
                                <div key={index} className={`p-3 rounded-xl border transition-all ${isCurrent ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            {isDone ? (
                                                <CheckCircle size={18} className="text-green-500" />
                                            ) : isCurrent ? (
                                                <RefreshCw size={18} className="text-blue-600 animate-spin" />
                                            ) : (
                                                <div className="w-4 h-4 rounded-full border-2 border-gray-200" />
                                            )}
                                            <span className={`font-medium ${isCurrent ? 'text-blue-900' : isDone ? 'text-gray-900' : 'text-gray-400'}`}>
                                                {step.label}
                                            </span>
                                        </div>
                                        {/* Always show percentage if Started */}
                                        {!isPending && (
                                            <span className={`text-xs font-bold ${isCurrent ? 'text-blue-600' : 'text-gray-700'}`}>
                                                {step.percentage}%
                                            </span>
                                        )}
                                    </div>

                                    {/* Progress Bar & Stats for BOTH Running and Completed */}
                                    {!isPending && (
                                        <div className="pl-7">
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-300 rounded-full ${isDone ? 'bg-green-500' : 'bg-blue-600'}`}
                                                    style={{ width: `${step.percentage}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between mt-1 text-[10px] font-medium text-gray-500">
                                                <span>{isDone ? 'Дууссан' : 'Боловсруулж байна...'}</span>
                                                <div className="flex gap-2">
                                                    <span className="text-gray-400">DB: {step.dbCount || 0}</span>
                                                    <span className="tabular-nums text-blue-600 font-bold">{step.processed} / {step.total}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Actions */}
                {isComplete && (
                    <button
                        onClick={() => window.close()}
                        className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition shadow-lg shadow-gray-200"
                    >
                        Хаах
                    </button>
                )}

                {error && (
                    <button
                        onClick={startSync}
                        className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
                    >
                        Дахин оролдох
                    </button>
                )}

                {!isComplete && !error && (
                    <div className="text-xs text-gray-400 mt-4">
                        Энэ цонхыг хааж болохгүй.
                    </div>
                )}
            </div>
        </div>
    );
}
