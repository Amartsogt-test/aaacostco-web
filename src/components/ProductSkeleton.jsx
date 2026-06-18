import React from 'react';

export default function ProductSkeleton() {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden animate-pulse">
            {/* Image Skeleton */}
            <div className="relative aspect-square bg-gray-200">
                {/* Simulated overlays */}
                <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                    <div className="h-4 w-12 bg-gray-300 rounded"></div>
                </div>
            </div>

            {/* Content Skeleton */}
            <div className="px-2 py-3 flex flex-col flex-1 border-t border-gray-50">
                {/* Title (2 lines) */}
                <div className="h-4 bg-gray-200 rounded w-full mb-1"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-3"></div>

                {/* Tags (Weight/Code) */}
                <div className="flex gap-2 mb-3">
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                </div>

                {/* Price Section */}
                <div className="mt-auto">
                    <div className="flex flex-col gap-1 items-start mb-3">
                        <div className="h-6 bg-gray-300 rounded w-24 mb-1"></div>
                        <div className="h-3 bg-gray-200 rounded w-16"></div>
                    </div>

                    {/* Shipping info skeleton */}
                    <div className="flex flex-col gap-1 w-full">
                        <div className="h-5 bg-gray-100 rounded w-full"></div>
                        <div className="h-5 bg-gray-100 rounded w-full"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
