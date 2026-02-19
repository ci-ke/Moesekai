import { Suspense } from "react";
import { IMusicInfo } from "@/types/music";
import MusicDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";

export async function generateStaticParams() {
    try {
        const { fetchMergedBuildIds } = await import("@/lib/fetch");
        const { appendFutureIds } = await import("@/lib/future-ids");
        const ids = await fetchMergedBuildIds<IMusicInfo[]>(
            "musics.json",
            (musics) => musics.map((music) => music.id.toString())
        );
        return appendFutureIds(ids, "musics").map((id) => ({ id }));
    } catch (e) {
        console.error("Error generating static params for musics:", e);
        return [];
    }
}

export default function MusicDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <MusicDetailClient />
        </Suspense>
    );
}
