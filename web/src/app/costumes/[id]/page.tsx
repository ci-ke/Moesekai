
import { Suspense } from "react";
import CostumeDetailClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 服装详情",
};

export default function CostumeDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <CostumeDetailClient />
        </Suspense>
    );
}
