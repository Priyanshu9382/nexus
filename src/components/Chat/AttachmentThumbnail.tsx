"use client";

export default function AttachmentThumbnail({ url }: { url: string }) {
    // By enforcing a fixed aspect ratio or fixed dimensions on a skeletal background frame,
    // we enforce 0 Cumulative Layout Shift when the browser finally downloads the image bytes.
    return (
        <div className="w-64 h-48 bg-black/10 rounded-lg overflow-hidden relative mb-2">
            {/* loading="lazy" applies deferred fetch mechanics off the main thread natively */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={url}
                alt="attachment"
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
            />
        </div>
    );
}
