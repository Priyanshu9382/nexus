"use client";

import { useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { Message } from "@/hooks/useMessaging";
import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import AttachmentThumbnail from "./AttachmentThumbnail";

interface Props {
    messages: Message[];
    fetchOlder: () => void;
    hasMore: boolean;
    currentUserId: string;
}

export default function MessageList({ messages, fetchOlder, hasMore, currentUserId }: Props) {
    const { ref, inView } = useInView();

    useEffect(() => {
        if (inView && hasMore) {
            fetchOlder();
        }
    }, [inView, hasMore, fetchOlder]);

    // Using flex-col-reverse ensures the browser automatically anchors
    // the scroll boundary at the bottom (newest messages). This entirely
    // eliminates scroll jump/jittering when older messages load into the DOM.
    return (
        <div className="flex flex-col-reverse h-full overflow-y-auto p-4 gap-3 bg-gray-50">
            {/* Reversing array visually maps to the physically reversed DOM flow */}
            {[...messages].reverse().map((msg) => {
                const isMe = msg.senderId === currentUserId;
                return (
                    <div key={msg.id || msg.tempId} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`p-3 rounded-2xl max-w-[70%] flex flex-col ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border text-gray-800 rounded-bl-none shadow-sm'}`}>

                            {/* Media Attachment Component (Strictly prevents CLS layout jumps) */}
                            {(msg as any).attachmentUrl && (
                                <AttachmentThumbnail url={(msg as any).attachmentUrl} />
                            )}

                            {msg.content && <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>}

                            {/* Status indicator on our messages */}
                            {isMe && (
                                <div className="mt-1 self-end flex items-center opacity-90" title={msg.status}>
                                    {msg.status === 'FAILED' && <AlertCircle className="w-3.5 h-3.5 text-red-200" />}
                                    {msg.status === 'SENDING' && <Clock className="w-3 h-3 text-blue-200" />}
                                    {msg.status === 'SENT' && <Check className="w-3.5 h-3.5 text-blue-200" />}
                                    {msg.status === 'DELIVERED' && <CheckCheck className="w-3.5 h-3.5 text-gray-300" />}
                                    {msg.status === 'READ' && <CheckCheck className="w-3.5 h-3.5 text-cyan-300 drop-shadow-[0_0_2px_rgba(34,211,238,0.8)]" />}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Intersection Anchor - Triggered exactly when the user scrolls past the top message */}
            {hasMore && (
                <div ref={ref} className="w-full h-12 flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-400">Loading history...</span>
                </div>
            )}
        </div>
    );
}
