import { Suspense } from "react";
import { ICardInfo } from "@/types/types";
import CardDetailClient from "./client";
import { fetchMasterData } from "@/lib/fetch";

export async function generateStaticParams() {
    try {
        const cards = await fetchMasterData<ICardInfo[]>("cards.json");
        return cards.map((card) => ({
            id: card.id.toString(),
        }));
    } catch (e) {
        console.error("Error generating static params for cards:", e);
        return [];
    }
}

export default function CardDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <CardDetailClient />
        </Suspense>
    );
}
