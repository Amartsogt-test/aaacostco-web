import { useState, useRef, useEffect } from 'react';
import { Send, X, Package, Pin, Heart, Plus, Image as ImageIcon, Mic, StopCircle, Maximize2, Minimize2, ChevronDown } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';
import { auth, db } from '../firebase';
import { signInWithPopup, OAuthProvider, signInWithRedirect } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';


export default function ChatModal({ isSidebar = false, isFullScreen = false, onClose }) {
    const { messages, sendMessage, sendAdminMessage, closeChat, isLoading, markAsRead, pendingProductMessage, clearPendingMessage: _clearPendingMessage, togglePinMessage, toggleLikeMessage, sendAttachment, loadMoreMessages, messageLimit, isAiLoading } = useChatStore();
    const { user: _user } = useAuthStore();
    const { settings, fetchSettings } = useSettingsStore();
    const { showToast } = useUIStore();
    const [input, setInput] = useState('');
    const [isMediaMenuOpen, setIsMediaMenuOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    const [isCompact, _setIsCompact] = useState(false); // Default to Sidebar (false) on Desktop

    const [showPinned, setShowPinned] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showFollowPrompt, setShowFollowPrompt] = useState(false);
    const [pendingLoginUser, setPendingLoginUser] = useState(null);
    const [pendingLoginPlatform, setPendingLoginPlatform] = useState(null); // 'facebook' or 'instagram'
    // Filter pinned messages
    const pinnedMessages = messages.filter(m => m.pinned);

    // Scroll to specific message
    const scrollToMessage = (messageId) => {
        setShowPinned(false);
        // Small timeout to allow render
        setTimeout(() => {
            const element = document.getElementById(`msg-${messageId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add highlight effect
                element.classList.add('ring-2', 'ring-yellow-400');
                setTimeout(() => element.classList.remove('ring-2', 'ring-yellow-400'), 2000);
            }
        }, 100);
    };

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (messagesEndRef.current?.parentElement) {
            const container = messagesEndRef.current.parentElement;
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages, isAiLoading]);

    // Mark as read when opening
    useEffect(() => {
        markAsRead();
        fetchSettings();
    }, [markAsRead, fetchSettings]);

    // Toggle body class for mobile chat visibility (Hides floating toggle)
    useEffect(() => {
        document.body.classList.add('chat-modal-active');
        return () => document.body.classList.remove('chat-modal-active');
    }, []);

    // Product inquiry logic moved to chatStore.js

    const handleQuickReply = async (type) => {
        let userText = '';
        let botText = '';

        if (type === 'LINK_ORDER') {
            // Check if user is logged in with social auth
            const { user, isAuthenticated } = useAuthStore.getState();
            const hasSocialLogin = isAuthenticated && user?.loginProvider;

            if (!hasSocialLogin) {
                setShowLoginModal(true);
                return;
            }

            userText = 'Link-ээр бараа, үйлчилгээ захиалах';

            // NEW: Explicitly request admin support
            const { requestAdmin } = useChatStore.getState();
            requestAdmin();

            botText = 'Сайн байна уу? Би таныг оператор руу шилжүүллээ. Та барааныхаа линкийг энд бичээд үлдээнэ үү. Бид шалгаад танд удахгүй хариу өгөх болно. Баярлалаа!';
        } else if (type === 'ADMIN') {
            // Check if user is logged in with social auth
            const { user, isAuthenticated } = useAuthStore.getState();
            const hasSocialLogin = isAuthenticated && user?.loginProvider;

            if (!hasSocialLogin) {
                // User not logged in with social - show login modal
                setShowLoginModal(true);
                return;
            }

            userText = 'Оператортой чатлах';
            botText = 'Сайн байна уу? Танд юугаар туслах вэ? Та асуултаа бичээд үлдээгээрэй. Бид удахгүй хариу өгөх болно.';
            // NEW: Explicitly request admin support
            const { requestAdmin } = useChatStore.getState();
            requestAdmin();
        }

        if (userText) {
            await sendMessage(userText);
            setTimeout(() => {
                sendAdminMessage(botText);
            }, 600);
        }
    };

    const handleSend = () => {
        if (!input.trim()) return;

        // Check if user is logged in
        const { user, isAuthenticated } = useAuthStore.getState();
        const hasSocialLogin = isAuthenticated && user?.loginProvider;
        if (!hasSocialLogin) {
            setShowLoginModal(true);
            return;
        }

        sendMessage(input);
        setInput('');
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check if user is logged in
        const { user, isAuthenticated } = useAuthStore.getState();
        const hasSocialLogin = isAuthenticated && user?.loginProvider;
        if (!hasSocialLogin) {
            setShowLoginModal(true);
            return;
        }

        if (!file.type.startsWith('image/')) {
            showToast('Зөвхөн зураг оруулах боломжтой', 'warning');
            return;
        }
        await sendAttachment(file, 'image');
        setIsMediaMenuOpen(false);
    };

    const startRecording = async () => {
        // Check if user is logged in
        const { user, isAuthenticated } = useAuthStore.getState();
        const hasSocialLogin = isAuthenticated && user?.loginProvider;
        if (!hasSocialLogin) {
            setShowLoginModal(true);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], 'voice_message.webm', { type: 'audio/webm' });
                await sendAttachment(audioFile, 'audio');
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

            setIsMediaMenuOpen(false);
        } catch (error) {
            console.error("Error accessing microphone:", error);
            showToast('Микрофон ашиглах эрх өгнө үү.', 'warning');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
        }
    };

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatTime = (date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' });
    };

    const [showReminder, setShowReminder] = useState(true);

    // Auto-hide after 2 seconds
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowReminder(false);
        }, 2000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className={`
            flex flex-col z-[100] bg-white
            ${isFullScreen
                ? 'w-full h-full rounded-none' // Full-screen: No shadow, no border, just fill
                : `shadow-2xl border border-gray-100 overflow-hidden ${isSidebar
                    ? 'w-full h-full rounded-2xl' // Sidebar Mode
                    : `absolute bottom-0 right-0 w-80 sm:w-96 h-[550px] max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300 origin-bottom-right 
                       ${isCompact
                        ? 'rounded-2xl'
                        : 'rounded-2xl md:fixed md:top-0 md:right-0 md:bottom-0 md:w-[400px] md:h-auto md:rounded-l-2xl md:rounded-r-none'
                    }`
                }`
            }
        `}>
            {/* Header */}
            <div className="bg-[#F9FAFB] text-black px-4 py-3 flex items-center justify-between relative z-10 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <h3 className="font-bold">Оператортой чатлах</h3>
                </div>
                <div className="flex items-center gap-2">
                    {/* Pinned Messages Toggle */}
                    <button
                        onClick={() => setShowPinned(!showPinned)}
                        className={`p-1.5 rounded-full transition relative ${showPinned ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
                        title="Pin хийсэн мессежүүд"
                    >
                        <Pin size={18} className={pinnedMessages.length > 0 ? 'fill-current' : ''} />
                        {pinnedMessages.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 text-black text-[10px] font-bold flex items-center justify-center rounded-full">
                                {pinnedMessages.length}
                            </span>
                        )}
                    </button>

                    {/* Close Button (Replaces Minimize) */}
                    <button
                        onClick={() => {
                            if (onClose) {
                                onClose(); // Full-screen mode: navigate back
                            } else {
                                closeChat(); // Normal mode: close modal
                            }
                        }}
                        className="p-1 hover:bg-gray-100 rounded-full transition"
                        title="Хаах"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Disclaimer Banner & Collapsed Handle */}
            <div className="relative z-20">
                {/* Banner - Collapses when hidden */}
                <div className={`overflow-hidden transition-all duration-1000 ease-in-out ${showReminder ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="bg-yellow-100 px-4 py-3 border-b border-yellow-100 text-xs text-gray-700 leading-relaxed relative">
                        <p className="font-bold mb-1 text-yellow-800">Санамж</p>
                        {settings?.chatReminder ? (
                            <p className="whitespace-pre-wrap">{settings.chatReminder}</p>
                        ) : (
                            <>
                                <p className="mb-2">Costco-ийн онлайн дэлгүүр болон бодит дэлгүүрийн үнэ зөрүүтэй байх тохиолдол гардаг.</p>
                                <ul className="space-y-1 list-none pl-1">
                                    <li>• Зарим бараа онлайнд хямд бол зарим нь дэлгүүрт хямд байдаг.</li>
                                    <li>• Онлайн дэлгүүрт хямдарсан байхад, бодит дэлгүүр хямдраагүй тохиолдолд байдаг.</li>
                                    <li>• Бид танд аль хямд үнээр нь тооцоолж авч өгөх болно.</li>
                                </ul>
                            </>
                        )}

                        {/* Collapse Button */}
                        <div className="flex justify-center mt-2">
                            <button
                                onClick={() => setShowReminder(false)}
                                className="p-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-600 shadow-sm"
                                title="Хаах"
                            >
                                <ChevronDown size={16} className="rotate-180" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Handle - Expands when hidden */}
                <div className={`overflow-hidden transition-all duration-1000 ease-in-out ${!showReminder ? 'max-h-[40px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <button
                        onClick={() => setShowReminder(true)}
                        className="w-full bg-yellow-100 hover:bg-yellow-200 border-b border-yellow-200 py-1 flex items-center justify-center transition-colors group"
                        title="Санамж харах"
                    >
                        <div className="bg-red-600 text-white px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm text-xs font-bold">
                            <span>Санамж</span>
                            <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
                        </div>
                    </button>
                </div>
            </div>

            {/* Content Area (Pinned + Messages) */}
            <div className="flex-1 relative flex flex-col min-h-0 bg-gray-100">
                {/* Pinned Messages Overlay */}
                {showPinned && (
                    <div className="absolute inset-0 bg-white z-20 overflow-y-auto animate-in fade-in slide-in-from-top-4 duration-200">
                        <div className="p-4 bg-yellow-50 border-b border-yellow-100 mb-2">
                            <h4 className="font-bold text-yellow-800 flex items-center gap-2">
                                <Pin size={16} className="fill-current" />
                                Pin хийсэн мессежүүд ({pinnedMessages.length})
                            </h4>
                        </div>
                        <div className="p-2 space-y-2">
                            {pinnedMessages.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-8">Pin хийсэн мессеж алга</p>
                            ) : (
                                pinnedMessages.map(msg => (
                                    <button
                                        key={msg.id}
                                        onClick={() => scrollToMessage(msg.id)}
                                        className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition group"
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${msg.isFromAdmin ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
                                                }`}>
                                                {msg.isFromAdmin ? 'Оператор' : 'Та'}
                                            </span>
                                            <span className="text-[10px] text-gray-400">
                                                {formatTime(msg.createdAt)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-700 line-clamp-2">{msg.text}</p>
                                        {msg.metadata?.type === 'product' && (
                                            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 bg-white p-1 rounded border">
                                                <Package size={12} />
                                                <span className="truncate max-w-[200px]">{msg.metadata.productName}</span>
                                            </div>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* History / Load More Button */}
                    {messages.length >= messageLimit && (
                        <div className="flex justify-center mb-4">
                            <button
                                onClick={loadMoreMessages}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-xs font-medium transition"
                            >
                                <ChevronDown size={14} className="rotate-180" />
                                Өмнөх чат харах
                            </button>
                        </div>
                    )}

                    {/* Product Inquiry Banner */}
                    {pendingProductMessage && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3">
                            <div className="flex items-start gap-3">
                                <img
                                    src={pendingProductMessage.image}
                                    alt={pendingProductMessage.name}
                                    className="w-12 h-12 rounded-lg object-cover"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-blue-600 font-medium mb-1">Барааны талаар асуух</p>
                                    <p className="text-sm text-gray-800 font-bold line-clamp-2">{pendingProductMessage.name}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        </div>
                    ) : showLoginModal ? (
                        /* Inline Login UI inside Chat */
                        <div className="flex flex-col items-center justify-center h-full px-6 py-8">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                                <MessageCircleIcon className="w-8 h-8 text-blue-600" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Оператортой чатлахын тулд нэвтэрнэ үү</h3>

                            <div className="w-full max-w-xs space-y-3 mt-4">
                                <button
                                    onClick={async () => {
                                        try {
                                            const provider = new OAuthProvider('facebook.com');
                                            provider.addScope('public_profile');
                                            

                                            const result = await signInWithPopup(auth, provider);
                                            const user = result.user;

                                            const userRef = doc(db, 'users', user.uid);
                                            const userDoc = await getDoc(userRef);

                                            const userData = {
                                                uid: user.uid,
                                                name: user.displayName,
                                                email: user.email,
                                                photoURL: user.photoURL,
                                                loginProvider: 'facebook',
                                                lastLogin: serverTimestamp()
                                            };

                                            if (!userDoc.exists()) {
                                                userData.followStatus = { facebook: null, instagram: null };
                                                userData.createdAt = serverTimestamp();
                                            }

                                            await setDoc(userRef, userData, { merge: true });

                                            const fullUser = {
                                                ...userData,
                                                followStatus: userDoc.exists() ? userDoc.data().followStatus : { facebook: null, instagram: null }
                                            };

                                            // Login immediately so Profile and other components see the user
                                            const { login } = useAuthStore.getState();
                                            login(fullUser);

                                            // Store user data for follow confirmation updates
                                            setPendingLoginUser(fullUser);

                                            setShowLoginModal(false);
                                            setPendingLoginPlatform('facebook');
                                            setShowFollowPrompt(true); // Show follow prompt instead of proceeding
                                        } catch (error) {
                                            console.error('Facebook login error:', error);
                                            // Fallback for mobile in-app browsers
                                            const code = error?.code;
                                            const shouldFallback = [
                                                'auth/popup-blocked',
                                                'auth/popup-closed-by-user',
                                                'auth/operation-not-supported-in-this-environment',
                                                'auth/web-storage-unsupported',
                                                'auth/internal-error',
                                            ].includes(code);
                                            
                                            if (shouldFallback || error.message.includes('popup')) {
                                                try {
                                                    const provider = new OAuthProvider('facebook.com');
                                                    provider.addScope('public_profile');
                                                    await signInWithRedirect(auth, provider);
                                                } catch (redirectErr) {
                                                    console.error('Redirect failed:', redirectErr);
                                                }
                                            }
                                        }
                                    }}
                                    className="w-full py-3 px-4 bg-[#1877F2] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-[#166FE5] transition shadow-lg"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                                    Facebook-ээр нэвтрэх
                                </button>
                            </div>

                            <p className="text-xs text-gray-400 mt-6 text-center">
                                Нэвтрэснээр та үйлчилгээний нөхцөлийг зөвшөөрч байна
                            </p>

                            <button
                                onClick={() => setShowLoginModal(false)}
                                className="mt-4 text-sm text-gray-500 hover:text-gray-700"
                            >
                                Буцах
                            </button>
                        </div>
                    ) : showFollowPrompt ? (
                        /* FOLLOW PROMPT - Shows after Facebook login */
                        <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
                            {/* Platform-specific icon */}
                            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-5 shadow-lg">
                                <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                </svg>
                            </div>

                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                Сайн байна уу, {pendingLoginUser?.name?.split(' ')[0] || 'Хэрэглэгч'}! 👋
                            </h3>
                            <p className="text-gray-500 mb-6 text-sm max-w-xs">
                                Чатлахын тулд манай Facebook хуудсыг дагаарай. Шинэ бараа, урамшуулал, хямдралын мэдээг авах боломжтой!
                            </p>

                            <div className="w-full max-w-xs space-y-3">
                                {/* Open social media page button */}
                                <button
                                    onClick={() => window.open(
                                        'https://www.facebook.com/costcomongolia',
                                        '_blank'
                                    )}
                                    className="w-full py-3 px-4 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition shadow-lg bg-[#1877F2] hover:bg-[#166FE5]"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                                    Facebook хуудас нээх
                                </button>

                                {/* Confirm follow button */}
                                <button
                                    onClick={async () => {
                                        // User confirmed they followed - update Firestore and login
                                        if (pendingLoginUser?.uid) {
                                            await setDoc(doc(db, 'users', pendingLoginUser.uid), {
                                                followStatus: { [pendingLoginPlatform]: true }
                                            }, { merge: true });
                                        }

                                        const { updateFollowStatus } = useAuthStore.getState();
                                        updateFollowStatus(pendingLoginPlatform, true);

                                        setShowFollowPrompt(false);
                                        setPendingLoginUser(null);
                                        setPendingLoginPlatform(null);
                                        // Delay to allow chat initialization after login
                                        setTimeout(() => handleQuickReply('ADMIN'), 500);
                                    }}
                                    className="w-full py-3 px-4 bg-green-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-green-600 transition shadow-lg"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    Дагасан ✓
                                </button>

                                {/* Skip button */}
                                <button
                                    onClick={() => {
                                        // Skip - already logged in
                                        setShowFollowPrompt(false);
                                        setPendingLoginUser(null);
                                        setPendingLoginPlatform(null);
                                        // Delay to allow chat initialization after login
                                        setTimeout(() => handleQuickReply('ADMIN'), 500);
                                    }}
                                    className="w-full py-2 text-gray-400 text-sm hover:text-gray-600 transition"
                                >
                                    Дараа дагахий
                                </button>
                            </div>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                            <MessageCircleIcon className="w-12 h-12 mb-2 opacity-50" />
                            <p>Мессеж байхгүй байна</p>
                            <p className="text-xs">Бидэнтэй чатлаарай!</p>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div
                                key={msg.id}
                                id={`msg-${msg.id}`}
                                className={`flex ${msg.isFromAdmin ? 'justify-start' : 'justify-end'} group transition-all duration-500`}
                            >
                                <div className={`relative px-4 py-2 rounded-2xl max-w-[85%] break-words ${msg.isFromAdmin
                                    ? 'bg-white border text-gray-800 rounded-bl-none shadow-sm'
                                    : 'bg-blue-600/50 text-blue-900 rounded-br-none shadow-sm'
                                    } ${msg.pinned ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}>

                                    {/* Action Buttons (Pin & Like) */}
                                    <div className={`absolute -top-3 ${msg.isFromAdmin ? '-right-2' : '-left-2'} flex gap-2`}>
                                        {/* Pin Button */}
                                        <button
                                            onClick={() => togglePinMessage(msg.id, !msg.pinned)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center shadow-sm transition-all
                                            ${msg.pinned
                                                    ? 'bg-yellow-400 text-white opacity-100 scale-100'
                                                    : 'bg-white border border-gray-200 text-gray-500 opacity-100 scale-100 hover:bg-gray-100'
                                                }`}
                                        >
                                            <Pin size={12} className={msg.pinned ? 'fill-current' : ''} />
                                        </button>

                                        {/* Like Button */}
                                        <button
                                            onClick={() => toggleLikeMessage(msg.id, !msg.liked)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center shadow-sm transition-all
                                            ${msg.liked
                                                    ? 'bg-pink-500 text-white opacity-100 scale-100'
                                                    : 'bg-white border border-gray-200 text-gray-500 opacity-100 scale-100 hover:bg-gray-100'
                                                }`}
                                        >
                                            <Heart size={12} className={msg.liked ? 'fill-current' : ''} />
                                        </button>
                                    </div>

                                    {msg.attachment?.type === 'image' && (
                                        <div className="mb-2">
                                            <img
                                                src={msg.attachment.url}
                                                alt="Sent image"
                                                className="rounded-lg max-w-full h-auto max-h-48 object-cover cursor-pointer hover:opacity-95"
                                                onClick={() => window.open(msg.attachment.url, '_blank')}
                                            />
                                        </div>
                                    )}

                                    {msg.attachment?.type === 'audio' && (
                                        <div className="mb-2 flex items-center gap-2">
                                            <audio controls src={msg.attachment.url} className="h-8 max-w-[200px]" />
                                        </div>
                                    )}

                                    {msg.text && (
                                        <div className="text-sm whitespace-pre-wrap">
                                            {msg.text.split('<RED_LINE>').map((part, idx, arr) => (
                                                <span key={idx}>
                                                    {part.replace(/^\n|\n$/g, '')}
                                                    {idx < arr.length - 1 && (
                                                        <div className="my-2 border-t-2 border-[#E31837] w-full" />
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Product Metadata */}
                                    {msg.metadata?.type === 'product' && (
                                        <a
                                            href={`/product/${msg.metadata.productId}`}
                                            className={`flex flex-col gap-2 mt-1 p-3 rounded-xl transition hover:opacity-95 ${msg.isFromAdmin ? 'bg-gray-50' : 'bg-white'
                                                } min-w-[220px]`}>
                                            <div className="flex flex-col min-w-0 text-left w-full">
                                                <span className={`text-sm font-bold line-clamp-2 leading-tight ${msg.isFromAdmin ? 'text-gray-800' : 'text-gray-900'}`}>
                                                    {msg.metadata.productName}
                                                </span>
                                            </div>
                                            <img
                                                src={msg.metadata.productImage}
                                                alt={msg.metadata.productName}
                                                className="w-full h-40 object-contain rounded-lg bg-white border border-gray-100 p-2"
                                                onError={(e) => e.target.style.display = 'none'}
                                            />
                                        </a>
                                    )}

                                    {/* Search Inquiry Metadata — highlights what the user searched for */}
                                    {msg.metadata?.type === 'search_inquiry' && msg.metadata.query && (
                                        <div className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 border border-gray-200 text-gray-800 text-xs font-bold max-w-full">
                                            <span>🔍 Хайсан:</span>
                                            <span className="truncate">{msg.metadata.query}</span>
                                        </div>
                                    )}

                                    <div className={`flex items-center justify-between mt-1 gap-2 ${msg.isFromAdmin ? 'text-gray-400' : 'text-blue-200'}`}>
                                        <div className="flex gap-1">
                                            {msg.pinned && <Pin size={10} className="fill-current text-yellow-500" />}
                                            {msg.liked && <Heart size={10} className="fill-current text-pink-500" />}
                                        </div>
                                        <div className="flex items-center gap-1.5 ml-auto">
                                            {msg.metadata?.type === 'product' && (
                                                <span className="text-xs font-bold text-gray-900">Барааны мэдээлэл авах</span>
                                            )}
                                            <p className="text-xs font-bold text-gray-900">
                                                {formatTime(msg.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}

                    {/* AI Loading Indicator */}
                    {isAiLoading && (
                        <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300 mb-2">
                            <div className="bg-white border text-gray-500 rounded-2xl rounded-bl-none shadow-sm px-4 py-3 flex items-center gap-2 text-xs font-medium">
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Messages End Ref */}
                    <div ref={messagesEndRef} />
                </div>
            </div >

            {/* Quick Actions & Input */}
            < div className="bg-white border-t shrink-0 relative z-[100]" >
                {/* Scrollable Quick Chips */}
                {
                    !isRecording && (
                        <div className="px-3 py-2 flex flex-col gap-2 border-b bg-gray-50/50">
                            <button
                                onClick={() => handleQuickReply('LINK_ORDER')}
                                className="w-full text-left px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition flex items-center gap-2"
                            >
                                <span>🔗</span>
                                <span>Link-ээр бараа, үйлчилгээ захиалах</span>
                            </button>
                            <button
                                onClick={() => handleQuickReply('ADMIN')}
                                className="w-full text-left px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition flex items-center gap-2"
                            >
                                <span>💬</span>
                                <span>Оператортой чатлах</span>
                            </button>
                            {(() => {
                                // Prefer the admin-configured link; otherwise fall back to the
                                // Facebook Page id from env (m.me deep link). Hidden if neither set.
                                const pageId = import.meta.env.VITE_FACEBOOK_PAGE_ID;
                                const messengerHref = settings?.messengerLink || (pageId ? `https://m.me/${pageId}` : null);
                                if (!messengerHref) return null;
                                return (
                                    <a
                                        href={messengerHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full text-left px-3 py-2 bg-[#0084FF]/5 border border-[#0084FF]/20 rounded-lg text-xs text-[#0084FF] font-semibold hover:bg-[#0084FF]/10 transition flex items-center gap-2"
                                    >
                                        <span>📘</span>
                                        <span>Facebook Messenger-ээр холбогдох</span>
                                    </a>
                                );
                            })()}
                        </div>
                    )
                }

                <div className="p-3 relative">
                    {isRecording ? (
                        <div className="flex items-center gap-3 bg-red-50 p-2 rounded-full border border-red-100 animate-in fade-in duration-200">
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse ml-2"></div>
                            <span className="text-red-600 text-sm font-medium font-mono">{formatDuration(recordingTime)}</span>
                            <div className="flex-1"></div>
                            <button
                                onClick={stopRecording}
                                className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
                            >
                                <StopCircle size={18} className="fill-current" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <button
                                    onClick={() => setIsMediaMenuOpen(!isMediaMenuOpen)}
                                    className={`p-2 rounded-full transition ${isMediaMenuOpen ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
                                >
                                    <Plus size={20} className={`transition-transform duration-200 ${isMediaMenuOpen ? 'rotate-45' : ''}`} />
                                </button>

                                {/* Media Menu */}
                                {isMediaMenuOpen && (
                                    <div className="absolute bottom-12 left-0 bg-white shadow-xl border border-gray-100 rounded-xl p-2 flex flex-col gap-1 z-30 animate-in slide-in-from-bottom-2 duration-200 w-32">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg text-sm text-gray-700 transition"
                                        >
                                            <ImageIcon size={16} className="text-blue-500" />
                                            Зураг
                                        </button>
                                        <button
                                            onClick={startRecording}
                                            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg text-sm text-gray-700 transition"
                                        >
                                            <Mic size={16} className="text-red-500" />
                                            Voice
                                        </button>
                                    </div>
                                )}
                            </div>

                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ position: 'fixed', top: 0, left: '-9999px' }}
                                accept="image/*"
                                onChange={handleFileSelect}
                                tabIndex={-1}
                            />

                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="Мессеж бичих..."
                                className="flex-1 px-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim()}
                                className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    )}
                </div>
            </div >
        </div >
    );
}

// Simple icon component for empty state
function MessageCircleIcon({ className }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
    );
}
