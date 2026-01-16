import { useState, useRef, useEffect } from 'react';
import { Send, X, Package, Pin, Heart, Plus, Image as ImageIcon, Mic, StopCircle, Maximize2, Minimize2, ChevronDown } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';


export default function ChatModal({ isSidebar = false, isFullScreen = false, onClose }) {
    const { messages, sendMessage, sendAdminMessage, closeChat, isLoading, markAsRead, pendingProductMessage, clearPendingMessage, togglePinMessage, toggleLikeMessage, sendAttachment, loadMoreMessages, messageLimit } = useChatStore();
    const { user } = useAuthStore();
    const [input, setInput] = useState('');
    const [isMediaMenuOpen, setIsMediaMenuOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    const [isCompact, setIsCompact] = useState(false); // Default to Sidebar (false) on Desktop

    const [showPinned, setShowPinned] = useState(false);
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
    }, [messages]);

    // Mark as read when opening
    useEffect(() => {
        markAsRead();
    }, [markAsRead]);

    // Handle product inquiry
    const processedProductRef = useRef(null);

    useEffect(() => {
        // Wait for messages to load
        if (isLoading) return;

        // Reset ref if no pending message
        if (!pendingProductMessage) {
            processedProductRef.current = null;
            return;
        }

        // Prevent double-processing
        if (processedProductRef.current === pendingProductMessage.id) {
            return;
        }

        processedProductRef.current = pendingProductMessage.id;

        const productMsg = "";
        const displayProductName = pendingProductMessage.name_mn || pendingProductMessage.englishName || pendingProductMessage.name;

        sendMessage(productMsg, {
            type: 'product',
            productId: pendingProductMessage.id,
            productName: displayProductName,
            productImage: pendingProductMessage.image
        });

        setTimeout(() => {
            sendAdminMessage(
                "Сайн байна уу? Түр хүлээгээрэй, удахгүй бид хариу бичих болно. Та асуух зүйлээ бичээд үлдээгээрэй. 🙏"
            );
        }, 800);

        clearPendingMessage();

    }, [pendingProductMessage, sendMessage, sendAdminMessage, clearPendingMessage, isLoading]);

    const handleQuickReply = async (type) => {
        let userText = '';
        let botText = '';

        if (type === 'ORDER') {
            userText = 'Захиалга хэрхэн өгөх вэ?';
            botText = `📝 **Хүссэн бараагаа захиалах:**\n\nХэрэв та манай сайтад байхгүй бараа захиалахыг хүсвэл:\n1. Costco Korea эсвэл бусад солонгос сайтуудаас барааны линкээ олоорой.\n2. Линкийг нь энд чатаар илгээнэ үү.\n\nБид үнийн тооцооллыг гаргаж өгөх болно.`;
        } else if (type === 'RATE') {
            userText = 'Ханш хэрхэн тооцдог вэ?';
            botText = `💱 **Үнэ бодох аргачлал:**\n\nБарааны үнэ (Вон) * Ханш + Хүргэлтийн зардал + Үйлчилгээний хөлс.\n\nОдоогийн ханш: **2.50** (Тооцоолол хийхэд ашиглана)`;
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
        if (!file.type.startsWith('image/')) {
            alert('Зөвхөн зураг оруулах боломжтой');
            return;
        }
        await sendAttachment(file, 'image');
        setIsMediaMenuOpen(false);
    };

    const startRecording = async () => {
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
            alert('Микрофон ашиглах эрх өгнө үү.');
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

    // Auto-hide removed as per user request ("until user closes it")

    return (
        <div className={`
            flex flex-col z-[60] bg-white
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
                    <h3 className="font-bold">Admin chat</h3>
                    <button
                        onClick={() => setShowReminder(prev => !prev)}
                        className="text-xs px-3 py-1.5 rounded-full border transition flex items-center gap-1 bg-red-600 text-white border-red-600 hover:bg-red-700"
                    >
                        Санамж
                        <ChevronDown size={14} className={`transition-transform duration-200 ${showReminder ? 'rotate-180' : ''}`} />
                    </button>
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

            {/* Disclaimer Banner */}
            {showReminder && (
                <div className="bg-yellow-50 px-4 py-3 border-b border-yellow-100 text-xs text-gray-700 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-300 relative">
                    <p className="font-bold mb-1 text-yellow-800">Санамж</p>
                    <p className="mb-2">Costco-ийн онлайн дэлгүүр болон бодит дэлгүүрийн үнэ зөрүүтэй байх тохиолдол гардаг.</p>
                    <ul className="space-y-1 list-none pl-1">
                        <li>• Зарим бараа онлайнд хямд бол зарим нь дэлгүүрт хямд байдаг.</li>
                        <li>• Онлайн дэлгүүрт хямдарсан байхад, бодит дэлгүүр хямдраагүй тохиолдолд байдаг.</li>
                        <li>• Бид танд аль хямд үнээр нь тооцоолж авч өгөх болно.</li>
                    </ul>

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
            )}

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
                                                {msg.isFromAdmin ? 'Админ' : 'Та'}
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
                                <div className={`relative px-4 py-2 rounded-2xl max-w-[85%] ${msg.isFromAdmin
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
                    {/* Messages End Ref */}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Quick Actions & Input */}
            <div className="bg-white border-t">
                {/* Scrollable Quick Chips */}
                {!isRecording && (
                    <div className="px-3 py-2 flex gap-2 overflow-x-auto no-scrollbar border-b bg-gray-50/50">

                        <button
                            onClick={() => handleQuickReply('ORDER')}
                            className="whitespace-nowrap px-3 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition"
                        >
                            📝 Захиалга өгөх
                        </button>
                        <button
                            onClick={() => handleQuickReply('RATE')}
                            className="whitespace-nowrap px-3 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition"
                        >
                            💱 Ханш тооцох
                        </button>
                    </div>
                )}

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
            </div>
        </div>
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
