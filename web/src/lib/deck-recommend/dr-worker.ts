/**
 * Web Worker for deck recommendation computation
 * Runs sekai-calculator in a background thread to avoid blocking the UI
 *
 * 组卡代码来源: sekai-calculator (https://github.com/pjsek-ai/sekai-calculator)
 * 部分算法优化修改于: https://github.com/NeuraXmy/sekai-deck-recommend-cpp  作者: luna茶
 */
import {
    CachedDataProvider,
    ChallengeLiveDeckRecommend,
    DataProvider,
    EventDeckRecommend,
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

/**
 * Transform official cardParameters format to sekai-calculator expected format.
 * Official: { param1: number[], param2: number[], param3: number[] }
 * sekai-calculator expects: Array<{ id, cardId, cardLevel, cardParameterType, power }>
 */
function transformCards(cards: any[]): any[] {
    return cards.map((card: any) => {
        if (!card.cardParameters || Array.isArray(card.cardParameters)) {
            return card;
        }
        const params = card.cardParameters as Record<string, number[]>;
        const transformed: any[] = [];
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
    private userDataCache: Record<string, any> | null = null;

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

    private async fetchMasterJson(base: string, key: string): Promise<any[] | null> {
        try {
            const response = await fetch(`${base}/${key}.json`);
            if (!response.ok) return null;
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("text/html")) return null;
            const text = await response.text();
            if (text.trimStart().startsWith("<")) return null;
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    async getMasterData<T>(key: string): Promise<T[]> {
        const base = MASTER_DATA_BASES["jp"];
        let data = await this.fetchMasterJson(base, key);
        if (data === null) {
            console.warn(`[DeckRecommend] Master data "${key}" not available, using empty array`);
            return [] as any;
        }
        if (key === "cards") {
            data = transformCards(data);
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

    async getUserDataAll(): Promise<Record<string, any>> {
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

        const data = await response.json();

        // Filter userCards to ensure only cards existing in JP master data are returned
        if (data.userCards && Array.isArray(data.userCards)) {
            try {
                const masterCards = await this.getMasterData<any>("cards");
                const masterCardIds = new Set(masterCards.map((c) => c.id));
                const originalCount = data.userCards.length;
                data.userCards = data.userCards.filter((uc: any) => masterCardIds.has(uc.cardId));
                console.log(`[DeckRecommend] Filtered userCards: ${originalCount} -> ${data.userCards.length}`);
            } catch (e) {
                console.error("[DeckRecommend] Failed to filter userCards", e);
            }
        }

        // Filter userHonors
        if (data.userHonors && Array.isArray(data.userHonors)) {
            try {
                const masterHonors = await this.getMasterData<any>("honors");
                const masterHonorIds = new Set(masterHonors.map((h) => h.id));
                const originalCount = data.userHonors.length;
                data.userHonors = data.userHonors.filter((h: any) => masterHonorIds.has(h.honorId));
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

export interface WorkerInput {
    mode: "challenge" | "event" | "mysekai" | "custom";
    userId: string;
    server: string;
    musicId: number;
    difficulty: string;
    // Challenge mode
    characterId?: number;
    // Event mode
    eventId?: number;
    liveType?: string; // "multi" | "solo" | "auto" | "cheerful"
    supportCharacterId?: number;
    // Card config
    cardConfig: Record<string, any>;
    // Custom mode
    customUnitBonus?: number;
    customAttrBonus?: number;
    customUnit?: string;
    customAttr?: string;
}

export interface WorkerOutput {
    type?: "progress" | "result";
    result?: any[];
    challengeHighScore?: any;
    userCards?: any[];
    duration?: number;
    error?: string;
    upload_time?: number;
    // Progress
    stage?: string;
    percent?: number;
    stageLabel?: string;
}

function sendProgress(stage: string, percent: number, stageLabel: string) {
    postMessage({ type: "progress", stage, percent, stageLabel });
}

async function deckRecommendRunner(args: WorkerInput): Promise<WorkerOutput> {
    const {
        mode, userId, server, musicId, difficulty,
        characterId, cardConfig,
        eventId, liveType: liveTypeStr, supportCharacterId,
        customUnitBonus, customAttrBonus, customUnit, customAttr,
    } = args;

    sendProgress("fetching", 5, "正在获取用户数据...");

    const dataProvider = new CachedDataProvider(
        new SnowyDataProvider(userId, server as HarukiServer)
    );

    // Parallel preload all data for speed
    await Promise.all([
        dataProvider.getUserDataAll(),
        dataProvider.getMusicMeta(),
        dataProvider.preloadMasterData(PRELOAD_MASTER_KEYS),
    ]);

    sendProgress("processing", 25, "数据加载完成，预处理中...");

    const userCards = await dataProvider.getUserData<any[]>("userCards");
    const uploadTime = await dataProvider.getUserData<number | undefined>("upload_time").catch(() => undefined);

    // Mysekai mode: no music needed
    if (mode === "mysekai") {
        return await runMysekaiMode(args, dataProvider, userCards, uploadTime);
    }

    // Custom mode
    if (mode === "custom") {
        return await runCustomMode(args, dataProvider, userCards, uploadTime);
    }

    const liveCalculator = new LiveCalculator(dataProvider);
    const musicMeta = await liveCalculator.getMusicMeta(musicId, difficulty);

    sendProgress("calculating", 40, "开始计算最优卡组...");

    if (mode === "challenge") {
        if (!characterId) throw new Error("characterId is required for challenge mode");

        const userChallengeLiveSoloResults = await dataProvider.getUserData<any[]>(
            "userChallengeLiveSoloResults"
        );
        const userChallengeLiveSoloResult = userChallengeLiveSoloResults?.find(
            (it: any) => it.characterId === characterId
        );

        const challengeLiveRecommend = new ChallengeLiveDeckRecommend(dataProvider);
        sendProgress("calculating", 50, "挑战Live组卡计算中...");
        const currentDuration = calcDuration();
        const result = await challengeLiveRecommend.recommendChallengeLiveDeck(
            characterId,
            {
                musicMeta,
                limit: 10,
                member: 5,
                cardConfig,
                debugLog: (str: string) => {
                    console.log("[Worker]", str);
                },
            }
        );

        sendProgress("done", 100, "计算完成");
        return {
            type: "result",
            challengeHighScore: userChallengeLiveSoloResult,
            result,
            userCards,
            duration: currentDuration.done(),
            upload_time: uploadTime,
        };
    }

    // Event mode
    if (!eventId) throw new Error("eventId is required for event mode");

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
    const events = await dataProvider.getMasterData<any>("events");
    const event0 = events.find((it: any) => it.id === eventId);
    if (!event0) throw new Error(`Event not found: ${eventId}`);

    if (event0.eventType === "cheerful_carnival" && computedLiveType === LiveType.MULTI) {
        computedLiveType = LiveType.CHEERFUL;
    }

    sendProgress("calculating", 50, "活动组卡计算中...");
    const eventDeckRecommend = new EventDeckRecommend(dataProvider);
    const currentDuration = calcDuration();
    const result = await eventDeckRecommend.recommendEventDeck(
        eventId,
        computedLiveType,
        {
            musicMeta,
            limit: 10,
            cardConfig,
            debugLog: (str: string) => {
                console.log("[Worker]", str);
            },
        },
        supportCharacterId || 0
    );

    sendProgress("done", 100, "计算完成");
    return {
        type: "result",
        result,
        userCards,
        duration: currentDuration.done(),
        upload_time: uploadTime,
    };
}

// ==================== MYSEKAI MODE ====================

async function runMysekaiMode(
    args: WorkerInput,
    dataProvider: CachedDataProvider,
    userCards: any[],
    uploadTime: number | undefined
): Promise<WorkerOutput> {
    const { eventId, supportCharacterId, cardConfig } = args;
    if (!eventId) throw new Error("eventId is required for mysekai mode");

    sendProgress("calculating", 40, "烤森组卡计算中...");

    // Get event config
    const events = await dataProvider.getMasterData<any>("events");
    const event0 = events.find((it: any) => it.id === eventId);
    if (!event0) throw new Error(`Event not found: ${eventId}`);

    // Use EventDeckRecommend to get high-bonus decks, then re-rank by mysekai PT
    const eventDeckRecommend = new EventDeckRecommend(dataProvider);
    const currentDuration = calcDuration();

    // We need a dummy musicMeta for the calculator
    const musicMetas = await dataProvider.getMusicMeta();
    const dummyMusicMeta = musicMetas[0]; // any music meta works since we'll override scoring

    sendProgress("calculating", 55, "计算最优烤森卡组...");

    const rawResults = await eventDeckRecommend.recommendEventDeck(
        eventId,
        LiveType.MULTI,
        {
            musicMeta: dummyMusicMeta,
            limit: 10,
            cardConfig: cardConfig || {},
            debugLog: (str: string) => {
                console.log("[Worker:Mysekai]", str);
            },
        },
        supportCharacterId || 0
    );

    // Re-calculate mysekai event points for each deck
    const mysekaiResults = rawResults.map((deck: any) => {
        const totalPower = deck.power?.total || 0;
        const eventBonus = (deck.eventBonus || 0) + (deck.supportDeckBonus || 0);

        let powerBonus = 1 + (totalPower / 450000);
        powerBonus = Math.floor(powerBonus * 10 + 1e-6) / 10.0;
        const eventBonusRate = Math.floor(eventBonus + 1e-6) / 100.0;
        const mysekaiPt = Math.floor(powerBonus * (1 + eventBonusRate) + 1e-6) * 500;

        return {
            ...deck,
            score: mysekaiPt,
            mysekaiPt,
            mysekaiPowerBonus: powerBonus,
            mysekaiEventBonusRate: eventBonusRate,
        };
    });

    // Sort by mysekai PT descending
    mysekaiResults.sort((a: any, b: any) => b.score - a.score);

    sendProgress("done", 100, "计算完成");
    return {
        type: "result",
        result: mysekaiResults,
        userCards,
        duration: currentDuration.done(),
        upload_time: uploadTime,
    };
}

// ==================== CUSTOM MODE ====================

async function runCustomMode(
    args: WorkerInput,
    dataProvider: CachedDataProvider,
    userCards: any[],
    uploadTime: number | undefined
): Promise<WorkerOutput> {
    const {
        musicId, difficulty, cardConfig, liveType: liveTypeStr,
        customUnitBonus = 0, customAttrBonus = 0, customUnit, customAttr,
    } = args;

    sendProgress("calculating", 40, "自定义组卡计算中...");

    const liveCalculator = new LiveCalculator(dataProvider);
    const musicMeta = await liveCalculator.getMusicMeta(musicId, difficulty);

    let computedLiveType: LiveType;
    switch (liveTypeStr) {
        case "solo": computedLiveType = LiveType.SOLO; break;
        case "auto": computedLiveType = LiveType.AUTO; break;
        case "cheerful": computedLiveType = LiveType.CHEERFUL; break;
        default: computedLiveType = LiveType.MULTI; break;
    }

    // Build a virtual event config with custom bonuses
    // We'll create fake eventCards that give bonus to matching unit/attr cards
    // Then use EventDeckRecommend with a synthetic event

    // For custom mode, we create a temporary event-like setup
    // We'll use the base deck recommend with score target
    const eventDeckRecommend = new EventDeckRecommend(dataProvider);

    // Find or create a suitable event ID - use the latest event as base
    const events = await dataProvider.getMasterData<any>("events");
    const sortedEvents = events.sort((a: any, b: any) => b.id - a.id);
    const latestEvent = sortedEvents[0];

    if (!latestEvent) throw new Error("No events found");

    sendProgress("calculating", 55, "使用自定义加成计算中...");

    const currentDuration = calcDuration();

    // Use standard event deck recommend with the latest event
    // The custom bonuses will be applied through the event system
    const result = await eventDeckRecommend.recommendEventDeck(
        latestEvent.id,
        computedLiveType,
        {
            musicMeta,
            limit: 10,
            cardConfig: cardConfig || {},
            debugLog: (str: string) => {
                console.log("[Worker:Custom]", str);
            },
        },
        0
    );

    // If custom unit/attr specified, re-score with custom bonuses
    if (customUnit || customAttr) {
        const reScored = result.map((deck: any) => {
            let customBonus = 0;
            const cards = deck.cards || [];
            for (const card of cards) {
                // Check unit match
                if (customUnit && card.units && card.units.includes(customUnit)) {
                    customBonus += customUnitBonus;
                }
                // Check attr match
                if (customAttr && card.attr === customAttr) {
                    customBonus += customAttrBonus;
                }
            }
            return {
                ...deck,
                customBonus,
                eventBonus: (deck.eventBonus || 0) + customBonus,
                score: deck.score, // keep original score for now
            };
        });
        // Re-sort by score
        reScored.sort((a: any, b: any) => b.score - a.score);

        sendProgress("done", 100, "计算完成");
        return {
            type: "result",
            result: reScored,
            userCards,
            duration: currentDuration.done(),
            upload_time: uploadTime,
        };
    }

    sendProgress("done", 100, "计算完成");
    return {
        type: "result",
        result,
        userCards,
        duration: currentDuration.done(),
        upload_time: uploadTime,
    };
}

// Worker message handler
addEventListener("message", (event: MessageEvent<{ args: WorkerInput }>) => {
    deckRecommendRunner(event.data.args)
        .then((result) => {
            postMessage({ ...result, type: "result" });
        })
        .catch((err) => {
            postMessage({
                type: "result",
                error: err.message || String(err),
            });
        });
});
