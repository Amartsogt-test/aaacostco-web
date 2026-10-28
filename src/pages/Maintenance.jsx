import React from 'react';
import { MAINTENANCE_CONFIG } from '../maintenance';
import { ShoppingCart, Smartphone } from 'lucide-react';

const Maintenance = () => {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full border border-gray-100">
                <div className="mb-6 flex justify-center">
                    <div className="bg-blue-100 p-4 rounded-full">
                        <ShoppingCart className="w-12 h-12 text-[#005da6]" />
                    </div>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                    {MAINTENANCE_CONFIG.title}
                </h1>

                <p className="text-gray-600 mb-6 text-base sm:text-lg leading-relaxed">
                    {MAINTENANCE_CONFIG.message}
                </p>

                {MAINTENANCE_CONFIG.estimatedReturn && (
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6">
                        <p className="text-sm text-[#005da6] font-semibold">
                            {MAINTENANCE_CONFIG.estimatedReturn}
                        </p>
                    </div>
                )}

                {MAINTENANCE_CONFIG.playStoreUrl && (
                    <div className="mb-6">
                        <a
                            href={MAINTENANCE_CONFIG.playStoreUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-xl bg-[#005da6] hover:bg-blue-800 text-white font-bold text-sm sm:text-base transition shadow-md"
                        >
                            <Smartphone className="w-5 h-5" />
                            Google Play Store-оос Апп Татах
                        </a>
                    </div>
                )}

                <div className="text-sm text-gray-500">
                    Холбоо барих:{' '}
                    <a
                        href={`mailto:${MAINTENANCE_CONFIG.supportEmail}`}
                        className="text-[#005da6] hover:underline font-medium"
                    >
                        {MAINTENANCE_CONFIG.supportEmail}
                    </a>
                </div>
            </div>

            <div className="mt-8 text-gray-400 text-sm">
                &copy; {new Date().getFullYear()} Costco.mn. Бүх эрх хуулиар хамгаалагдсан.
            </div>
        </div>
    );
};

export default Maintenance;
