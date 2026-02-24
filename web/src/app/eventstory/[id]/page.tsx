
import { Suspense } from "react";
import EventStorySummaryClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 活动故事",
};

export default function EventStorySummaryPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <EventStorySummaryClient />
        </Suspense>
    );
}
