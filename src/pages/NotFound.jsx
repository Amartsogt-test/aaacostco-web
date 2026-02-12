import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
            <div className="text-8xl font-bold text-costco-blue/20 mb-4">404</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Хуудас олдсонгүй</h1>
            <p className="text-gray-500 mb-8 max-w-md">
                Уучлаарай, таны хайсан хуудас олдсонгүй. Хуудасны хаяг буруу эсвэл хуудас устсан байж магадгүй.
            </p>
            <div className="flex gap-3">
                <button
                    onClick={() => window.history.back()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
                >
                    <ArrowLeft size={18} />
                    Буцах
                </button>
                <Link
                    to="/"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-costco-blue text-white font-medium hover:bg-costco-blue/90 transition-colors"
                >
                    <Home size={18} />
                    Нүүр хуудас
                </Link>
            </div>
        </div>
    );
}
