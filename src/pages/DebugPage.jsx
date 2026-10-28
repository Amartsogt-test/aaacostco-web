import { useState, useEffect } from 'react';
import { api, apiEnabled } from '../services/apiClient';

export default function DebugPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [apiBase, setApiBase] = useState('Unknown');

    const [showOnlyZero, setShowOnlyZero] = useState(false);

    useEffect(() => {
        async function fetchData() {
            try {
                setApiBase(apiEnabled() ? import.meta.env.VITE_API_BASE : 'Not configured');

                console.log("DEBUG PAGE: Fetching products...");
                // Fetch all products from Worker API (D1)
                const res = await api.products({ limit: 9999 });
                const productsList = res?.products || [];
                console.log("DEBUG PAGE: Product count:", productsList.length);

                setProducts(productsList);
            } catch (err) {
                console.error("DEBUG PAGE ERROR:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    const zeroPriceProducts = products.filter(p => p.price == 0);
    const displayProducts = showOnlyZero ? zeroPriceProducts : products;

    return (
        <div className="p-8 bg-white min-h-screen">
            <h1 className="text-2xl font-bold mb-4">D1 Debug Page</h1>

            <div className="mb-6 p-4 bg-gray-100 rounded border">
                <p><strong>API Base:</strong> {apiBase}</p>
                <p><strong>Source:</strong> Cloudflare Worker (D1)</p>
                <p><strong>Status:</strong> {loading ? 'Loading...' : error ? 'Error' : 'Success'}</p>
                <p><strong>Total Documents:</strong> {products.length}</p>
                <div className="mt-4 p-4 bg-yellow-100 border border-yellow-300 rounded text-red-700 font-bold flex items-center justify-between">
                    <span>⚠️ 0 Үнэтэй бараа: {zeroPriceProducts.length}</span>
                    <button
                        onClick={() => setShowOnlyZero(!showOnlyZero)}
                        className="px-4 py-2 bg-red-600 text-white rounded shadow text-sm hover:bg-red-700"
                    >
                        {showOnlyZero ? 'Бүгдийг харах' : 'Зөвхөн 0 үнэтэйг харах'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 mb-4 bg-red-100 text-red-700 rounded">
                    {error}
                </div>
            )}

            <table className="w-full border-collapse border border-gray-300">
                <thead>
                    <tr className="bg-gray-200">
                        <th className="border p-2">ID</th>
                        <th className="border p-2">Name</th>
                        <th className="border p-2">Price</th>
                        <th className="border p-2">Category</th>
                    </tr>
                </thead>
                <tbody>
                    {displayProducts.map(p => (
                        <tr key={p.id} className={`border-b hover:bg-gray-50 ${p.price == 0 ? 'bg-red-50' : ''}`}>
                            <td className="border p-2 font-mono text-xs">{p.id}</td>
                            <td className="border p-2">{p.name || 'No Name'}</td>
                            <td className="border p-2 font-bold text-red-600">{p.price} ₮</td>
                            <td className="border p-2 text-xs">{p.categoryCode || 'N/A'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
