import { Suspense } from "react";
import { IVirtualLiveInfo } from "@/types/virtualLive";
import VirtualLiveDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";

export async function generateStaticParams() {
    try {
        const { fetchMergedBuildIds } = await import("@/lib/fetch");
        const { appendFutureIds } = await import("@/lib/future-ids");
        const ids = await fetchMergedBuildIds<IVirtualLiveInfo[]>(
            "virtualLives.json",
            (vls) => vls.map((vl) => vl.id.toString())
        );
        return appendFutureIds(ids, "virtualLives").map((id) => ({ id }));
    } catch (e) {
        console.error("Error generating static params for virtual lives:", e);
        return [];
    }
}

export default function VirtualLiveDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <VirtualLiveDetailClient />
        </Suspense>
    );
}
