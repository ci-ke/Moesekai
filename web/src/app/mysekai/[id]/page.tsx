import { Suspense } from "react";
import { IMysekaiFixtureInfo } from "@/types/mysekai";
import MysekaiFixtureDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";

export async function generateStaticParams() {
    try {
        const fixtures = await fetchMasterData<IMysekaiFixtureInfo[]>("mysekaiFixtures.json");
        return fixtures.map((fixture) => ({
            id: fixture.id.toString(),
        }));
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
