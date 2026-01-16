import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';



export default function AdminRoute() {
    const { user, isAuthenticated } = useAuthStore();

    if (!isAuthenticated) {
        // Нэвтрээгүй бол Profile хуудас руу үсрэнэ
        return <Navigate to="/profile" replace />;
    }

    // Хэрэв админ биш бол Нүүр хуудас руу үсрэнэ
    if (!user?.isAdmin) {
        console.warn(`Unauthorized access attempt by: ${user?.phone}`);
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}
