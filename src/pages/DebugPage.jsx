import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function DebugPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [projectId, setProjectId] = useState('Unknown');

    useEffect(() => {
        async function fetchData() {
            try {
                setProjectId(db?.app?.options?.projectId || 'Start Failed');

                console.log("DEBUG PAGE: Fetching products...");
                const querySnapshot = await getDocs(collection(db, 'products'));
                console.log("DEBUG PAGE: Snapshot size:", querySnapshot.size);

                const productsList = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

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

    return (
        <div className="p-8 bg-white min-h-screen">
            <h1 className="text-2xl font-bold mb-4">Firestore Debug Page</h1>

            <div className="mb-6 p-4 bg-gray-100 rounded border">
                <p><strong>Project ID:</strong> {projectId}</p>
                <p><strong>Collection:</strong> products</p>
                <p><strong>Status:</strong> {loading ? 'Loading...' : error ? 'Error' : 'Success'}</p>
                <p><strong>Total Documents:</strong> {products.length}</p>
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
                        <th className="border p-2">Created At</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map(p => (
                        <tr key={p.id} className="border-b hover:bg-gray-50">
                            <td className="border p-2 font-mono text-xs">{p.id}</td>
                            <td className="border p-2">{p.name || 'No Name'}</td>
                            <td className="border p-2">{p.price}</td>
                            <td className="border p-2 text-xs">{p.createdAt || 'N/A'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
