import { Suspense } from "react";
import GachaDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";
import { IGachaInfo } from "@/types/types";


export async function generateStaticParams() {
    console.log("Generating static params for gacha/[id]...");
    try {
        const { fetchMergedBuildIds } = await import("@/lib/fetch");
        const ids = await fetchMergedBuildIds<IGachaInfo[]>(
            "gachas.json",
            (gachas) => gachas.map((gacha) => gacha.id.toString())
        );
        console.log(`Found ${ids.length} gachas (merged JP+CN).`);
        return ids.map((id) => ({ id }));
    } catch (e) {
        console.error("Error generating static params for gacha:", e);
        return [];
    }
}

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function GachaDetailPage({ params }: PageProps) {
    const { id } = await params;
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <GachaDetailClient gachaId={id} />
        </Suspense>
    );
}
