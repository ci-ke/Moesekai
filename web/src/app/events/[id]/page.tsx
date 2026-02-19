import { Suspense } from "react";
import { IEventInfo } from "@/types/events";
import EventDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";

export async function generateStaticParams() {
    try {
        const { fetchMergedBuildIds } = await import("@/lib/fetch");
        const { appendFutureIds } = await import("@/lib/future-ids");
        const ids = await fetchMergedBuildIds<IEventInfo[]>(
            "events.json",
            (events) => events.map((event) => event.id.toString())
        );
        return appendFutureIds(ids, "events").map((id) => ({ id }));
    } catch (e) {
        console.error("Error generating static params for events:", e);
        return [];
    }
}

export default function EventDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <EventDetailClient />
        </Suspense>
    );
}
