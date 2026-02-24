
import { Suspense } from "react";
import CardDetailClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 卡牌详情",
};

export default function CardDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <CardDetailClient />
        </Suspense>
    );
}
