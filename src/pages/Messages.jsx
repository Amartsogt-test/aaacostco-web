import { useState } from 'react';
import { Send, User, ShieldCheck } from 'lucide-react';

export default function Messages() {
    const [messages, setMessages] = useState([
        { id: 1, text: 'Сайн байна уу? Танд юугаар туслах вэ?', sender: 'admin', time: '10:00' },
    ]);
    const [inputText, setInputText] = useState('');

    const handleSend = (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        const newMessage = {
            id: Date.now(),
            text: inputText,
            sender: 'user',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages([...messages, newMessage]);
        setInputText('');

        // Mock Admin Response
        setTimeout(() => {
            const adminResponse = {
                id: Date.now() + 1,
                text: 'Баярлалаа. Бид таны асуултыг хүлээн авлаа. Түр хүлээнэ үү.',
                sender: 'admin',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, adminResponse]);
        }, 1000);
    };

    return (
        <div className="bg-gray-50 min-h-screen py-8">
            <div className="container mx-auto px-4 max-w-2xl">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-[600px] flex flex-col">

                    {/* Header */}
                    <div className="bg-costco-blue text-white p-4 flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-full">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">Хэрэглэгчийн туслах</h2>
                            <p className="text-xs text-blue-100 flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                Online
                            </p>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${msg.sender === 'user'
                                        ? 'bg-blue-600 text-white rounded-tr-none'
                                        : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                    }`}>
                                    <p className="text-sm">{msg.text}</p>
                                    <span className={`text-[10px] block text-right mt-1 ${msg.sender === 'user' ? 'text-blue-200' : 'text-gray-400'
                                        }`}>
                                        {msg.time}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSend} className="p-4 bg-white border-t flex gap-2">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Зурвас бичих..."
                            className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:ring-2 focus:ring-costco-blue outline-none text-sm"
                        />
                        <button
                            type="submit"
                            className="bg-costco-blue text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-blue-700 transition"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
