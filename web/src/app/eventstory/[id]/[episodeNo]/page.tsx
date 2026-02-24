
import { Suspense } from "react";
import StoryReaderClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 故事阅读",
};

export default function StoryEpisodePage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <StoryReaderClient />
        </Suspense>
    );
}
