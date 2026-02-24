
import { Suspense } from "react";
import MysekaiFixtureDetailClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 家具详情",
};

export default function MysekaiFixtureDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <MysekaiFixtureDetailClient />
        </Suspense>
    );
}
