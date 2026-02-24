
import { Suspense } from "react";
import EventDetailClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 活动详情",
};

export default function EventDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <EventDetailClient />
        </Suspense>
    );
}
