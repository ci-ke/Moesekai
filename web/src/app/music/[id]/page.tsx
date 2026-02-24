
import { Suspense } from "react";
import MusicDetailClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 音乐详情",
};

export default function MusicDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <MusicDetailClient />
        </Suspense>
    );
}
