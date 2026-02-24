
import { Suspense } from "react";
import GachaDetailClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 卡池详情",
};

export default function GachaDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <GachaDetailClient />
        </Suspense>
    );
}
