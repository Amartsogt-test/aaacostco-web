import React from 'react';
import { MAINTENANCE_CONFIG } from '../maintenance';
import { ShoppingCart } from 'lucide-react';

const Maintenance = () => {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full">
                <div className="mb-6 flex justify-center">
                    <div className="bg-blue-100 p-4 rounded-full">
                        <ShoppingCart className="w-12 h-12 text-[#005da6]" />
                    </div>
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                    {MAINTENANCE_CONFIG.title}
                </h1>

                <p className="text-gray-600 mb-6 text-lg leading-relaxed">
                    {MAINTENANCE_CONFIG.message}
                </p>

                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6">
                    <p className="text-sm text-[#005da6] font-medium">
                        {MAINTENANCE_CONFIG.estimatedReturn}
                    </p>
                </div>

                <div className="text-sm text-gray-500">
                    Need help? Contact us at{' '}
                    <a
                        href={`mailto:${MAINTENANCE_CONFIG.supportEmail}`}
                        className="text-[#005da6] hover:underline font-medium"
                    >
                        {MAINTENANCE_CONFIG.supportEmail}
                    </a>
                </div>
            </div>

            <div className="mt-8 text-gray-400 text-sm">
                &copy; {new Date().getFullYear()} Costco Mongolia. All rights reserved.
            </div>
        </div>
    );
};

export default Maintenance;
