import { Suspense } from "react";
import { IEventInfo } from "@/types/events";
import EventDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";

export async function generateStaticParams() {
    try {
        const events = await fetchMasterData<IEventInfo[]>("events.json");
        return events.map((event) => ({
            id: event.id.toString(),
        }));
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
