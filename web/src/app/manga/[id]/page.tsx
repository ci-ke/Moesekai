
import { Suspense } from "react";
import MangaDetailClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 官方四格",
};

export default function MangaDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <MangaDetailClient />
        </Suspense>
    );
}
