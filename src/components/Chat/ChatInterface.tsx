"use client";

import { useSession } from "next-auth/react";
import { useSocket } from "@/hooks/useSocket";
import { useMessaging } from "@/hooks/useMessaging";
import { useConversations } from "@/hooks/useConversations";
import MessageList from "./MessageList";
import MediaPicker from "./MediaPicker";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { MessageSquare, Settings, Users, Hash, Paperclip, PlusCircle, ArrowLeft, LogOut, Trash2, Smile, Loader2 } from "lucide-react";
import Link from "next/link";

export function ChatInterface() {
    const { data: session, status } = useSession();
    const currentUserId = (session?.user as any)?.id as string || "unknown";

    const { socket, isConnected } = useSocket(currentUserId);
    // Bug-fix: destructure refetch for use in startConversation
    const { conversations, error: convError, refetch: refetchConversations } = useConversations(socket, currentUserId);

    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const initialChat = searchParams?.get("chat") || null;
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialChat);

    // Sync state changes back to URL
    useEffect(() => {
        if (selectedConversationId) {
            router.replace(`${pathname}?chat=${selectedConversationId}`);
        } else {
            router.replace(pathname);
        }
    }, [selectedConversationId, pathname, router]);

    // Bug-fix #9: wire up fetchOlder and hasMore from the hook
    const { messages, sendMessage, fetchOlder, hasMore } = useMessaging(socket, selectedConversationId || "none", currentUserId);

    const [content, setContent] = useState("");
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // New Chat State
    const [showNewChatPanel, setShowNewChatPanel] = useState(false);
    const [availableUsers, setAvailableUsers] = useState<any[]>([]);

    // Bug-fix #13: Move users fetch into a useEffect — not in the render body
    useEffect(() => {
        if (showNewChatPanel && availableUsers.length === 0) {
            fetch('/api/users')
                .then((r) => r.json())
                .then((data) => setAvailableUsers(data))
                .catch(console.error);
        }
    }, [showNewChatPanel, availableUsers.length]);

    // Bug-fix #24: controlled search input
    const [searchQuery, setSearchQuery] = useState("");

    // Bug-fix #8: Remove hard window.location.href redirect — update React state instead
    const startConversation = async (userId: string) => {
        try {
            const res = await fetch('/api/conversations/new', {
                method: 'POST',
                body: JSON.stringify({ targetUserId: userId }),
                headers: { 'Content-Type': 'application/json' }
            });
            const conv = await res.json();
            if (conv.id) {
                setSelectedConversationId(conv.id);
                setShowNewChatPanel(false);
                // Refresh sidebar so the new conversation appears immediately
                await refetchConversations();
            }
        } catch (e) {
            console.error("Failed to start conversation", e);
        }
    };

    const deleteConversation = async (convId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this chat?")) return;
        try {
            const res = await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });
            if (res.ok) {
                if (selectedConversationId === convId) setSelectedConversationId(null);
                await refetchConversations();
            } else {
                console.error("Failed to delete chat");
            }
        } catch (err) {
            console.error("Error deleting chat", err);
        }
    };

    if (status === "loading") {
        return <div className="flex h-screen items-center justify-center font-medium bg-slate-50 text-slate-500 animate-pulse">Loading chat interface...</div>;
    }

    if (!session) {
        return (
            <div className="flex h-screen items-center justify-center p-4 bg-slate-50 z-50">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to Nexus Chat</h2>
                        <p className="text-slate-500">You must be signed in to access your conversations and real-time messaging.</p>
                    </div>
                    <Link href="/api/auth/signin" className="inline-block w-full bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 hover:shadow-lg transition-all active:scale-95">
                        Sign In
                    </Link>
                </div>
            </div>
        );
    }

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() && !showMediaPicker) return;
        sendMessage(content.trim());
        setContent("");
    };

    const handleMediaSelect = (url: string) => {
        sendMessage("", url, true);
        setShowMediaPicker(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsUploading(true);
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Upload failed");
            }

            const { fileUrl } = await res.json();

            sendMessage("", fileUrl);
        } catch (err: any) {
            console.error("File upload error:", err);
            alert(err.message || "Failed to upload file");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // Bug-fix #24: filter conversations by search query
    const filteredConversations = conversations.filter((c) =>
        !searchQuery || (c.name || "Direct Chat").toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
            {/* LEFT PANE: Sidebar */}
            <div className="w-80 md:w-96 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-full shadow-sm z-20">
                <header className="p-4 border-b border-slate-100 flex items-center justify-between bg-white h-[72px] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 font-bold text-white flex items-center justify-center shadow-md">
                            NC
                        </div>
                        <h1 className="font-bold text-xl text-slate-900">Chats</h1>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500">
                        <button onClick={() => setShowNewChatPanel(true)} className="p-2 hover:bg-slate-100 rounded-full transition-colors active:bg-slate-200">
                            <PlusCircle className="w-5 h-5 text-indigo-600" />
                        </button>
                        <Link href="/api/auth/signout" className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors active:bg-red-100 ml-2" title="Sign Out">
                            <LogOut className="w-5 h-5" />
                        </Link>
                    </div>
                </header>

                <div className="p-3">
                    {/* Bug-fix #24: controlled search input */}
                    <input
                        type="text"
                        placeholder="Search chats..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-100 text-slate-900 placeholder-slate-500 text-sm border-none rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-100 transition shadow-inner"
                    />
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300">
                    {showNewChatPanel ? (
                        <div className="h-full bg-white relative z-10 animate-in fade-in slide-in-from-right-4 duration-200">
                            <div className="p-3 border-b border-slate-100 flex items-center gap-3 bg-slate-50 top-0 sticky">
                                <button onClick={() => setShowNewChatPanel(false)} className="p-2 hover:bg-slate-200 rounded-full transition">
                                    <ArrowLeft className="w-5 h-5 text-slate-600" />
                                </button>
                                <h3 className="font-semibold text-slate-800">Start new chat</h3>
                            </div>
                            <ul className="px-2 py-2 space-y-1">
                                {availableUsers.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 text-sm">No other users found on the platform yet.</div>
                                ) : (
                                    availableUsers.map(user => (
                                        <li key={user.id}>
                                            <button onClick={() => startConversation(user.id)} className="w-full p-3 flex items-center gap-3 transition text-left rounded-2xl border-l-[3px] hover:bg-slate-50 border-l-transparent">
                                                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold shrink-0">
                                                    {user.username.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-semibold text-slate-900">{user.username}</span>
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>
                    ) : (
                        <>
                            {filteredConversations.length === 0 && !convError && (
                                <div className="p-8 text-center text-slate-500 space-y-4">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto border border-dashed border-slate-200">
                                        <Users className="w-6 h-6 text-slate-300" />
                                    </div>
                                    <p className="text-sm">
                                        {searchQuery ? "No chats match your search." : "No conversations found."}
                                    </p>
                                </div>
                            )}
                            <ul className="px-2 space-y-1">
                                {filteredConversations.map((conv) => {
                                    const isSelected = selectedConversationId === conv.id;
                                    return (
                                        <li key={conv.id} className="relative group">
                                            <button
                                                onClick={() => setSelectedConversationId(conv.id)}
                                                className={`w-full p-3 flex items-center gap-3 transition text-left rounded-2xl border-l-[3px] 
                                                    ${isSelected ? "bg-indigo-50 border-l-indigo-600 shadow-sm" : "hover:bg-slate-50 border-l-transparent"}
                                                `}
                                            >
                                                {/* Bug-fix #29: use Users icon for GROUP, person initial for DIRECT */}
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-bold text-lg ${conv.type === "GROUP" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"}`}>
                                                    {conv.type === "GROUP"
                                                        ? <Users className="w-6 h-6" />
                                                        : (conv.name?.charAt(0).toUpperCase() || <Hash className="w-5 h-5" />)
                                                    }
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-baseline mb-0.5">
                                                        <h3 className={`text-[15px] truncate ${isSelected ? "font-bold text-indigo-950" : "font-semibold text-slate-900"}`}>
                                                            {conv.name || "Direct Chat"}
                                                        </h3>
                                                        <span className="text-xs text-slate-400 shrink-0 font-medium">
                                                            {new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className={`text-[13px] truncate ${isSelected ? "text-indigo-600/80" : "text-slate-500"}`}>
                                                        Click to view chat
                                                    </p>
                                                </div>
                                            </button>
                                            <button
                                                onClick={(e) => deleteConversation(conv.id, e)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                                                title="Delete Chat"
                                            >
                                                <Trash2 className="w-[18px] h-[18px]" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>
            </div>

            {/* RIGHT PANE: Main Chat Area */}
            <div className="flex-1 flex flex-col h-full bg-slate-50/50 relative min-w-0">
                {!selectedConversationId ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-6 p-8 text-center bg-slate-50 object-cover bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
                        <div className="w-24 h-24 bg-white shadow-xl rounded-full flex items-center justify-center text-slate-300">
                            <MessageSquare className="w-10 h-10" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-700">Nexus for Web</h2>
                        <p className="text-[15px] font-medium text-slate-500 max-w-sm">Select a conversation from the sidebar to view your messages or start a new real-time chat.</p>
                    </div>
                ) : (
                    <>
                        {/* Header for Chat Area */}
                        <header className="px-6 py-3 border-b border-slate-200 bg-white/90 backdrop-blur-xl flex items-center justify-between shrink-0 h-[72px] z-10 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold text-lg">
                                    {conversations.find(c => c.id === selectedConversationId)?.name?.charAt(0).toUpperCase() || "?"}
                                </div>
                                <div>
                                    <h2 className="font-bold text-slate-900 text-base leading-tight">
                                        {conversations.find(c => c.id === selectedConversationId)?.name || "Direct Chat"}
                                    </h2>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 animate-pulse"}`}></span>
                                        <span className="text-[12px] font-medium text-slate-500">
                                            {isConnected ? "Connected" : "Reconnecting..."}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </header>

                        <div className="flex-1 overflow-hidden relative border-b border-slate-200 bg-slate-100 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
                            <div className="absolute inset-x-0 bottom-0 top-0 overflow-y-auto">
                                {/* Bug-fix #9: pass real fetchOlder and hasMore */}
                                <MessageList
                                    messages={messages}
                                    currentUserId={currentUserId}
                                    fetchOlder={fetchOlder}
                                    hasMore={hasMore}
                                />
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="relative bg-slate-50 p-4 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
                            {showMediaPicker && (
                                <div className="absolute bottom-full left-4 right-4 mb-4 shadow-2xl rounded-2xl overflow-hidden border border-slate-200 bg-white z-50 animate-in slide-in-from-bottom-2 fade-in duration-200">
                                    <div className="flex justify-between items-center p-3 border-b border-slate-100">
                                        <span className="font-semibold text-sm text-slate-700">Stickers & GIFs</span>
                                        <button onClick={() => setShowMediaPicker(false)} className="text-slate-400 hover:text-slate-700">✕</button>
                                    </div>
                                    <div className="p-2">
                                        <MediaPicker
                                            onSelect={handleMediaSelect}
                                            onClose={() => setShowMediaPicker(false)}
                                        />
                                    </div>
                                </div>
                            )}
                            <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-2">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: "none" }}
                                    accept="image/*,video/*"
                                    onChange={handleFileUpload}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className="text-slate-500 transition w-12 h-12 flex items-center justify-center rounded-full hover:bg-slate-200 hover:text-slate-700 focus:ring-2 ring-indigo-200 disabled:opacity-50"
                                    title="Attach File"
                                >
                                    {isUploading ? <Loader2 className="w-[22px] h-[22px] animate-spin" /> : <Paperclip className="w-[22px] h-[22px]" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowMediaPicker(!showMediaPicker)}
                                    className={`text-slate-500 transition w-12 h-12 flex items-center justify-center rounded-full hover:bg-slate-200 hover:text-slate-700 focus:ring-2 ring-indigo-200 ${showMediaPicker ? "bg-slate-200 text-slate-800" : ""}`}
                                    title="Send Sticker / GIF"
                                >
                                    <Smile className="w-[22px] h-[22px]" />
                                </button>
                                <input
                                    className="flex-1 px-5 py-3.5 rounded-2xl border-none bg-white shadow-sm ring-1 ring-slate-200 hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900 placeholder:text-slate-400 text-[15px]"
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    placeholder="Message..."
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={!content.trim() && !showMediaPicker}
                                    className="ml-1 bg-indigo-600 text-white w-12 h-12 flex items-center justify-center rounded-full font-medium disabled:opacity-40 disabled:hover:scale-100 hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all active:scale-95"
                                >
                                    <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                </button>
                            </form>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
