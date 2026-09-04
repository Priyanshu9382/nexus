"use client";

import { useState } from "react";

const DEMO_GIFS = [
    "https://api.dicebear.com/9.x/thumbs/svg?seed=Felix",
    "https://api.dicebear.com/9.x/thumbs/svg?seed=Aneka",
    "https://api.dicebear.com/9.x/thumbs/svg?seed=Peanut",
    "https://api.dicebear.com/9.x/thumbs/svg?seed=Tinkerbell",
    "https://api.dicebear.com/9.x/thumbs/svg?seed=Sasha",
    "https://api.dicebear.com/9.x/thumbs/svg?seed=Coco",
];

const DEMO_STICKERS = [
    "https://api.dicebear.com/9.x/fun-emoji/svg?seed=1",
    "https://api.dicebear.com/9.x/fun-emoji/svg?seed=2",
    "https://api.dicebear.com/9.x/fun-emoji/svg?seed=3",
    "https://api.dicebear.com/9.x/fun-emoji/svg?seed=4",
    "https://api.dicebear.com/9.x/fun-emoji/svg?seed=5",
    "https://api.dicebear.com/9.x/fun-emoji/svg?seed=6",
];

export default function MediaPicker({ onSelect, onClose }: { onSelect: (url: string) => void, onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<"GIF" | "STICKER">("GIF");

    const items = activeTab === "GIF" ? DEMO_GIFS : DEMO_STICKERS;

    return (
        <div className="flex flex-col h-[300px]">
            <div className="flex gap-4 border-b pb-3 mb-3 px-2">
                <button type="button" onClick={() => setActiveTab("GIF")} className={activeTab === 'GIF' ? 'font-bold text-indigo-600' : 'text-slate-500 font-medium hover:text-slate-800 transition-colors'}>GIFs</button>
                <button type="button" onClick={() => setActiveTab("STICKER")} className={activeTab === 'STICKER' ? 'font-bold text-indigo-600' : 'text-slate-500 font-medium hover:text-slate-800 transition-colors'}>Stickers</button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-slate-200">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 pb-2">
                    {items.map((url) => (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            key={url}
                            src={url}
                            alt="Media item"
                            className="w-full aspect-square object-cover cursor-pointer hover:bg-slate-100 p-2 rounded-2xl transition-all hover:scale-110 active:scale-95 border border-transparent hover:border-slate-200"
                            onClick={() => { onSelect(url); onClose(); }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
