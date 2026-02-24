
import { Suspense } from "react";
import VirtualLiveDetailClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 虚拟Live详情",
};

export default function VirtualLiveDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <VirtualLiveDetailClient />
        </Suspense>
    );
}
