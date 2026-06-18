import { useEffect, useRef } from 'react';
import { getRedirectResult } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { persistFacebookUser } from '../utils/authUser';

/**
 * Completes a signInWithRedirect() flow (used when the popup is blocked, e.g.
 * inside the Facebook / Instagram in-app browsers). Uses the SAME persistence
 * helper as the popup path so both behave identically — including reading admin
 * status from the database, never from the Facebook display name.
 */
export default function AuthRedirectHandler() {
    const { login } = useAuthStore();
    const navigate = useNavigate();
    const location = useLocation();
    const hasHandled = useRef(false);

    useEffect(() => {
        if (hasHandled.current) return;
        hasHandled.current = true;

        (async () => {
            try {
                const result = await getRedirectResult(auth);
                if (!result) return;

                const merged = await persistFacebookUser(result.user);
                login(merged);

                if (location.pathname === '/login') navigate('/');
            } catch (err) {
                console.error('Auth redirect error:', err?.code, err?.message);
                if (err?.code === 'auth/account-exists-with-different-credential') {
                    useUIStore.getState().showToast('Энэ Facebook бүртгэл өөр аккаунттай холбоотой байна.', 'error', 5000);
                } else if (err?.code && err.code !== 'auth/redirect-cancelled-by-user') {
                    useUIStore.getState().showToast('Нэвтрэхэд алдаа гарлаа. Дахин оролдоно уу.', 'error');
                }
            }
        })();
    }, [login, navigate, location.pathname]);

    return null;
}
