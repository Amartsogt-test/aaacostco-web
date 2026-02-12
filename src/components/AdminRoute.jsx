import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';



export default function AdminRoute() {
    const { user, isAuthenticated } = useAuthStore();

    if (!isAuthenticated) {
        // Нэвтрээгүй бол Profile хуудас руу үсрэнэ
        return <Navigate to="/profile" replace />;
    }

    // Хүлээх - Хэрэв isAuthenticated=true мөртлөө user=null бол хараахан ачаалж байна гэсэн үг
    if (isAuthenticated && !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-10 h-10 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    // Хэрэв админ биш бол Нүүр хуудас руу үсрэнэ
    if (!user?.isAdmin) {
        console.warn(`Unauthorized access attempt by: ${user?.phone}`);
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}
