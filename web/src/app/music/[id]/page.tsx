import { Suspense } from "react";
import { IMusicInfo } from "@/types/music";
import MusicDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";

export async function generateStaticParams() {
    try {
        const musics = await fetchMasterData<IMusicInfo[]>("musics.json");
        return musics.map((music) => ({
            id: music.id.toString(),
        }));
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
