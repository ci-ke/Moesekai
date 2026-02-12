import { Suspense } from "react";
import { fetchMasterData } from "@/lib/fetch";
import { IEventStory } from "@/types/story";
import StoryReaderClient from "./client";

export async function generateStaticParams() {
    try {
        const eventStories = await fetchMasterData<IEventStory[]>("eventStories.json");
        const paramsSet = new Set<string>();
        const params: { eventId: string; episodeNo: string }[] = [];

        for (const story of eventStories) {
            for (const episode of story.eventStoryEpisodes) {
                const key = `${story.eventId}:${episode.episodeNo}`;
                if (!paramsSet.has(key)) {
                    paramsSet.add(key);
                    params.push({
                        eventId: story.eventId.toString(),
                        episodeNo: episode.episodeNo.toString(),
                    });
                }
            }
        }

        // Merge CN event stories
        try {
            const { fetchCnBuildMasterData } = await import("@/lib/fetch");
            const cnEventStories = await fetchCnBuildMasterData<IEventStory[]>("eventStories.json");
            for (const story of cnEventStories) {
                for (const episode of story.eventStoryEpisodes) {
                    const key = `${story.eventId}:${episode.episodeNo}`;
                    if (!paramsSet.has(key)) {
                        paramsSet.add(key);
                        params.push({
                            eventId: story.eventId.toString(),
                            episodeNo: episode.episodeNo.toString(),
                        });
                    }
                }
            }
        } catch {
            console.warn("[Build] CN eventStories not available, using JP only.");
        }

        return params;
    } catch (e) {
        console.error("Error generating static params for story episodes:", e);
        return [];
    }
}

export default function StoryEpisodePage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-spinner"></div></div>}>
            <StoryReaderClient />
        </Suspense>
    );
}
