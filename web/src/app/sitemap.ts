import { MetadataRoute } from 'next';
import { ICardInfo, IGachaInfo } from '@/types/types';
import { IMusicInfo } from '@/types/music';
import { IEventInfo } from '@/types/events';
import { fetchMasterData } from '@/lib/fetch';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://snowyviewer.exmeaning.com';

interface ITipInfo {
    id: number;
    title: string;
    assetbundleName?: string;
}

export const revalidate = 86400; // Revalidate daily

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticRoutes = [
        '',
        '/about',
        '/cards',
        '/music',
        '/events',
        '/gacha',
        '/sticker',
        '/comic',
        '/live',
        '/settings',
    ].map((route) => ({
        url: `${BASE_URL}${route}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: route === '' ? 1 : 0.8,
    }));

    try {
        const [cards, musics, events, gachas, tips] = await Promise.all([
            fetchMasterData<ICardInfo[]>('cards.json'),
            fetchMasterData<IMusicInfo[]>('musics.json'),
            fetchMasterData<IEventInfo[]>('events.json'),
            fetchMasterData<IGachaInfo[]>('gachas.json'),
            fetchMasterData<ITipInfo[]>('tips.json'),
        ]);

        const cardRoutes = cards.map((card) => ({
            url: `${BASE_URL}/cards/${card.id}`,
            lastModified: new Date(card.releaseAt || Date.now()),
            changeFrequency: 'weekly' as const,
            priority: 0.6,
        }));

        const musicRoutes = musics.map((music) => ({
            url: `${BASE_URL}/music/${music.id}`,
            lastModified: new Date(music.publishedAt || Date.now()),
            changeFrequency: 'weekly' as const,
            priority: 0.6,
        }));

        const eventRoutes = events.map((event) => ({
            url: `${BASE_URL}/events/${event.id}`,
            lastModified: new Date(event.startAt || Date.now()),
            changeFrequency: 'weekly' as const,
            priority: 0.7,
        }));

        const gachaRoutes = gachas.map((gacha) => ({
            url: `${BASE_URL}/gacha/${gacha.id}`,
            lastModified: new Date(gacha.startAt || Date.now()),
            changeFrequency: 'weekly' as const,
            priority: 0.6,
        }));

        // Only comics (tips with assetbundleName) are likely to have pages if we implemented dynamic routes for them.
        // But wait, judging by app/comic/page.tsx, there is NO dynamic route for comics like /comic/[id].
        // It uses a modal. So I should NOT generate routes for comics.
        // Checking app/comic/[id] existence... I only saw app/comic/page.tsx in file listing.
        // Let's re-verify file listing.

        return [
            ...staticRoutes,
            ...cardRoutes,
            ...musicRoutes,
            ...eventRoutes,
            ...gachaRoutes,
        ];

    } catch (error) {
        console.error('Error generating sitemap:', error);
        return staticRoutes;
    }
}
