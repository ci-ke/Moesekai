/**
 * Web Worker for score-control deck building
 * Uses EventBonusDeckRecommend to find decks with exact target event bonus
 *
 * 组卡代码来源: sekai-calculator (https://github.com/pjsek-ai/sekai-calculator)
 * 部分算法优化修改于: https://github.com/NeuraXmy/sekai-deck-recommend-cpp  作者: luna茶
 */
import {
    CachedDataProvider,
    DataProvider,
    EventBonusDeckRecommend,
    LiveCalculator,
    LiveType,
    MusicMeta,
} from "sekai-calculator";

// ==================== INLINED DATA PROVIDER ====================

// Music meta URL
const MUSIC_META_URL = "https://assets.exmeaning.com/musicmeta/music_metas.json";

// Master data URLs - use project's self-hosted official source
const MASTER_DATA_BASES: Record<string, string> = {
    jp: "https://sekaimaster.exmeaning.com/master",
    cn: "https://sekaimaster-cn.exmeaning.com/master",
};

// Haruki suite API base
const HARUKI_SUITE_API = "https://suite-api.haruki.seiunx.com/public";

// User data keys needed for deck recommendation
const USER_DATA_KEYS = [
    "userCards", "userBonds", "userDecks", "userGamedata", "userMusics",
    "userMusicResults", "userMysekaiMaterials", "userAreas",
    "userChallengeLiveSoloDecks", "userCharacters",
    "userCharacterMissionV2Statuses", "userMysekaiCanvases",
    "userCharacterMissionV2s", "userMysekaiFixtureGameCharacterPerformanceBonuses",
    "userMysekaiGates", "userWorldBloomSupportDecks", "userHonors",
    "userMysekaiCharacterTalks", "userChallengeLiveSoloResults",
    "userChallengeLiveSoloStages", "userChallengeLiveSoloHighScoreRewards",
    "userEvents", "userWorldBlooms", "userMusicAchievements",
    "userPlayerFrames", "userMaterials", "upload_time",
].join(",");

// Master data keys needed for preloading
const PRELOAD_MASTER_KEYS = [
    "areaItemLevels", "cards", "cardMysekaiCanvasBonuses", "cardRarities",
    "characterRanks", "cardEpisodes", "events", "eventCards",
    "eventRarityBonusRates", "eventDeckBonuses", "gameCharacters",
    "gameCharacterUnits", "honors", "masterLessons", "mysekaiGates",
    "mysekaiGateLevels", "skills", "worldBloomDifferentAttributeBonuses",
    "worldBloomSupportDeckBonuses", "worldBloomSupportDeckUnitEventLimitedBonuses",
];

type HarukiServer = "jp" | "cn" | "tw";

interface CardParameterEntry {
    id: number;
    cardId: number;
    cardLevel: number;
    cardParameterType: string;
    power: number;
}

interface CardWithParameters {
    id: number;
    cardParameters?: Record<string, number[]> | CardParameterEntry[];
    [key: string]: unknown;
}

interface UserCardEntry {
    cardId: number;
    [key: string]: unknown;
}

interface UserHonorEntry {
    honorId: number;
    [key: string]: unknown;
}

interface EventInfoLite {
    id: number;
    eventType?: string;
}

type UserDataMap = Record<string, unknown>;
type DeckResultRow = Record<string, unknown>;

/**
 * Transform official cardParameters format to sekai-calculator expected format.
 * Official: { param1: number[], param2: number[], param3: number[] }
 * sekai-calculator expects: Array<{ id, cardId, cardLevel, cardParameterType, power }>
 */
function transformCards(cards: CardWithParameters[]): CardWithParameters[] {
    return cards.map((card) => {
        if (!card.cardParameters || Array.isArray(card.cardParameters)) {
            return card;
        }
        const params = card.cardParameters;
        const transformed: CardParameterEntry[] = [];
        for (const [paramType, powers] of Object.entries(params)) {
            powers.forEach((power: number, index: number) => {
                const cardLevel = index + 1;
                const paramIndex = paramType === "param1" ? 1 : paramType === "param2" ? 2 : 3;
                const id = paramIndex * 10000 + (card.id % 10000) * 100 + cardLevel;
                transformed.push({
                    id,
                    cardId: card.id,
                    cardLevel,
                    cardParameterType: paramType,
                    power,
                });
            });
        }
        return { ...card, cardParameters: transformed };
    });
}

function calcDuration() {
    const startAt = performance.now();
    return {
        startAt,
        done() {
            return performance.now() - startAt;
        },
    };
}

class SnowyDataProvider implements DataProvider {
    private userDataCache: UserDataMap | null = null;

    constructor(
        private userId: string,
        private server: HarukiServer = "jp"
    ) {
        if (!["jp", "cn", "tw"].includes(server)) {
            throw new Error(`Unsupported server: ${server}. Only JP, CN, and TW are supported.`);
        }
    }

    public static getCachedInstance(userId: string, server: HarukiServer = "jp"): CachedDataProvider {
        return new CachedDataProvider(new SnowyDataProvider(userId, server));
    }

    private async fetchMasterJson(base: string, key: string): Promise<unknown[] | null> {
        try {
            const response = await fetch(`${base}/${key}.json`);
            if (!response.ok) return null;
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("text/html")) return null;
            const text = await response.text();
            if (text.trimStart().startsWith("<")) return null;
            const parsed = JSON.parse(text) as unknown;
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }

    async getMasterData<T>(key: string): Promise<T[]> {
        const base = MASTER_DATA_BASES["jp"];
        let data = await this.fetchMasterJson(base, key);
        if (data === null) {
            console.warn(`[DeckRecommend] Master data "${key}" not available, using empty array`);
            return [] as T[];
        }
        if (key === "cards") {
            data = transformCards(data as CardWithParameters[]);
        }
        return data as T[];
    }

    async getMusicMeta(): Promise<MusicMeta[]> {
        const response = await fetch(MUSIC_META_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch music meta (${response.status})`);
        }
        return response.json();
    }

    async getUserData<T>(key: string): Promise<T> {
        const all = await this.getUserDataAll();
        if (!(key in all)) {
            throw new Error(`User data key not found: ${key}`);
        }
        return all[key];
    }

    async getUserDataAll(): Promise<UserDataMap> {
        if (this.userDataCache) return this.userDataCache;

        const url = `${HARUKI_SUITE_API}/${this.server}/suite/${this.userId}?key=${USER_DATA_KEYS}`;
        const response = await fetch(url);

        if (response.status === 404) {
            throw new Error("USER_NOT_FOUND");
        }
        if (response.status === 403) {
            throw new Error("API_NOT_PUBLIC");
        }
        if (!response.ok) {
            throw new Error(`Failed to fetch user data (${response.status})`);
        }

        const data = (await response.json()) as UserDataMap & {
            userCards?: UserCardEntry[];
            userHonors?: UserHonorEntry[];
        };

        // Filter userCards to ensure only cards existing in JP master data are returned
        if (data.userCards && Array.isArray(data.userCards)) {
            try {
                const masterCards = await this.getMasterData<{ id: number }>("cards");
                const masterCardIds = new Set(masterCards.map((c) => c.id));
                const originalCount = data.userCards.length;
                data.userCards = data.userCards.filter((uc) => masterCardIds.has(uc.cardId));
                console.log(`[DeckRecommend] Filtered userCards: ${originalCount} -> ${data.userCards.length}`);
            } catch (e) {
                console.error("[DeckRecommend] Failed to filter userCards", e);
            }
        }

        // Filter userHonors
        if (data.userHonors && Array.isArray(data.userHonors)) {
            try {
                const masterHonors = await this.getMasterData<{ id: number }>("honors");
                const masterHonorIds = new Set(masterHonors.map((h) => h.id));
                const originalCount = data.userHonors.length;
                data.userHonors = data.userHonors.filter((h) => masterHonorIds.has(h.honorId));
                console.log(`[DeckRecommend] Filtered userHonors: ${originalCount} -> ${data.userHonors.length}`);
            } catch (e) {
                console.error("[DeckRecommend] Failed to filter userHonors", e);
            }
        }

        this.userDataCache = data;
        return data;
    }
}

// ==================== WORKER LOGIC ====================

// Types

export interface DeckBuilderInput {
    userId: string;
    server: string;
    eventId: number;
    minBonus: number;
    maxBonus: number;
    liveType: string; // "multi" | "solo" | "auto" | "cheerful"
    musicId: number;
    difficulty: string;
    supportCharacterId?: number;
    cardConfig: Record<string, unknown>;
}

export interface DeckBuilderOutput {
    result?: DeckResultRow[];
    userCards?: UserCardEntry[];
    duration?: number;
    error?: string;
    upload_time?: number;
}

async function deckBuilderRunner(args: DeckBuilderInput): Promise<DeckBuilderOutput> {
    const {
        userId, server, eventId, minBonus, maxBonus,
        liveType: liveTypeStr, musicId, difficulty,
        supportCharacterId, cardConfig,
    } = args;

    const dataProvider = new CachedDataProvider(
        new SnowyDataProvider(userId, server as HarukiServer)
    );

    // Parallel preload all data
    await Promise.all([
        dataProvider.getUserDataAll(),
        dataProvider.getMusicMeta(),
        dataProvider.preloadMasterData(PRELOAD_MASTER_KEYS),
    ]);

    const userCards = await dataProvider.getUserData<UserCardEntry[]>("userCards");
    const uploadTime = await dataProvider.getUserData<number | undefined>("upload_time").catch(() => undefined);

    const liveCalculator = new LiveCalculator(dataProvider);
    const musicMeta = await liveCalculator.getMusicMeta(musicId, difficulty);

    // Map liveType string to enum
    let computedLiveType: LiveType;
    switch (liveTypeStr) {
        case "solo":
            computedLiveType = LiveType.SOLO;
            break;
        case "auto":
            computedLiveType = LiveType.AUTO;
            break;
        case "cheerful":
            computedLiveType = LiveType.CHEERFUL;
            break;
        case "multi":
        default:
            computedLiveType = LiveType.MULTI;
            break;
    }

    // Check event type for cheerful carnival conversion
    const events = await dataProvider.getMasterData<EventInfoLite>("events");
    const event0 = events.find((it) => it.id === eventId);
    if (!event0) throw new Error(`Event not found: ${eventId}`);

    if (event0.eventType === "cheerful_carnival" && computedLiveType === LiveType.MULTI) {
        computedLiveType = LiveType.CHEERFUL;
    }

    const recommend = new EventBonusDeckRecommend(dataProvider);
    const currentDuration = calcDuration();

    const result = await recommend.recommendEventBonusDeck(
        eventId,
        minBonus,
        computedLiveType,
        {
            musicMeta,
            member: 5,
            cardConfig,
            debugLog: (str: string) => {
                console.log("[DeckBuilder]", str);
            },
        },
        supportCharacterId || 0,
        maxBonus
    );

    return {
        result: result as DeckResultRow[],
        userCards,
        duration: currentDuration.done(),
        upload_time: uploadTime,
    };
}

// Worker message handler
addEventListener("message", (event: MessageEvent<{ args: DeckBuilderInput }>) => {
    deckBuilderRunner(event.data.args)
        .then((output) => {
            postMessage(output);
        })
        .catch((err) => {
            postMessage({
                error: err.message || String(err),
            });
        });
});
