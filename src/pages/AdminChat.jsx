import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, ArrowLeft, User, Clock, Pin, Heart, Plus, Image as ImageIcon, Mic, StopCircle, Gift, X } from 'lucide-react';
import { chatService } from '../services/chatService';
import { giftCardService } from '../services/giftCardService';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function AdminChat() {
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Media State
    const [isMediaMenuOpen, setIsMediaMenuOpen] = useState(false);
    const [isGiftCardMenuOpen, setIsGiftCardMenuOpen] = useState(false); // New State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    // Gift Card Handler
    const handleSendGiftCard = async (amount) => {
        if (!selectedConversation) return;
        setIsGiftCardMenuOpen(false);
        setIsMediaMenuOpen(false);

        try {
            const result = await giftCardService.createGiftCard({
                amount: amount,
                expiresDays: 365,
                // If user has phone, attach it, otherwise just generic
                recipientPhone: userData?.phone || null,
                message: "Админаас илгээв",
                createdBy: 'AdminChat'
            });

            if (result.success) {
                const message = `🎁 **Digital Gift Card**\n\nТанд **${amount.toLocaleString()}₮**-ийн эрхийн бичиг илгээлээ.\n\nCode: **${result.code}**\nPin: 1234 (Жишээ)\n\nТа энэ кодыг ашиглан худалдан авалт хийгээрэй.`;
                await chatService.sendMessage(selectedConversation.id, message, true);
            }
        } catch (error) {
            console.error("Failed to creat gift card:", error);
            alert(`Gift Card үүсгэхэд алдаа гарлаа: ${error.message}`);
        }
    };

    const messagesEndRef = useRef(null);
    const unsubscribeRef = useRef(null);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);

    // Fetch all conversations
    useEffect(() => {
        const fetchConversations = async () => {
            setIsLoading(true);
            const convs = await chatService.getAllConversations();
            setConversations(convs);
            setIsLoading(false);
        };
        fetchConversations();

        // Refresh every 30 seconds
        const interval = setInterval(fetchConversations, 30000);
        return () => clearInterval(interval);
    }, []);

    const [userData, setUserData] = useState(null);

    // Subscribe to messages when conversation selected
    useEffect(() => {
        if (!selectedConversation) return;

        if (unsubscribeRef.current) {
            unsubscribeRef.current();
        }

        // Fetch User Data if not guest
        const fetchUserData = async () => {
            if (!selectedConversation.userId || selectedConversation.userId.startsWith('guest-')) {
                setUserData(null);
                return;
            }
            try {
                const userDoc = await getDoc(doc(db, 'users', selectedConversation.userId));
                if (userDoc.exists()) {
                    setUserData(userDoc.data());
                } else {
                    setUserData(null);
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
            }
        };
        fetchUserData();

        unsubscribeRef.current = chatService.subscribeToMessages(selectedConversation.id, (msgs) => {
            setMessages(msgs);
        });

        // Mark as read by admin
        chatService.markAsRead(selectedConversation.id, true);

        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
        };
    }, [selectedConversation]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !selectedConversation) return;

        await chatService.sendMessage(selectedConversation.id, input.trim(), true);
        setInput('');
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('mn-MN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Media Handlers
    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedConversation) return;

        // Check if image
        if (!file.type.startsWith('image/')) {
            alert('Зөвхөн зураг оруулах боломжтой');
            return;
        }

        try {
            const path = `chat-attachments/${selectedConversation.id}/${Date.now()}_${file.name}`;
            const url = await chatService.uploadFile(file, path);
            await chatService.sendMessage(selectedConversation.id, '', true, null, { type: 'image', url });
            setIsMediaMenuOpen(false);
        } catch (error) {
            console.error("Failed to send image:", error);
            alert("Зураг илгээхэд алдаа гарлаа");
        }
    };

    const startRecording = async () => {
        try {
            if (!selectedConversation) return;

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
                try {
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    const audioFile = new File([audioBlob], 'voice_message.webm', { type: 'audio/webm' });
                    const path = `chat-attachments/${selectedConversation.id}/${Date.now()}_voice.webm`;
                    const url = await chatService.uploadFile(audioFile, path);
                    await chatService.sendMessage(selectedConversation.id, '', true, null, { type: 'audio', url });
                } catch (error) {
                    console.error("Failed to send voice:", error); // Added error logging
                    alert("Дуут мессеж илгээхэд алдаа гарлаа"); // Added error alert
                }

                // Stop all tracks
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

    const [showPinned, setShowPinned] = useState(false);

    // Filter pinned messages
    const pinnedMessages = messages.filter(m => m.pinned);

    // Scroll to specific message
    const scrollToMessage = (messageId) => {
        // We don't necessarily close the pinned view in admin chat, maybe keep it open or close it?
        // Let's close it for better visibility of the message context
        // setShowPinned(false); 

        const element = document.getElementById(`admin-msg-${messageId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add highlight effect
            element.classList.add('ring-2', 'ring-yellow-400');
            setTimeout(() => element.classList.remove('ring-2', 'ring-yellow-400'), 2000);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-white">
            {/* Header Title Removed as it takes space, or integrated into sidebar */}

            <div className="flex-1 flex overflow-hidden">
                {/* Conversations List */}
                <div className={`w-full md:w-1/3 border-r ${selectedConversation ? 'hidden md:block' : ''}`}>
                    <div className="p-4 border-b bg-gray-50">
                        <h2 className="font-bold text-gray-700">Харилцагчид ({conversations.length})</h2>
                    </div>
                    <div className="overflow-y-auto h-full">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-40">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="text-center text-gray-400 p-8">
                                Мессеж байхгүй байна
                            </div>
                        ) : (
                            conversations.map(conv => (
                                <button
                                    key={conv.id}
                                    onClick={() => setSelectedConversation(conv)}
                                    className={`w-full p-4 text-left border-b hover:bg-gray-50 transition ${selectedConversation?.id === conv.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                            <User size={20} className="text-gray-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-gray-800 truncate">
                                                    {conv.userName || 'Guest'}
                                                </span>
                                                {conv.unreadByAdmin > 0 && (
                                                    <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                                                        {conv.unreadByAdmin}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-500 truncate">
                                                {conv.lastMessage || 'Мессеж байхгүй'}
                                            </p>
                                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                                                <Clock size={10} />
                                                {formatTime(conv.lastMessageAt)}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat Area */}
                <div className={`flex-1 flex flex-col relative ${!selectedConversation ? 'hidden md:flex' : ''}`}>
                    {selectedConversation ? (
                        <>
                            {/* Chat Header */}
                            <div className="p-4 border-b bg-gray-50 flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setSelectedConversation(null)}
                                        className="md:hidden p-2 hover:bg-gray-200 rounded-full"
                                    >
                                        <ArrowLeft size={20} />
                                    </button>
                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                        <User size={20} className="text-blue-500" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-gray-800">
                                                {selectedConversation.userName || 'Guest'}
                                            </h3>
                                            {/* Tier Badge */}
                                            {userData?.tier && (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase
                                                        ${userData.tier === 'Platinum' ? 'bg-gray-200 text-gray-700 border border-gray-300' :
                                                        userData.tier === 'Gold' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                                                            'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                                                    {userData.tier}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            ID: {selectedConversation.userId?.slice(0, 15)}...
                                        </p>
                                    </div>
                                </div>

                                {/* Pinned Messages Toggle */}
                                <button
                                    onClick={() => setShowPinned(!showPinned)}
                                    className={`p-2 rounded-full transition relative ${showPinned ? 'bg-gray-200' : 'hover:bg-gray-200'}`}
                                    title="Pin хийсэн мессежүүд"
                                >
                                    <Pin size={20} className={pinnedMessages.length > 0 ? 'fill-current text-yellow-500' : 'text-gray-500'} />
                                    {pinnedMessages.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 text-blue-900 text-xs font-bold flex items-center justify-center rounded-full border-2 border-white">
                                            {pinnedMessages.length}
                                        </span>
                                    )}
                                </button>
                            </div>

                            {/* Pinned Messages Overlay */}
                            {showPinned && (
                                <div className="flex-1 absolute top-[73px] right-0 w-80 max-w-full h-[calc(100%-130px)] bg-white shadow-xl border-l z-20 overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                                    <div className="p-4 bg-yellow-50 border-b border-yellow-100 mb-2 sticky top-0">
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
                                                    className="w-full text-left p-3 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-100 transition group"
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${msg.isFromAdmin ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
                                                            }`}>
                                                            {msg.isFromAdmin ? 'Админ' : 'Хэрэглэгч'}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400">
                                                            {formatTime(msg.createdAt)}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-700 line-clamp-3">{msg.text}</p>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                                {messages.map(msg => (
                                    <div
                                        key={msg.id}
                                        id={`admin-msg-${msg.id}`}
                                        className={`flex ${msg.isFromAdmin ? 'justify-end' : 'justify-start'} group transition-all duration-500`}
                                    >
                                        <div
                                            className={`relative max-w-[70%] px-4 py-2 rounded-2xl ${msg.isFromAdmin
                                                ? 'bg-blue-500 text-white rounded-br-md'
                                                : 'bg-white border text-gray-800 rounded-bl-md'
                                                } ${msg.pinned ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
                                        >
                                            {/* Action Buttons (Pin & Like) */}
                                            <div className={`absolute -top-3 ${msg.isFromAdmin ? '-left-2' : '-right-2'} flex gap-2`}>
                                                {/* Pin Button */}
                                                <button
                                                    onClick={() => chatService.togglePinMessage(selectedConversation.id, msg.id, !msg.pinned)}
                                                    className={`w-6 h-6 rounded-full flex items-center justify-center shadow-sm transition-all
                                                            ${msg.pinned
                                                            ? 'bg-yellow-400 text-white opacity-100 scale-100'
                                                            : 'bg-gray-100 text-gray-400 opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 hover:bg-gray-200'
                                                        }`}
                                                >
                                                    <Pin size={12} className={msg.pinned ? 'fill-current' : ''} />
                                                </button>

                                                {/* Like Button */}
                                                <button
                                                    onClick={() => chatService.toggleLikeMessage(selectedConversation.id, msg.id, !msg.liked)}
                                                    className={`w-6 h-6 rounded-full flex items-center justify-center shadow-sm transition-all
                                                            ${msg.liked
                                                            ? 'bg-pink-500 text-white opacity-100 scale-100'
                                                            : 'bg-gray-100 text-gray-400 opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 hover:bg-gray-200'
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

                                            {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}

                                            {/* Product Metadata */}
                                            {msg.metadata?.type === 'product' && (
                                                <a
                                                    href={`/product/${msg.metadata.productId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`flex items-center gap-2 mt-2 p-2 rounded-lg transition ${msg.isFromAdmin ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-50 hover:bg-gray-100 border'
                                                        }`}
                                                >
                                                    <img
                                                        src={msg.metadata.productImage}
                                                        alt={msg.metadata.productName}
                                                        className="w-10 h-10 object-cover rounded bg-white"
                                                        onError={(e) => e.target.style.display = 'none'}
                                                    />
                                                    <div className="flex flex-col min-w-0 text-left">
                                                        <span className={`text-xs font-bold truncate block max-w-[150px] ${msg.isFromAdmin ? 'text-white' : 'text-gray-800'}`}>
                                                            {msg.metadata.productName}
                                                        </span>
                                                        <span className={`text-[10px] ${msg.isFromAdmin ? 'text-blue-200' : 'text-blue-500'}`}>
                                                            Барааг үзэх
                                                        </span>
                                                    </div>
                                                </a>
                                            )}

                                            <div className={`flex items-center justify-between mt-1 gap-2 ${msg.isFromAdmin ? 'text-blue-100' : 'text-gray-400'}`}>
                                                <div className="flex gap-1">
                                                    {msg.pinned && <Pin size={10} className="fill-current text-yellow-400" />}
                                                    {msg.liked && <Heart size={10} className="fill-current text-pink-500" />}
                                                </div>
                                                <p className="text-[10px] ml-auto">
                                                    {formatTime(msg.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="p-3 bg-white border-t relative">
                                {/* Gift Card Toolbar or Quick Actions */}
                                {isGiftCardMenuOpen && !isRecording ? (
                                    <div className="mb-2 flex items-center gap-2 overflow-x-auto no-scrollbar bg-pink-50 p-2 rounded-lg border border-pink-100 animate-in slide-in-from-bottom-2">
                                        <span className="text-xs font-bold text-pink-600 flex items-center gap-1 shrink-0">
                                            <Gift size={14} /> Gift Card:
                                        </span>
                                        {[50000, 100000, 200000, 500000].map(amt => (
                                            <button
                                                key={amt}
                                                onClick={() => handleSendGiftCard(amt)}
                                                className="whitespace-nowrap px-3 py-1 bg-white border border-pink-200 rounded-full text-xs font-bold text-pink-700 hover:bg-pink-100 transition"
                                            >
                                                {amt.toLocaleString()}₮
                                            </button>
                                        ))}
                                        <div className="flex items-center gap-1 border-l pl-2 ml-1 border-pink-200">
                                            <input
                                                id="custom-gift-input-toolbar"
                                                type="number"
                                                placeholder="Дүн..."
                                                className="w-20 px-2 py-1 text-xs border border-pink-200 rounded focus:outline-none focus:border-pink-500"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const val = Number(e.target.value);
                                                        if (val > 0) handleSendGiftCard(val);
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => {
                                                    const val = Number(document.getElementById('custom-gift-input-toolbar').value);
                                                    if (val > 0) handleSendGiftCard(val);
                                                }}
                                                className="px-2 py-1 bg-pink-500 text-white rounded text-xs font-bold hover:bg-pink-600"
                                            >
                                                OK
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => setIsGiftCardMenuOpen(false)}
                                            className="ml-auto p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : null}

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
                                                <div className="absolute bottom-12 left-0 bg-white shadow-xl border border-gray-100 rounded-xl p-2 flex flex-col gap-1 z-30 animate-in slide-in-from-bottom-2 duration-200 w-40">
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
                                                    <button
                                                        onClick={() => {
                                                            setIsMediaMenuOpen(false);
                                                            setIsGiftCardMenuOpen(true);
                                                        }}
                                                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg text-sm text-gray-700 transition"
                                                    >
                                                        <Gift size={16} className="text-pink-500" />
                                                        Gift Card
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Old Popover Removed */}

                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleFileSelect}
                                            tabIndex={-1}
                                        />

                                        <input
                                            type="text"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                            placeholder="Хариу бичих..."
                                            className="flex-1 px-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={!input.trim()}
                                            className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 transition"
                                        >
                                            <Send size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                            <div className="text-center">
                                <MessageCircle size={48} className="mx-auto mb-4 opacity-50" />
                                <p>Харилцагч сонгоно уу</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
