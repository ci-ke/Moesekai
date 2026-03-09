"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ExternalLink from "@/components/ExternalLink";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import { CHAR_NAMES, type ICardInfo } from "@/types/types";
import CharacterSelector from "@/components/deck-recommend/CharacterSelector";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { fetchMasterData } from "@/lib/fetch";
import { saveToolState, getAccount } from "@/lib/account";
import AccountSelector from "@/components/AccountSelector";
import EventSelector from "@/components/deck-recommend/EventSelector";
import MusicSelector from "@/components/deck-recommend/MusicSelector";
import "./deck-recommend.css";

// ==================== Types ====================
interface CardConfigItem {
    disable: boolean;
    rankMax: boolean;
    episodeRead: boolean;
    masterMax: boolean;
    skillMax: boolean;
}

interface WorkerCardConfig {
    disable?: boolean;
    rankMax?: boolean;
    episodeRead?: boolean;
    masterMax?: boolean;
    skillMax?: boolean;
}

interface DeckPowerInfo {
    total?: number;
}

interface DeckSkillInfo {
    scoreUp?: number;
    isPreTrainingSkill?: boolean;
}

interface DeckEventBonusInfo {
    total?: number;
    all?: number;
}

interface DeckCardResult {
    cardId: number;
    cardRarityType?: string;
    masterRank?: number;
    level?: number;
    characterId?: number;
    power?: DeckPowerInfo;
    skill?: DeckSkillInfo;
    eventBonus?: string | number | DeckEventBonusInfo;
}

interface DeckResult {
    score: number;
    eventBonus?: number;
    supportDeckBonus?: number;
    power?: DeckPowerInfo;
    cards?: DeckCardResult[];
}

interface ChallengeHighScoreInfo {
    highScore?: number;
}

type CardMasterInfo = ICardInfo;

interface UserCardInfo {
    cardId: number;
    masterRank?: number;
    level?: number;
}

interface WorkerProgressMessage {
    type: "progress";
    stage: string;
    percent: number;
    stageLabel: string;
}

interface WorkerResultMessage {
    type?: "result";
    result?: DeckResult[];
    challengeHighScore?: ChallengeHighScoreInfo | null;
    userCards?: UserCardInfo[];
    duration?: number;
    upload_time?: number;
    error?: string;
}

type DeckRecommendWorkerMessage = WorkerProgressMessage | WorkerResultMessage;

interface DeckRecommendWorkerArgs {
    mode: DeckMode;
    userId: string;
    server: ServerType;
    musicId: number;
    difficulty: string;
    characterId?: number;
    eventId?: number;
    liveType: string;
    supportCharacterId?: number;
    cardConfig: Record<string, WorkerCardConfig>;
    customUnit?: string;
    customAttr?: string;
    customUnitBonus?: number;
    customAttrBonus?: number;
    customBonusRules?: CustomBonusRuleUI[];
    leaderCharacter?: number;
    strongestTarget?: StrongestTarget;
}

type DeckMode = "event" | "challenge" | "mysekai" | "custom" | "strongest";
type ServerType = "jp" | "cn" | "tw";
type StrongestTarget = "power" | "skill";

interface CustomBonusRuleUI {
    id: string;
    unit: string;
    attr: string;
    bonusRate: number;
}

const SERVER_OPTIONS: { value: ServerType; label: string }[] = [
    { value: "cn", label: "简中服 (CN)" },
    { value: "jp", label: "日服 (JP)" },
    { value: "tw", label: "繁中服 (TW)" },
];

const MODE_OPTIONS: { value: DeckMode; label: string; desc: string }[] = [
    { value: "event", label: "活动", desc: "活动PT最高" },
    { value: "challenge", label: "挑战Live", desc: "分数最高" },
    { value: "mysekai", label: "烤森", desc: "烤森PT最高" },
    { value: "strongest", label: "最强组卡", desc: "综合力/技能实效最高" },
    { value: "custom", label: "自定义", desc: "自定义团体/属性加成" },
];

const DIFFICULTY_OPTIONS = [
    { value: "easy", label: "Easy" },
    { value: "normal", label: "Normal" },
    { value: "hard", label: "Hard" },
    { value: "expert", label: "Expert" },
    { value: "master", label: "Master" },
    { value: "append", label: "Append" },
];

const LIVE_TYPE_OPTIONS = [
    { value: "multi", label: "多人 (Multi)" },
    { value: "solo", label: "单人 (Solo)" },
    { value: "auto", label: "自动 (Auto)" },
    { value: "cheerful", label: "嘉年华 (Cheerful)" },
];

const SERVER_VALUE_SET = new Set<ServerType>(SERVER_OPTIONS.map((option) => option.value));
const MODE_VALUE_SET = new Set<DeckMode>(MODE_OPTIONS.map((option) => option.value));
const DIFFICULTY_VALUE_SET = new Set(DIFFICULTY_OPTIONS.map((option) => option.value));
const LIVE_TYPE_VALUE_SET = new Set(LIVE_TYPE_OPTIONS.map((option) => option.value));

const RARITY_CONFIG_KEYS = [
    { key: "rarity_1", label: "★1", color: "#888888" },
    { key: "rarity_2", label: "★2", color: "#88BB44" },
    { key: "rarity_3", label: "★3", color: "#4488DD" },
    { key: "rarity_4", label: "★4", color: "#FFAA00" },
    { key: "rarity_birthday", label: "Birthday", color: "#FF6699" },
];

const DEFAULT_CARD_CONFIG: Record<string, CardConfigItem> = {
    rarity_1: { disable: true, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_2: { disable: true, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_3: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_4: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_birthday: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
};

const UNIT_OPTIONS = [
    { value: "light_sound", label: "Leo/need", icon: "ln.webp" },
    { value: "idol", label: "MORE MORE JUMP!", icon: "mmj.webp" },
    { value: "street", label: "Vivid BAD SQUAD", icon: "vbs.webp" },
    { value: "theme_park", label: "WonderShow", icon: "wxs.webp" },
    { value: "school_refusal", label: "25時", icon: "n25.webp" },
    { value: "piapro", label: "Virtual Singer", icon: "vs.webp" },
];

const ATTR_OPTIONS = [
    { value: "cool", label: "Cool", icon: "Cool.webp" },
    { value: "cute", label: "Cute", icon: "cute.webp" },
    { value: "happy", label: "Happy", icon: "Happy.webp" },
    { value: "mysterious", label: "Mysterious", icon: "Mysterious.webp" },
    { value: "pure", label: "Pure", icon: "Pure.webp" },
];

function getErrorMessage(error: string): string {
    switch (error) {
        case "USER_NOT_FOUND":
            return "用户数据未找到，请确认用户ID/所选服务器是否正确，并已在 Haruki 上传数据。";
        case "API_NOT_PUBLIC":
            return "该用户的公开API未开启，请先在 Haruki 上开启公开API。";
        default:
            if (error.includes("404")) return "用户数据未找到 (404)";
            if (error.includes("403")) return "公开API未开启 (403)";
            return error;
    }
}

function parseBonusNumber(value: unknown): number {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === "string") {
        const normalized = value.replace(/%/g, "").trim();
        const parsed = Number.parseFloat(normalized);
        if (Number.isFinite(parsed)) return parsed;
        const fallback = Number.parseFloat(normalized.replace(/[^0-9.+-]/g, ""));
        return Number.isFinite(fallback) ? fallback : 0;
    }
    return 0;
}

function parseCardEventBonusValue(value: DeckCardResult["eventBonus"]): number {
    if (value === undefined || value === null) {
        return 0;
    }
    if (typeof value === "object") {
        if (value.total !== undefined) {
            return parseBonusNumber(value.total);
        }
        if (value.all !== undefined) {
            return parseBonusNumber(value.all);
        }
        return 0;
    }
    return parseBonusNumber(value);
}

function formatBonusValue(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

function parsePositiveInt(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ==================== Fake Progress Bar ====================
function ProgressBar({ stage, percent, stageLabel }: { stage: string; percent: number; stageLabel: string }) {
    const [displayPercent, setDisplayPercent] = useState(0);
    const targetRef = useRef(percent);

    useEffect(() => { targetRef.current = percent; }, [percent]);

    useEffect(() => {
        let raf: number;
        let current = 0;
        const animate = () => {
            const target = targetRef.current;
            const diff = target - current;
            if (Math.abs(diff) < 0.5) { current = target; setDisplayPercent(target); return; }
            const speed = target >= 90 ? 0.02 : target >= 70 ? 0.05 : 0.1;
            current += diff * speed;
            setDisplayPercent(Math.round(current * 10) / 10);
            raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf);
    }, [percent]);

    useEffect(() => {
        if (stage === "done") return;
        const interval = setInterval(() => {
            setDisplayPercent(prev => {
                const t = targetRef.current;
                if (prev >= t - 1) return Math.min(prev + 0.3, t - 0.5);
                return prev;
            });
        }, 500);
        return () => clearInterval(interval);
    }, [stage]);

    return (
        <div className="dr-progress-container">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium">{stageLabel}</span>
                <span className="text-xs text-slate-400 font-mono">{Math.round(displayPercent)}%</span>
            </div>
            <div className="dr-progress-track">
                <div className="dr-progress-bar" style={{ width: `${displayPercent}%` }} />
            </div>
        </div>
    );
}

// ==================== Main Component ====================
export default function DeckRecommendClient() {
    const searchParams = useSearchParams();
    const isScreenshotMode = searchParams.get("mode") === "screenshot";
    const [userId, setUserId] = useState("");
    const [server, setServer] = useState<ServerType>("jp");
    const [mode, setMode] = useState<DeckMode>("event");
    const [characterId, setCharacterId] = useState<number | null>(null);
    const [eventId, setEventId] = useState("");
    const [liveType, setLiveType] = useState("multi");
    const [supportCharacterId, setSupportCharacterId] = useState<number | null>(null);
    const [musicId, setMusicId] = useState("");
    const [difficulty, setDifficulty] = useState("master");
    const [cardConfig, setCardConfig] = useState<Record<string, CardConfigItem>>(JSON.parse(JSON.stringify(DEFAULT_CARD_CONFIG)));
    const [customUnit, setCustomUnit] = useState("");
    const [customAttr, setCustomAttr] = useState("");
    const [customUnitBonus, setCustomUnitBonus] = useState(25);
    const [customAttrBonus, setCustomAttrBonus] = useState(25);
    const [customBonusRules, setCustomBonusRules] = useState<CustomBonusRuleUI[]>([]);
    const [leaderCharacterId, setLeaderCharacterId] = useState<number | null>(null);
    const [showLeaderSelect, setShowLeaderSelect] = useState(false);
    const [strongestTarget, setStrongestTarget] = useState<StrongestTarget>("power");
    const [isCalculating, setIsCalculating] = useState(false);
    const [results, setResults] = useState<DeckResult[] | null>(null);
    const [challengeHighScore, setChallengeHighScore] = useState<ChallengeHighScoreInfo | null>(null);
    const [duration, setDuration] = useState<number | null>(null);
    const [dataTime, setDataTime] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [allowSaveUserId, setAllowSaveUserId] = useState(false);
    const [showCardConfig, setShowCardConfig] = useState(false);
    const [progressStage, setProgressStage] = useState("idle");
    const [progressPercent, setProgressPercent] = useState(0);
    const [progressLabel, setProgressLabel] = useState("");
    const [cardsMaster, setCardsMaster] = useState<CardMasterInfo[]>([]);
    const [userCards, setUserCards] = useState<UserCardInfo[]>([]);
    const workerRef = useRef<Worker | null>(null);
    const autoCalculateKeyRef = useRef<string>("");

    useEffect(() => {
        fetchMasterData<CardMasterInfo[]>("cards.json").then(setCardsMaster).catch(console.error);

        if (isScreenshotMode) return;

        let nextUserId = "";
        let nextServer: ServerType = "jp";
        let nextAllowSave = false;

        const account = getAccount();
        if (account?.toolStates.deckRecommend) {
            nextUserId = account.toolStates.deckRecommend.userId;
            nextServer = account.toolStates.deckRecommend.server as ServerType;
            nextAllowSave = true;
        } else {
            const savedUserId = localStorage.getItem("deck_recommend_userid");
            const savedServer = localStorage.getItem("deck_recommend_server");
            if (savedUserId) {
                nextUserId = savedUserId;
                nextAllowSave = true;
            }
            if (savedServer && ["jp", "cn", "tw"].includes(savedServer)) {
                nextServer = savedServer as ServerType;
            }
        }

        queueMicrotask(() => {
            setUserId(nextUserId);
            setServer(nextServer);
            setAllowSaveUserId(nextAllowSave);
        });
    }, [isScreenshotMode]);

    useEffect(() => {
        if (!isScreenshotMode) return;

        const queuedUpdates: Array<() => void> = [];

        const userIdParam = searchParams.get("userId")?.trim();
        if (userIdParam) {
            queuedUpdates.push(() => setUserId(userIdParam));
        }

        const serverParam = searchParams.get("server");
        if (serverParam && SERVER_VALUE_SET.has(serverParam as ServerType)) {
            queuedUpdates.push(() => setServer(serverParam as ServerType));
        }

        const deckModeParam = searchParams.get("deckMode");
        if (deckModeParam && MODE_VALUE_SET.has(deckModeParam as DeckMode)) {
            queuedUpdates.push(() => setMode(deckModeParam as DeckMode));
        }

        const characterParam = parsePositiveInt(searchParams.get("characterId"));
        if (characterParam !== null) {
            queuedUpdates.push(() => setCharacterId(characterParam));
        }

        const eventParam = parsePositiveInt(searchParams.get("eventId"));
        if (eventParam !== null) {
            queuedUpdates.push(() => setEventId(String(eventParam)));
        }

        const supportCharacterParam = parsePositiveInt(searchParams.get("supportCharacterId"));
        if (supportCharacterParam !== null) {
            queuedUpdates.push(() => setSupportCharacterId(supportCharacterParam));
        }

        const musicParam = parsePositiveInt(searchParams.get("musicId"));
        if (musicParam !== null) {
            queuedUpdates.push(() => setMusicId(String(musicParam)));
        }

        const difficultyParam = searchParams.get("difficulty");
        if (difficultyParam && DIFFICULTY_VALUE_SET.has(difficultyParam)) {
            queuedUpdates.push(() => setDifficulty(difficultyParam));
        }

        const liveTypeParam = searchParams.get("liveType");
        if (liveTypeParam && LIVE_TYPE_VALUE_SET.has(liveTypeParam)) {
            queuedUpdates.push(() => setLiveType(liveTypeParam));
        }

        const customUnitParam = searchParams.get("customUnit");
        if (customUnitParam) {
            queuedUpdates.push(() => setCustomUnit(customUnitParam));
        }

        const customAttrParam = searchParams.get("customAttr");
        if (customAttrParam) {
            queuedUpdates.push(() => setCustomAttr(customAttrParam));
        }

        const customUnitBonusParam = Number.parseFloat(searchParams.get("customUnitBonus") || "");
        if (Number.isFinite(customUnitBonusParam)) {
            queuedUpdates.push(() => setCustomUnitBonus(customUnitBonusParam));
        }

        const customAttrBonusParam = Number.parseFloat(searchParams.get("customAttrBonus") || "");
        if (Number.isFinite(customAttrBonusParam)) {
            queuedUpdates.push(() => setCustomAttrBonus(customAttrBonusParam));
        }

        const leaderCharacterParam = parsePositiveInt(searchParams.get("leaderCharacter"));
        if (leaderCharacterParam !== null) {
            queuedUpdates.push(() => { setShowLeaderSelect(true); setLeaderCharacterId(leaderCharacterParam); });
        }

        const strongestTargetParam = searchParams.get("strongestTarget");
        if (strongestTargetParam === "power" || strongestTargetParam === "skill") {
            queuedUpdates.push(() => setStrongestTarget(strongestTargetParam));
        }

        const expandConfigParam = searchParams.get("expandConfig");
        if (expandConfigParam === "1" || expandConfigParam === "true") {
            queuedUpdates.push(() => setShowCardConfig(true));
        }

        if (queuedUpdates.length > 0) {
            queueMicrotask(() => {
                queuedUpdates.forEach((update) => update());
            });
        }
    }, [isScreenshotMode, searchParams]);

    const updateCardConfig = useCallback((rarity: string, field: keyof CardConfigItem, value: boolean) => {
        setCardConfig(prev => ({ ...prev, [rarity]: { ...prev[rarity], [field]: value } }));
    }, []);

    const needsMusic = mode !== "mysekai";
    const needsEvent = mode === "event" || mode === "mysekai";
    const scoreLabel = mode === "mysekai" ? "烤森PT" : mode === "challenge" ? "分数" : mode === "strongest" ? (strongestTarget === "skill" ? "实效值" : "综合力") : "PT";
    const canAutoCalculateInScreenshot =
        isScreenshotMode &&
        !!userId.trim() &&
        (!needsMusic || !!musicId) &&
        (!needsEvent || !!eventId.trim()) &&
        (mode !== "challenge" || characterId !== null);

    const handleCalculate = useCallback(() => {
        if (!userId.trim()) { setError("请输入用户ID"); return; }
        if (needsMusic && !musicId) { setError("请选择歌曲"); return; }
        if (mode === "challenge" && !characterId) { setError("请选择角色"); return; }
        if (needsEvent && !eventId.trim()) { setError("请输入活动ID"); return; }

        setError(null); setResults(null); setChallengeHighScore(null); setDuration(null); setDataTime(null);
        setIsCalculating(true); setProgressStage("fetching"); setProgressPercent(5); setProgressLabel("正在获取用户数据...");

        const configForCalc: Record<string, WorkerCardConfig> = {};
        for (const [key, val] of Object.entries(cardConfig)) {
            configForCalc[key] = val.disable ? { disable: true } : { rankMax: val.rankMax, episodeRead: val.episodeRead, masterMax: val.masterMax, skillMax: val.skillMax };
        }

        const workerArgs: DeckRecommendWorkerArgs = {
            mode, userId: userId.trim(), server, musicId: musicId ? parseInt(musicId) : 0, difficulty,
            characterId: characterId || undefined, eventId: eventId ? parseInt(eventId) : undefined,
            liveType, supportCharacterId: supportCharacterId || undefined, cardConfig: configForCalc,
            leaderCharacter: showLeaderSelect && leaderCharacterId ? leaderCharacterId : undefined,
        };
        if (mode === "custom") {
            workerArgs.customUnit = customUnit || undefined;
            workerArgs.customAttr = customAttr || undefined;
            workerArgs.customUnitBonus = customUnitBonus;
            workerArgs.customAttrBonus = customAttrBonus;
            if (customBonusRules.length > 0) {
                workerArgs.customBonusRules = customBonusRules;
            }
        }
        if (mode === "strongest") {
            workerArgs.strongestTarget = strongestTarget;
        }

        if (workerRef.current) workerRef.current.terminate();
        const worker = new Worker(new URL("@/lib/deck-recommend/dr-worker.ts", import.meta.url));
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent<DeckRecommendWorkerMessage>) => {
            const data = event.data;
            if (data.type === "progress") {
                setProgressStage(data.stage); setProgressPercent(data.percent); setProgressLabel(data.stageLabel);
                return;
            }
            if (data.error) { setError(getErrorMessage(data.error)); }
            else {
                setResults(data.result || []); setChallengeHighScore(data.challengeHighScore || null);
                if (data.userCards) setUserCards(data.userCards);
                setDuration(data.duration || null); if (data.upload_time) setDataTime(data.upload_time);
            }
            setIsCalculating(false); setProgressStage("idle"); setProgressPercent(0);
            worker.terminate(); workerRef.current = null;
        };
        worker.onerror = (err) => {
            setError(`Worker 错误: ${err.message}`);
            setIsCalculating(false); setProgressStage("idle"); setProgressPercent(0);
            worker.terminate(); workerRef.current = null;
        };
        worker.postMessage({ args: workerArgs });
    }, [userId, server, mode, characterId, eventId, liveType, supportCharacterId, musicId, difficulty, cardConfig, needsMusic, needsEvent, customUnit, customAttr, customUnitBonus, customAttrBonus, customBonusRules, leaderCharacterId, showLeaderSelect, strongestTarget]);

    const handleCancel = useCallback(() => {
        if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
        setIsCalculating(false); setProgressStage("idle"); setProgressPercent(0);
    }, []);

    useEffect(() => {
        if (!isScreenshotMode) {
            autoCalculateKeyRef.current = "";
            return;
        }
        if (!canAutoCalculateInScreenshot || isCalculating) return;

        const autoCalculateKey = [
            userId.trim(),
            server,
            mode,
            characterId ?? "",
            eventId,
            liveType,
            supportCharacterId ?? "",
            musicId,
            difficulty,
            customUnit,
            customAttr,
            customUnitBonus,
            customAttrBonus,
            leaderCharacterId ?? "",
            showLeaderSelect,
            strongestTarget,
        ].join("|");

        if (autoCalculateKeyRef.current === autoCalculateKey) return;
        autoCalculateKeyRef.current = autoCalculateKey;
        queueMicrotask(() => {
            handleCalculate();
        });
    }, [
        isScreenshotMode,
        canAutoCalculateInScreenshot,
        isCalculating,
        userId,
        server,
        mode,
        characterId,
        eventId,
        liveType,
        supportCharacterId,
        musicId,
        difficulty,
        customUnit,
        customAttr,
        customUnitBonus,
        customAttrBonus,
        leaderCharacterId,
        showLeaderSelect,
        strongestTarget,
        handleCalculate,
    ]);

    const getCardMaster = useCallback((cardId: number) => cardsMaster.find((c) => c.id === cardId), [cardsMaster]);

    return (
        <MainLayout>
            <div className="container mx-auto px-4 sm:px-6 py-8 max-w-5xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 border border-miku/30 bg-miku/5 rounded-full mb-4">
                        <span className="text-miku text-xs font-bold tracking-widest uppercase">Deck Recommender</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-primary-text">组卡<span className="text-miku">推荐器</span></h1>
                    <p className="text-slate-500 mt-2 max-w-2xl mx-auto text-sm sm:text-base">基于 sekai-calculator 的卡组推荐工具，自动计算最优卡组</p>
                </div>

                <div className="dr-mobile-warning glass-card p-3 rounded-xl mb-6 flex items-center gap-2 text-sm text-amber-700 bg-amber-50/80 border border-amber-200/50">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    <span>Moesekai不保存任何数据，完全基于本地计算，建议在电脑或 iPad 上使用以获得更好的性能体验。</span>
                </div>

                {/* Input Form */}
                <div className="glass-card p-5 sm:p-6 rounded-2xl mb-6">
                    <h2 className="text-lg font-bold text-primary-text mb-4 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-miku rounded-full"></span>基本设置
                    </h2>

                    {/* Mode Tabs */}
                    <div className="mb-5">
                        <label className="block text-sm font-medium text-slate-700 mb-2">推荐模式</label>
                        <div className="flex gap-2 flex-wrap">
                            {MODE_OPTIONS.map((m) => (
                                <button key={m.value} onClick={() => setMode(m.value)} title={m.desc}
                                    className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 ${mode === m.value ? "bg-gradient-to-r from-miku to-miku-dark text-white shadow-lg shadow-miku/20" : "bg-white/60 text-slate-600 hover:bg-white/80 border border-slate-200/50"}`}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5">{MODE_OPTIONS.find(m => m.value === mode)?.desc}</p>
                    </div>

                    {/* Account Selector + User ID + Server */}
                    <AccountSelector
                        onSelect={(gameId, srv) => {
                            setUserId(gameId);
                            setServer(srv);
                            if (allowSaveUserId) {
                                localStorage.setItem("deck_recommend_userid", gameId);
                                localStorage.setItem("deck_recommend_server", srv);
                                saveToolState("deckRecommend", gameId, srv);
                            }
                        }}
                        currentUserId={userId}
                        currentServer={server}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">用户ID <span className="text-red-400">*</span></label>
                            <input type="text" value={userId} onChange={(e) => { setUserId(e.target.value); if (allowSaveUserId) localStorage.setItem("deck_recommend_userid", e.target.value); }}
                                placeholder="输入游戏ID" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-miku/20 focus:border-miku transition-all text-sm" />
                            <div className="flex items-center justify-between mt-2 px-1">
                                <span className="text-sm text-slate-500">保存在浏览器本地</span>
                                <button onClick={() => { const ns = !allowSaveUserId; setAllowSaveUserId(ns); if (ns) { localStorage.setItem("deck_recommend_userid", userId); localStorage.setItem("deck_recommend_server", server); saveToolState("deckRecommend", userId, server); } else { localStorage.removeItem("deck_recommend_userid"); localStorage.removeItem("deck_recommend_server"); } }}
                                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${allowSaveUserId ? 'bg-miku' : 'bg-slate-200'}`}>
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${allowSaveUserId ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">需先在 <ExternalLink href="https://haruki.seiunx.com" target="_blank" rel="noopener noreferrer" className="text-miku hover:underline">Haruki工具箱</ExternalLink> 上传数据并开启公开API</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">服务器</label>
                            <div className="flex flex-wrap gap-2">
                                {SERVER_OPTIONS.map((s) => (
                                    <button key={s.value} onClick={() => { setServer(s.value); if (allowSaveUserId) localStorage.setItem("deck_recommend_server", s.value); }}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${server === s.value ? "bg-miku text-white shadow-md shadow-miku/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Challenge Mode */}
                    {mode === "challenge" && (
                        <div className="mb-5">
                            <label className="block text-sm font-medium text-slate-700 mb-2">挑战角色 <span className="text-red-400">*</span></label>
                            <CharacterSelector selectedCharacterId={characterId} onSelect={setCharacterId} />
                        </div>
                    )}

                    {/* Strongest Mode */}
                    {mode === "strongest" && (
                        <div className="mb-5">
                            <label className="block text-sm font-medium text-slate-700 mb-2">优化目标</label>
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => setStrongestTarget("power")}
                                    className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 ${strongestTarget === "power" ? "bg-gradient-to-r from-miku to-miku-dark text-white shadow-lg shadow-miku/20" : "bg-white/60 text-slate-600 hover:bg-white/80 border border-slate-200/50"}`}>
                                    💪 综合力最高
                                </button>
                                <button onClick={() => setStrongestTarget("skill")}
                                    className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 ${strongestTarget === "skill" ? "bg-gradient-to-r from-miku to-miku-dark text-white shadow-lg shadow-miku/20" : "bg-white/60 text-slate-600 hover:bg-white/80 border border-slate-200/50"}`}>
                                    ✨ 技能实效最高
                                </button>
                            </div>
                            <p className="text-xs text-slate-400 mt-1.5">
                                {strongestTarget === "power" ? "以卡组总综合力为目标，不考虑活动加成" : "以多人Live技能实效为主、综合力为辅的复合评分"}
                            </p>
                        </div>
                    )}

                    {/* Leader Character (all modes except challenge which has its own) */}
                    {mode !== "challenge" && (
                        <div className="mb-5">
                            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-sm text-slate-700 font-medium">固定队长角色</span>
                                        <span className="text-slate-400 text-xs text-left">指定某个角色必须作为队长（C位）</span>
                                    </div>
                                    <button onClick={() => { setShowLeaderSelect(!showLeaderSelect); if (showLeaderSelect) setLeaderCharacterId(null); }}
                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${showLeaderSelect ? 'bg-miku' : 'bg-slate-200'}`}>
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${showLeaderSelect ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                                {showLeaderSelect && (
                                    <div className="mt-4 pt-3 border-t border-slate-200/50">
                                        <CharacterSelector selectedCharacterId={leaderCharacterId} onSelect={setLeaderCharacterId} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Event / Mysekai Mode */}
                    {needsEvent && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                            <div><EventSelector selectedEventId={eventId} onSelect={(id) => setEventId(id)} /></div>
                            {mode === "event" && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Live类型</label>
                                    <div className="flex flex-wrap gap-2">
                                        {LIVE_TYPE_OPTIONS.map((lt) => (
                                            <button key={lt.value} onClick={() => setLiveType(lt.value)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${liveType === lt.value ? "bg-miku text-white shadow-md shadow-miku/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                                                {lt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {mode === "mysekai" && (
                                <div className="flex items-center">
                                    <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/50 w-full">
                                        <div className="flex items-center gap-2 text-sm text-amber-700">
                                            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <span>烤森模式不需要选歌，根据综合力和活动加成计算最优烤森PT</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="sm:col-span-2">
                                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-sm text-slate-700 font-medium">支援角色</span>
                                            <span className="text-slate-400 text-xs text-left">World Bloom 活动可选</span>
                                        </div>
                                        <button onClick={() => setSupportCharacterId(supportCharacterId !== null ? null : 0)}
                                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${supportCharacterId !== null ? 'bg-miku' : 'bg-slate-200'}`}>
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${supportCharacterId !== null ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    {supportCharacterId !== null && (
                                        <div className="mt-4 pt-3 border-t border-slate-200/50">
                                            <CharacterSelector selectedCharacterId={supportCharacterId} onSelect={setSupportCharacterId} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Custom Mode */}
                    {mode === "custom" && (
                        <div className="mb-5">
                            <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50/30">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <span className="w-1 h-4 bg-indigo-400 rounded-full"></span>自定义加成设置
                                </h3>
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">团体加成</label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {UNIT_OPTIONS.map((u) => (
                                            <button key={u.value} onClick={() => setCustomUnit(customUnit === u.value ? "" : u.value)}
                                                className={`p-1.5 rounded-xl transition-all ${customUnit === u.value ? "ring-2 ring-miku shadow-lg bg-white" : "hover:bg-slate-100 border border-transparent bg-slate-50"}`}
                                                title={u.label}>
                                                <div className="w-8 h-8 relative">
                                                    <Image src={`/data/icon/${u.icon}`} alt={u.label} fill className="object-contain" unoptimized />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    {customUnit && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-slate-500">每卡加成:</span>
                                            <input type="number" value={customUnitBonus} onChange={(e) => setCustomUnitBonus(Number(e.target.value))}
                                                className="w-20 px-2 py-1 rounded border border-slate-200 text-xs text-center" min={0} max={100} />
                                            <span className="text-xs text-slate-400">%</span>
                                        </div>
                                    )}
                                </div>
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">属性加成</label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {ATTR_OPTIONS.map((a) => (
                                            <button key={a.value} onClick={() => setCustomAttr(customAttr === a.value ? "" : a.value)}
                                                className={`p-1.5 rounded-xl transition-all ${customAttr === a.value ? "ring-2 ring-miku shadow-lg bg-white" : "hover:bg-slate-100 border border-transparent bg-slate-50"}`}
                                                title={a.label}>
                                                <div className="w-6 h-6 relative">
                                                    <Image src={`/data/icon/${a.icon}`} alt={a.label} fill className="object-contain" unoptimized />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    {customAttr && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-slate-500">每卡加成:</span>
                                            <input type="number" value={customAttrBonus} onChange={(e) => setCustomAttrBonus(Number(e.target.value))}
                                                className="w-20 px-2 py-1 rounded border border-slate-200 text-xs text-center" min={0} max={100} />
                                            <span className="text-xs text-slate-400">%</span>
                                        </div>
                                    )}
                                </div>

                                {/* Advanced: Custom Bonus Rules */}
                                <div className="mt-3 pt-3 border-t border-indigo-200/50">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">高级加成规则</label>
                                        <button onClick={() => setCustomBonusRules([...customBonusRules, { id: Date.now().toString(), unit: "any", attr: "any", bonusRate: 25 }])}
                                            className="text-xs text-miku hover:text-miku-dark font-medium transition-colors flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                            添加规则
                                        </button>
                                    </div>
                                    {customBonusRules.length > 0 && (
                                        <div className="space-y-2">
                                            {customBonusRules.map((rule, idx) => (
                                                <div key={rule.id} className="flex items-center gap-2 bg-white/60 rounded-lg p-2">
                                                    <select value={rule.unit} onChange={(e) => { const r = [...customBonusRules]; r[idx] = { ...r[idx], unit: e.target.value }; setCustomBonusRules(r); }}
                                                        className="text-xs px-2 py-1 rounded border border-slate-200 bg-white">
                                                        <option value="any">全部团体</option>
                                                        {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                                    </select>
                                                    <select value={rule.attr} onChange={(e) => { const r = [...customBonusRules]; r[idx] = { ...r[idx], attr: e.target.value }; setCustomBonusRules(r); }}
                                                        className="text-xs px-2 py-1 rounded border border-slate-200 bg-white">
                                                        <option value="any">全部属性</option>
                                                        {ATTR_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                                    </select>
                                                    <input type="number" value={rule.bonusRate} onChange={(e) => { const r = [...customBonusRules]; r[idx] = { ...r[idx], bonusRate: Number(e.target.value) }; setCustomBonusRules(r); }}
                                                        className="w-16 px-2 py-1 rounded border border-slate-200 text-xs text-center" min={0} max={200} />
                                                    <span className="text-xs text-slate-400">%</span>
                                                    <button onClick={() => setCustomBonusRules(customBonusRules.filter((_, i) => i !== idx))}
                                                        className="text-red-400 hover:text-red-600 transition-colors p-0.5">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                            <p className="text-[10px] text-slate-400">高级规则会通过计算库的 CustomBonusConfig 传递，与上方基础加成独立生效</p>
                                        </div>
                                    )}
                                </div>

                                {!customUnit && !customAttr && customBonusRules.length === 0 && (
                                    <p className="text-xs text-slate-400 mt-2">请至少选择一个团体或属性加成，或添加高级规则</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Song Selection (not for mysekai) */}
                    {needsMusic && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                            <div><MusicSelector selectedMusicId={musicId} onSelect={(id) => setMusicId(id)} recommendMode={mode === "custom" ? "event" : mode} liveType={liveType} /></div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">难度</label>
                                <div className="flex flex-wrap gap-2">
                                    {DIFFICULTY_OPTIONS.map((d) => {
                                        const colors: Record<string, string> = { easy: "bg-blue-500 text-white shadow-blue-500/20", normal: "bg-emerald-500 text-white shadow-emerald-500/20", hard: "bg-orange-500 text-white shadow-orange-500/20", expert: "bg-red-500 text-white shadow-red-500/20", master: "bg-purple-500 text-white shadow-purple-500/20", append: "bg-fuchsia-500 text-white shadow-fuchsia-500/20" };
                                        return (
                                            <button key={d.value} onClick={() => setDifficulty(d.value)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-md ${difficulty === d.value ? (colors[d.value] || "bg-miku text-white shadow-miku/20") : "bg-slate-100 text-slate-600 hover:bg-slate-200 shadow-none"}`}>
                                                {d.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Card Config */}
                    <div className="mb-5">
                        <button onClick={() => setShowCardConfig(!showCardConfig)} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-miku transition-colors">
                            <svg className={`w-4 h-4 transition-transform ${showCardConfig ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            卡牌养成配置
                        </button>
                        {showCardConfig && (
                            <div className="mt-3 overflow-x-auto">
                                <table className="dr-config-table w-full text-sm">
                                    <thead><tr>
                                        <th className="text-left py-2 px-2 text-slate-500 font-medium">稀有度</th>
                                        <th className="py-2 px-2 text-slate-500 font-medium">禁用</th>
                                        <th className="py-2 px-2 text-slate-500 font-medium">满级</th>
                                        <th className="py-2 px-2 text-slate-500 font-medium">前后篇</th>
                                        <th className="py-2 px-2 text-slate-500 font-medium">满突破</th>
                                        <th className="py-2 px-2 text-slate-500 font-medium">满技能</th>
                                    </tr></thead>
                                    <tbody>
                                        {RARITY_CONFIG_KEYS.map(({ key }) => (
                                            <tr key={key} className="border-t border-slate-100">
                                                <td className="py-2 px-2">
                                                    <div className="flex items-center gap-0.5">
                                                        {key === "rarity_birthday" ? (
                                                            <div className="w-4 h-4 relative"><Image src="/data/icon/birthday.webp" alt="Birthday" fill className="object-contain" unoptimized /></div>
                                                        ) : (
                                                            Array.from({ length: parseInt(key.split("_")[1]) }).map((_, i) => (
                                                                <div key={i} className="w-3 h-3 relative"><Image src="/data/icon/star.webp" alt="Star" fill className="object-contain" unoptimized /></div>
                                                            ))
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-2 px-2 text-center"><input type="checkbox" checked={cardConfig[key].disable} onChange={(e) => updateCardConfig(key, "disable", e.target.checked)} className="dr-checkbox" /></td>
                                                <td className="py-2 px-2 text-center"><input type="checkbox" checked={cardConfig[key].rankMax} onChange={(e) => updateCardConfig(key, "rankMax", e.target.checked)} disabled={cardConfig[key].disable} className="dr-checkbox" /></td>
                                                <td className="py-2 px-2 text-center"><input type="checkbox" checked={cardConfig[key].episodeRead} onChange={(e) => updateCardConfig(key, "episodeRead", e.target.checked)} disabled={cardConfig[key].disable} className="dr-checkbox" /></td>
                                                <td className="py-2 px-2 text-center"><input type="checkbox" checked={cardConfig[key].masterMax} onChange={(e) => updateCardConfig(key, "masterMax", e.target.checked)} disabled={cardConfig[key].disable} className="dr-checkbox" /></td>
                                                <td className="py-2 px-2 text-center"><input type="checkbox" checked={cardConfig[key].skillMax} onChange={(e) => updateCardConfig(key, "skillMax", e.target.checked)} disabled={cardConfig[key].disable} className="dr-checkbox" /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button onClick={handleCalculate} disabled={isCalculating}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-miku to-miku-dark text-white rounded-xl font-bold shadow-lg shadow-miku/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            {isCalculating ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>计算中...</>) : (<>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                开始计算
                            </>)}
                        </button>
                        {isCalculating && (
                            <button onClick={handleCancel} className="px-6 py-3 border-2 border-red-400 text-red-500 rounded-xl font-bold hover:bg-red-50 active:scale-[0.98] transition-all">取消</button>
                        )}
                    </div>

                    {/* Progress Bar */}
                    {isCalculating && progressStage !== "idle" && (
                        <div className="mt-4">
                            <ProgressBar stage={progressStage} percent={progressPercent} stageLabel={progressLabel} />
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="glass-card p-4 rounded-2xl mb-6 bg-red-50/80 border border-red-200/50">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-sm font-medium text-red-700">{error}</p>
                        </div>
                    </div>
                )}

                {/* Results */}
                {results && results.length > 0 && (
                    <div className="glass-card p-5 sm:p-6 rounded-2xl mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-primary-text flex items-center gap-2">
                                <span className="w-1.5 h-6 bg-miku rounded-full"></span>
                                推荐卡组 Top {results.length}
                            </h2>
                            {duration !== null && (
                                <div className="flex flex-col items-end">
                                    <span className="text-xs text-slate-400 font-mono">耗时 {(duration / 1000).toFixed(2)}s</span>
                                    {dataTime && <span className="text-xs text-slate-400 font-mono">数据更新于 {new Date(dataTime * 1000).toLocaleString()}</span>}
                                </div>
                            )}
                        </div>
                        {challengeHighScore && (
                            <div className="mb-4 px-3 py-2 bg-amber-50 rounded-lg text-sm text-amber-700">
                                当前挑战Live最高分: <span className="font-bold">{challengeHighScore.highScore?.toLocaleString() || "无记录"}</span>
                            </div>
                        )}
                        <div className="space-y-4">
                            {results.map((deck, index: number) => (
                                <DeckResultRow key={index} deck={deck} rank={index + 1} getCardMaster={getCardMaster} mode={mode} userCards={userCards} scoreLabel={scoreLabel} forceExpand={isScreenshotMode} />
                            ))}
                        </div>
                    </div>
                )}

                {results && results.length === 0 && (
                    <div className="glass-card p-8 rounded-2xl mb-6 text-center">
                        <p className="text-slate-500">未找到可推荐的卡组，请检查您的卡牌数据和配置。</p>
                    </div>
                )}

                <div className="mt-12 text-center text-xs text-slate-400">
                    <p className="mb-1">组卡推荐器源代码采用xfl03(33)的 <ExternalLink href="https://github.com/xfl03/sekai-calculator" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-miku hover:underline">sekai-calculator</ExternalLink></p>
                    <p className="mb-1">部分算法优化修改于 <ExternalLink href="https://github.com/NeuraXmy/sekai-deck-recommend-cpp" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-miku hover:underline">sekai-deck-recommend-cpp</ExternalLink>（作者: luna茶）</p>
                    <p>sekai-calculator采用 LGPL-2.1 开源协议 计算结果仅供参考</p>
                </div>
            </div>
        </MainLayout>
    );
}

// ==================== Deck Result Row ====================
interface DeckResultRowProps {
    deck: DeckResult;
    rank: number;
    getCardMaster: (id: number) => CardMasterInfo | undefined;
    mode: DeckMode;
    userCards: UserCardInfo[];
    scoreLabel: string;
    forceExpand?: boolean;
}

function DeckResultRow({ deck, rank, getCardMaster, mode, userCards, scoreLabel, forceExpand = false }: DeckResultRowProps) {
    const [showDetails, setShowDetails] = useState(forceExpand);
    const detailsExpanded = forceExpand || showDetails;
    const baseEventBonus = deck.eventBonus !== undefined
        ? parseBonusNumber(deck.eventBonus)
        : (deck.cards?.reduce((sum: number, card: DeckCardResult) => {
            return sum + parseCardEventBonusValue(card.eventBonus);
        }, 0) || 0);
    const supportDeckBonus = parseBonusNumber(deck.supportDeckBonus);
    const totalEventBonus = baseEventBonus + supportDeckBonus;
    const showSupportBonusBreakdown = supportDeckBonus > 0;
    const totalEventBonusText = `${formatBonusValue(totalEventBonus)}%`;
    const baseEventBonusText = `${formatBonusValue(baseEventBonus)}%`;
    const supportDeckBonusText = `${formatBonusValue(supportDeckBonus)}%`;
    const totalBonusLabel = mode === "custom" ? "自定义加成" : (showSupportBonusBreakdown ? "总加成" : "加成");

    const effectiveSkill = deck.cards && deck.cards.length === 5 ? (deck.cards[0].skill?.scoreUp || 0) + deck.cards.slice(1).reduce((sum: number, card: DeckCardResult) => sum + (card.skill?.scoreUp || 0), 0) / 5 : 0;
    const totalPower = deck.power?.total ?? 0;

    return (
        <div className="dr-result-row rounded-xl border border-slate-100 overflow-hidden hover:border-miku/30 transition-all">
            <button onClick={() => {
                if (forceExpand) return;
                setShowDetails(!showDetails);
            }}
                className="w-full p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 text-left hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center justify-between sm:justify-start gap-3">
                    <div className="flex items-center gap-3">
                        <div className={`dr-rank flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${rank === 1 ? "bg-amber-400 text-white" : rank === 2 ? "bg-slate-400 text-white" : rank === 3 ? "bg-amber-700 text-white" : "bg-slate-100 text-slate-500"}`}>{rank}</div>
                        <div className="flex-shrink-0 min-w-[80px]">
                            <div className="text-xs text-slate-400">{scoreLabel}</div>
                            <div className="font-bold text-primary-text text-sm">{Math.floor(deck.score).toLocaleString()}</div>
                        </div>
                        {effectiveSkill > 0 && mode !== "challenge" && mode !== "mysekai" && mode !== "strongest" && (
                            <div className="flex-shrink-0 min-w-[60px]">
                                <div className="text-xs text-slate-400">实效值</div>
                                <div className="font-bold text-emerald-600 text-sm">{effectiveSkill.toFixed(1)}%</div>
                            </div>
                        )}
                        {totalPower > 0 && (
                            <div className="flex-shrink-0 min-w-[60px] sm:hidden">
                                <div className="text-xs text-slate-400">综合力</div>
                                <div className="font-bold text-miku text-sm">{totalPower.toLocaleString()}</div>
                            </div>
                        )}
                        {(mode === "event" || mode === "mysekai" || mode === "custom") && totalEventBonus > 0 && (
                            <div className="flex-shrink-0 min-w-[60px] hidden sm:block">
                                <div className="text-xs text-slate-400">{totalBonusLabel}</div>
                                <div className="font-bold text-miku text-sm">{totalEventBonusText}</div>
                                {showSupportBonusBreakdown && (
                                    <div className="text-[10px] text-slate-500 leading-tight">主队{baseEventBonusText} + 支援{supportDeckBonusText}</div>
                                )}
                            </div>
                        )}

                    </div>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform sm:hidden ${detailsExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
                <div className="flex gap-1 flex-1 overflow-x-auto no-scrollbar mask-gradient-right sm:overflow-visible sm:mask-none">
                    {deck.cards?.slice(0, 5).map((card: DeckCardResult, i: number) => {
                        const masterCard = getCardMaster(card.cardId);
                        const userCard = userCards.find((u) => u.cardId === card.cardId);
                        const rarityType = masterCard?.cardRarityType || card.cardRarityType;
                        const isBirthday = rarityType === "rarity_birthday";
                        const masterRank = userCard?.masterRank ?? card.masterRank ?? 0;
                        const level = userCard?.level ?? card.level ?? 1;
                        const isPreTraining = card.skill?.isPreTrainingSkill === true;
                        const showTrained = (rarityType === "rarity_3" || rarityType === "rarity_4") && !isBirthday && !isPreTraining;
                        if (!masterCard) return <div key={i} className="dr-card-thumb w-10 h-10 sm:w-12 sm:h-12 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-xs flex-shrink-0">?</div>;
                        return (
                            <div key={i} className="relative flex flex-col items-center gap-0.5 flex-shrink-0">
                                <Link href={`/cards/${card.cardId}`} className="block relative" target="_blank">
                                    <SekaiCardThumbnail card={masterCard} trained={showTrained} mastery={masterRank} width={48} />
                                    {i === 0 && <div className="absolute bottom-0 right-0 bg-miku/90 text-white text-[8px] font-bold px-1 py-[1px] rounded-tl-md leading-none backdrop-blur-[1px] z-10">L</div>}
                                </Link>
                                <div className="text-[9px] sm:text-[10px] text-slate-500 font-mono leading-none flex items-center gap-0.5">
                                    <span>Lv.{level}</span>
                                    {masterRank > 0 && <span className="bg-slate-100 text-slate-600 rounded-full px-[3px] py-[1px] flex items-center gap-[1px] leading-none border border-slate-200"><span className="text-[7px]">🔷</span><span className="text-[8px] font-bold">{masterRank}</span></span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {totalPower > 0 && (
                    <div className="flex-shrink-0 text-right hidden sm:block">
                        <div className="text-xs text-slate-400">综合力</div>
                        <div className="font-bold text-sm text-miku">{totalPower.toLocaleString()}</div>
                    </div>
                )}
                <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 hidden sm:block ${detailsExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {detailsExpanded && (
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-slate-100">
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead><tr className="text-slate-400">
                                <th className="text-left py-1 px-1">队长</th>
                                <th className="text-left py-1 px-1">卡牌ID</th>
                                <th className="text-left py-1 px-1">卡面名称</th>
                                <th className="text-right py-1 px-1">综合力</th>
                                <th className="text-right py-1 px-1">技能</th>
                                {(mode === "event" || mode === "mysekai" || mode === "custom") && <th className="text-right py-1 px-1">{mode === "custom" ? "自定义加成" : "活动加成"}</th>}
                            </tr></thead>
                            <tbody>
                                {deck.cards?.map((card: DeckCardResult, i: number) => {
                                    const masterCard = getCardMaster(card.cardId);
                                    const basePower = card.power?.total || 0;
                                    const eb = card.eventBonus;
                                    const eventBonusValue = parseCardEventBonusValue(eb);
                                    const eventBonusText = typeof eb === "string"
                                        ? eb
                                        : eventBonusValue > 0
                                            ? `${formatBonusValue(eventBonusValue)}%`
                                            : "-";
                                    const cardName = masterCard?.prefix || (masterCard ? CHAR_NAMES[masterCard.characterId] : `ID:${card.characterId}`);
                                    return (
                                        <tr key={i} className="border-t border-slate-50">
                                            <td className="py-1.5 px-1 font-bold text-slate-500">{i === 0 ? "队长" : `#${i + 1}`}</td>
                                            <td className="py-1.5 px-1 font-mono text-slate-600">{card.cardId}</td>
                                            <td className="py-1.5 px-1 text-slate-600">{cardName}</td>
                                            <td className="py-1.5 px-1 text-right font-mono text-slate-600">{basePower.toLocaleString()}</td>
                                            <td className="py-1.5 px-1 text-right text-miku font-bold">
                                                <span>{card.skill?.scoreUp || 0}%</span>
                                                {card.skill?.isPreTrainingSkill && <span className="ml-1 text-[9px] font-medium text-amber-500 bg-amber-50 px-1 py-[1px] rounded" title="该卡使用觉醒前（花前）技能效果">花前</span>}
                                            </td>
                                            {(mode === "event" || mode === "mysekai" || mode === "custom") && (
                                                <td className="py-1.5 px-1 text-right font-bold text-amber-600">
                                                    {eventBonusText}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-2 flex gap-4 sm:hidden text-xs">
                        {(mode === "event" || mode === "mysekai" || mode === "custom") && totalEventBonus > 0 && (
                            <span className="text-slate-500">
                                {totalBonusLabel}: <span className="font-bold text-miku">{totalEventBonusText}</span>
                                {showSupportBonusBreakdown && <span className="text-slate-400">（主队{baseEventBonusText} + 支援{supportDeckBonusText}）</span>}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
