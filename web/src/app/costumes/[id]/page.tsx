import { Suspense } from "react";
import { ISnowyCostumesData } from "@/types/costume";
import CostumeDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";

export async function generateStaticParams() {
    try {
        const { fetchMergedBuildIds } = await import("@/lib/fetch");
        const ids = await fetchMergedBuildIds<ISnowyCostumesData>(
            "snowy_costumes.json",
            (data) => {
                const costumes = data.costumes || [];
                return [...new Set(costumes.map(c => c.costume3dGroupId))].map(id => id.toString());
            }
        );
        return ids.map((id) => ({ id }));
    } catch (e) {
        console.error("Error generating static params for costumes:", e);
        return [];
    }
}

export default function CostumeDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <CostumeDetailClient />
        </Suspense>
    );
}
