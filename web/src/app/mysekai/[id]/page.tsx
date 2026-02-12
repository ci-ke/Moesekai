import { Suspense } from "react";
import { IMysekaiFixtureInfo } from "@/types/mysekai";
import MysekaiFixtureDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";

export async function generateStaticParams() {
    try {
        const { fetchMergedBuildIds } = await import("@/lib/fetch");
        const ids = await fetchMergedBuildIds<IMysekaiFixtureInfo[]>(
            "mysekaiFixtures.json",
            (fixtures) => fixtures.map((fixture) => fixture.id.toString())
        );
        return ids.map((id) => ({ id }));
    } catch (e) {
        console.error("Error generating static params for mysekai fixtures:", e);
        return [];
    }
}

export default function MysekaiFixtureDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <MysekaiFixtureDetailClient />
        </Suspense>
    );
}
