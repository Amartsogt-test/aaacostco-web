import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Phone, MessageSquare, CheckCircle2, Crown } from 'lucide-react';
import { auth, callFunction } from '../firebase';
import { signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { persistSmsUser } from '../utils/authUser';
import buildInfo from '../buildInfo.json';
export default function Login() {
    const navigate = useNavigate();
    const { login, isAuthenticated } = useAuthStore();
    const { settings, fetchSettings } = useSettingsStore();

    const [error, setError] = useState('');
    
    // SMS auth state
    const [smsStep, setSmsStep] = useState('phone'); // 'phone' | 'waiting' | 'success'
    const [smsPhone, setSmsPhone] = useState('');
    const [smsCode, setSmsCode] = useState('');
    const [_smsSessionId, setSmsSessionId] = useState('');
    const [smsBusinessNumber, setSmsBusinessNumber] = useState('60649999');
    const [smsLoading, setSmsLoading] = useState(false);
    const [smsCountdown, setSmsCountdown] = useState(0);
    const pollingRef = useRef(null);
    const countdownRef = useRef(null);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    // Already signed in → leave the login page.
    useEffect(() => {
        if (isAuthenticated) navigate('/profile', { replace: true });
    }, [isAuthenticated, navigate]);

    // Cleanup polling and countdown on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    const handleRequestSmsCode = async () => {
        const clean = String(smsPhone).replace(/\D/g, '');
        if (clean.length < 8) {
            setError('8 оронтой утасны дугаараа оруулна уу.');
            return;
        }
        setError('');
        setSmsLoading(true);

        // SECURE ADMIN LOGIN (replaces the old hardcoded-password backdoor).
        // Typing the admin phone now prompts for the admin's *real* password — no
        // secret lives in the client bundle anymore. The admin account is created
        // once with a strong password via scripts/grant-admin.cjs, which also sets
        // the `isAdmin` custom claim that the Firestore rules check. No SMS needed.
        const ADMIN_PHONE = import.meta.env.VITE_ADMIN_PHONE || '00880088';
        const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || `${ADMIN_PHONE}@sms.costco.mn`;
        if (clean === ADMIN_PHONE) {
            const pass = window.prompt('Админ нууц үгээ оруулна уу:');
            if (!pass) { setSmsLoading(false); return; }
            try {
                const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pass);
                setSmsStep('success');
                login(await persistSmsUser(cred.user, ADMIN_PHONE));
                setTimeout(() => navigate('/'), 1200);
            } catch (err) {
                console.error('Admin login failed:', err?.code || err?.message);
                setError('Админ нэвтрэхэд алдаа гарлаа. Нууц үг буруу байна.');
            } finally {
                setSmsLoading(false);
            }
            return;
        }

        try {
            const result = await callFunction('requestSmsCode', { phone: clean });
            const { sessionId, code, businessNumber } = result.data;
            setSmsSessionId(sessionId);
            setSmsCode(code);
            if (businessNumber) setSmsBusinessNumber(businessNumber);
            setSmsStep('waiting');
            setSmsCountdown(300); // 5 minutes

            // Start countdown
            if (countdownRef.current) clearInterval(countdownRef.current);
            countdownRef.current = setInterval(() => {
                setSmsCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(countdownRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            // Start polling for verification
            startPolling(sessionId);
        } catch (err) {
            console.error('SMS code request failed:', err);
            if (err?.code === 'functions/resource-exhausted') {
                setError('Та 1 минут хүлээгээд дахин оролдоно уу.');
            } else {
                setError(err?.message || 'Код авахад алдаа гарлаа.');
            }
        } finally {
            setSmsLoading(false);
        }
    };

    const startPolling = useCallback((sessionId) => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const result = await callFunction('verifySmsCode', { sessionId });
                const data = result.data;
                if (data.success && data.token) {
                    // Stop polling
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    if (countdownRef.current) clearInterval(countdownRef.current);

                    setSmsStep('success');

                    // Sign in with Custom Token
                    const cred = await signInWithCustomToken(auth, data.token);
                    login(await persistSmsUser(cred.user, data.phone));
                    
                    // Brief pause to show success animation
                    setTimeout(() => navigate('/'), 1200);
                }
            } catch (err) {
                if (err?.code === 'functions/deadline-exceeded') {
                    // Code expired
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setError('Кодын хугацаа дууссан. Дахин оролдоно уу.');
                    setSmsStep('phone');
                }
            }
        }, 2500); // Poll every 2.5 seconds
    }, [login, navigate]);

    const formatCountdown = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // Build the sms: URI for one-tap send
    const smsUri = smsCode
        ? (navigator.userAgent.match(/iPhone|iPad/i)
            ? `sms:${smsBusinessNumber}&body=${smsCode}`
            : `sms:${smsBusinessNumber}?body=${smsCode}`)
        : '';

    return (
        <div className="animate-fade-in min-h-screen flex flex-col pt-12">
            <div className="flex-grow max-w-sm mx-auto w-full px-4">
                {smsStep === 'phone' && (
                    <>
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Phone size={28} className="text-green-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900">Нэвтрэх</h1>
                            <p className="text-gray-500 mt-2">Утасны дугаараа оруулна уу</p>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl flex items-start gap-2 mb-4">
                                <div className="mt-0.5 shrink-0">⚠️</div>
                                <p>{error}</p>
                            </div>
                        )}

                        <div className="relative mb-4">
                            <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={smsPhone}
                                onChange={(e) => {
                                    const onlyNums = e.target.value.replace(/\D/g, '');
                                    setSmsPhone(onlyNums);
                                }}
                                placeholder="9911 2233"
                                maxLength={8}
                                autoFocus
                                className="w-full pl-10 pr-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-lg tracking-wider font-medium"
                            />
                        </div>

                        <button
                            onClick={handleRequestSmsCode}
                            disabled={smsLoading || String(smsPhone).replace(/\D/g, '').length < 8}
                            className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 mb-6"
                        >
                            {smsLoading ? <Loader2 size={20} className="animate-spin" /> : <MessageSquare size={20} />}
                            {smsLoading ? 'Код авч байна...' : 'Код авах'}
                        </button>

                        {/* Membership Benefits Banner */}
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200/60 shadow-sm mb-6">
                            <h3 className="font-bold text-amber-900 flex items-center justify-center gap-2 mb-3">
                                <Crown size={18} className="text-amber-500" />
                                Гишүүнчлэлийн давуу талууд
                            </h3>
                            <p className="text-[11px] text-amber-700/80 text-center mb-3">
                                Худалдан авалт хийх бүртээ хуримтлал үүсгэж, байнгын хямдрал эдлээрэй!
                            </p>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between items-center bg-white/70 p-2.5 rounded-lg border border-amber-100/50">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-slate-400 shadow-sm"></div>
                                        <span className="font-bold text-slate-700">Silver</span>
                                    </div>
                                    <span className="text-slate-600 font-bold">{settings?.discountRates?.silver || 0}% хямдрал</span>
                                </div>
                                <div className="flex justify-between items-center bg-white/70 p-2.5 rounded-lg border border-amber-100/50">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow-sm"></div>
                                        <span className="font-bold text-yellow-700">Gold</span>
                                    </div>
                                    <span className="text-yellow-700 font-bold">{settings?.discountRates?.gold || 0}% хямдрал</span>
                                </div>
                                <div className="flex justify-between items-center bg-white/70 p-2.5 rounded-lg border border-amber-100/50">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-slate-800 shadow-sm"></div>
                                        <span className="font-bold text-slate-800">Platinum</span>
                                    </div>
                                    <span className="text-slate-800 font-bold">{settings?.discountRates?.platinum || 0}% хямдрал</span>
                                </div>
                            </div>
                        </div>

                        <p className="text-center text-[11px] text-gray-400 mt-2">
                            Нэвтэрснээр та Үйлчилгээний нөхцөл болон Нууцлалын бодлогыг зөвшөөрнө.
                        </p>
                    </>
                )}

                {smsStep === 'waiting' && (
                    <>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <MessageSquare size={28} className="text-blue-600" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Мессеж илгээнэ үү</h2>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl flex items-start gap-2 mb-4">
                                <div className="mt-0.5 shrink-0">⚠️</div>
                                <p>{error}</p>
                            </div>
                        )}

                        {/* The big code display */}
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6 mb-5 text-center">
                            <p className="text-sm text-gray-500 font-medium mb-2">Баталгаажуулах код</p>
                            <div className="text-5xl font-black tracking-[0.3em] text-blue-700 font-mono mb-3 select-all">
                                {smsCode}
                            </div>
                            <div className="text-sm text-gray-600 leading-relaxed">
                                <span>Доорх кодыг </span>
                                <span className="font-bold text-gray-900">{smsBusinessNumber}</span>
                                <span> дугаар руу мессежээр илгээнэ үү</span>
                            </div>
                        </div>

                        {/* One-tap SMS button */}
                        <a
                            href={smsUri}
                            className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 mb-4 no-underline"
                        >
                            <MessageSquare size={20} />
                            Мессеж илгээх 📤
                        </a>

                        {/* Status + countdown */}
                        <div className="flex items-center justify-between text-sm px-1">
                            <div className="flex items-center gap-2 text-gray-500">
                                <Loader2 size={14} className="animate-spin text-blue-500" />
                                <span>Хүлээж байна...</span>
                            </div>
                            {smsCountdown > 0 && (
                                <span className="text-gray-400 font-mono tabular-nums">
                                    ⏱ {formatCountdown(smsCountdown)}
                                </span>
                            )}
                        </div>
                        
                        <button
                            onClick={() => {
                                if (pollingRef.current) clearInterval(pollingRef.current);
                                if (countdownRef.current) clearInterval(countdownRef.current);
                                setSmsStep('phone');
                            }}
                            className="w-full mt-4 py-2 text-gray-500 text-sm font-semibold"
                        >
                            Буцах
                        </button>
                    </>
                )}

                {smsStep === 'success' && (
                    <div className="text-center py-12">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                            <CheckCircle2 size={40} className="text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Амжилттай!</h2>
                        <p className="text-gray-500">Нэвтэрч байна...</p>
                    </div>
                )}
            </div>

            {/* Footer Info Section */}
            <div className="bg-white border-t border-gray-100 mt-8 pt-10 pb-24">
                <div className="container mx-auto px-8 max-w-6xl">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-8 text-base">
                        {/* Тусламж */}
                        <div className="flex flex-col text-left">
                            <h3 className="font-bold text-gray-900 mb-4 text-lg flex items-start gap-2">
                                <div className="w-1.5 h-5 bg-costco-blue rounded-full shrink-0"></div>
                                Тусламж
                            </h3>
                            <ul className="space-y-3 ml-4">
                                <li>
                                    <button onClick={() => navigate('/terms')} className="text-gray-600 hover:text-costco-blue transition font-semibold text-left">
                                        Үйлчилгээний нөхцөл
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => navigate('/privacy')} className="text-gray-600 hover:text-costco-blue transition font-semibold text-left">
                                        Нууцлалын бодлого
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => navigate('/delete-data')} className="text-gray-600 hover:text-costco-blue transition font-semibold text-left">
                                        Өгөгдөл устгах
                                    </button>
                                </li>
                            </ul>
                        </div>

                        {/* Бидний тухай */}
                        <div className="flex flex-col text-left">
                            <h3 className="font-bold text-gray-900 mb-4 text-lg flex items-start gap-2">
                                <div className="w-1.5 h-5 bg-costco-blue rounded-full shrink-0"></div>
                                <span className="leading-tight">Бидний тухай</span>
                            </h3>
                            <ul className="space-y-3 ml-4">
                                <li>
                                    <button onClick={() => navigate('/about')} className="text-gray-600 hover:text-costco-blue transition font-semibold text-left">
                                        Costco танилцуулга
                                    </button>
                                </li>
                            </ul>
                        </div>

                        {/* Холбоо барих */}
                        <div className="flex flex-col text-left">
                            <h3 className="font-bold text-gray-900 mb-4 text-lg flex items-start gap-2">
                                <div className="w-1.5 h-5 bg-costco-blue rounded-full shrink-0"></div>
                                <span className="leading-tight">Холбоо барих</span>
                            </h3>
                            <div className="space-y-4 ml-4 font-semibold text-base">
                                <div className="flex flex-col gap-1 text-gray-600">
                                    <span className="text-gray-400 text-sm">Хаяг:</span>
                                    <span className="leading-tight">{settings?.address || 'Улаанбаатар хот'}</span>
                                </div>
                                <div className="flex flex-col gap-1 text-gray-600">
                                    <span className="text-gray-400 text-sm">Утас:</span>
                                    <span>{settings?.phone || '77xxxxxx'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Build Info */}
            <div className="text-center pb-8 text-gray-400 text-sm font-medium">
                Update хийгдсэн: {buildInfo.buildTime}
            </div>
        </div>
    );
}
