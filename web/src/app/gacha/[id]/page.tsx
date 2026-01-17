import { Suspense } from "react";
import GachaDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";
import { IGachaInfo } from "@/types/types";

// Static params for SSG
export async function generateStaticParams() {
    try {
        const gachas = await fetchMasterData<IGachaInfo[]>("gachas.json");
        return gachas.map((gacha) => ({
            id: gacha.id.toString(),
        }));
    } catch {
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
