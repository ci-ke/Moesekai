"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { IMusicInfo, IMusicMeta } from "@/types/music";
import { CHAR_NAMES, ATTR_ICON_PATHS } from "@/types/types";
import { fetchMasterData } from "@/lib/fetch";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import MusicSelector from "@/components/deck-recommend/MusicSelector";
import EventSelector from "@/components/deck-recommend/EventSelector";
import CharacterSelector from "@/components/deck-recommend/CharacterSelector";
import { useTheme } from "@/contexts/ThemeContext";
import { getCardThumbnailUrl } from "@/lib/assets";
import {
    getValidScores,
    planSmartRoutes,
    FIRE_OPTIONS,
    type ScoreControlResult,
    type SmartRoutePlan,
} from "@/lib/score-control/score-control-calculator";
import "./score-control.css";

const MUSIC_META_API = "https://assets.exmeaning.com/musicmeta/music_metas.json";

const DIFFICULTY_OPTIONS = [
    { value: "easy", label: "Easy" },
    { value: "normal", label: "Normal" },
    { value: "hard", label: "Hard" },
    { value: "expert", label: "Expert" },
    { value: "master", label: "Master" },
    { value: "append", label: "Append" },
];

/** Group results by boost level */
interface BoostGroup {
    boost: number;
    boostRate: number;
    label: string;
    results: ScoreControlResult[];
}

function groupByBoost(raw: ScoreControlResult[]): BoostGroup[] {
    const groups: BoostGroup[] = [];
    for (const opt of FIRE_OPTIONS) {
        const boostResults = raw.filter((r) => r.boost === opt.fires);
        if (boostResults.length > 0) {
            groups.push({
                boost: opt.fires,
                boostRate: opt.rate,
                label: opt.label,
                results: boostResults,
            });
        }
    }
    return groups;
}

/** Fire label helper */
function fireLabel(boost: number): string {
    const opt = FIRE_OPTIONS.find((f) => f.fires === boost);
    return opt ? opt.label : `${boost}🔥`;
}

// ==================== Deck Builder Types ====================
interface CardConfigItem {
    disable: boolean;
    rankMax: boolean;
    episodeRead: boolean;
    masterMax: boolean;
    skillMax: boolean;
}

type ServerType = "jp" | "cn" | "tw";

const SERVER_OPTIONS: { value: ServerType; label: string }[] = [
    { value: "cn", label: "简中服 (CN)" },
    { value: "jp", label: "日服 (JP)" },
    { value: "tw", label: "繁中服 (TW)" },
];

const LIVE_TYPE_OPTIONS = [
    { value: "multi", label: "多人 (Multi)" },
    { value: "solo", label: "单人 (Solo)" },
    { value: "auto", label: "自动 (Auto)" },
    { value: "cheerful", label: "嘉年华 (Cheerful)" },
];

const RARITY_CONFIG_KEYS = [
    { key: "rarity_1", label: "★1", color: "#888888" },
    { key: "rarity_2", label: "★2", color: "#88BB44" },
    { key: "rarity_3", label: "★3", color: "#4488DD" },
    { key: "rarity_4", label: "★4", color: "#FFAA00" },
    { key: "rarity_birthday", label: "Birthday", color: "#FF6699" },
];

const DEFAULT_CARD_CONFIG: Record<string, CardConfigItem> = {
    rarity_1: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_2: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_3: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_4: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_birthday: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
};

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

export default function ScoreControlClient() {
    const { assetSource } = useTheme();

    // Music selection state
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [musicMetas, setMusicMetas] = useState<IMusicMeta[]>([]);
    const [musicId, setMusicId] = useState("");
    const [difficulty, setDifficulty] = useState("master");

    // Calculator inputs
    const [targetPT, setTargetPT] = useState<number>(698);
    const [minBonus, setMinBonus] = useState<number>(5);
    const [maxBonus, setMaxBonus] = useState<number>(200);

    // Result state
    const [smartRoutes, setSmartRoutes] = useState<SmartRoutePlan[] | null>(null);
    const [fallbackResults, setFallbackResults] = useState<BoostGroup[] | null>(null);
    const [fallbackCount, setFallbackCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [expandedRoute, setExpandedRoute] = useState<number | null>(null);

    // ====== Deck Builder State ======
    const [deckBuilderEnabled, setDeckBuilderEnabled] = useState(false);
    const [dbUserId, setDbUserId] = useState("");
    const [dbServer, setDbServer] = useState<ServerType>("jp");
    const [dbEventId, setDbEventId] = useState("");
    const [dbLiveType, setDbLiveType] = useState("multi");
    const [dbSupportCharacterId, setDbSupportCharacterId] = useState<number | null>(null);
    const [dbCardConfig, setDbCardConfig] = useState<Record<string, CardConfigItem>>(
        JSON.parse(JSON.stringify(DEFAULT_CARD_CONFIG))
    );
    const [dbShowCardConfig, setDbShowCardConfig] = useState(false);
    const [dbAllowSave, setDbAllowSave] = useState(false);

    // Deck builder results
    const [dbResults, setDbResults] = useState<any[] | null>(null);
    const [dbUserCards, setDbUserCards] = useState<any[]>([]);
    const [dbDuration, setDbDuration] = useState<number | null>(null);
    const [dbError, setDbError] = useState<string | null>(null);
    const [dbIsCalculating, setDbIsCalculating] = useState(false);
    const [dbUploadTime, setDbUploadTime] = useState<number | null>(null);
    const [cardsMaster, setCardsMaster] = useState<any[]>([]);

    const dbWorkerRef = useRef<Worker | null>(null);

    // Load initial data
    useEffect(() => {
        fetchMasterData<IMusicInfo[]>("musics.json")
            .then((data) => setMusics(data))
            .catch((err) => console.error("Failed to fetch musics", err));

        fetch(MUSIC_META_API)
            .then((res) => res.json())
            .then((data) => setMusicMetas(data))
            .catch((err) => console.error("Failed to fetch music meta", err));

        fetchMasterData<any[]>("cards.json").then(setCardsMaster).catch(console.error);

        // Load saved deck builder preferences
        const savedUserId = localStorage.getItem("deck_recommend_userid");
        const savedServer = localStorage.getItem("deck_recommend_server");
        if (savedUserId) { setDbUserId(savedUserId); setDbAllowSave(true); }
        if (savedServer && ["jp", "cn", "tw"].includes(savedServer)) {
            setDbServer(savedServer as ServerType);
        }
    }, []);

    // Get event_rate for selected song + difficulty
    const selectedEventRate = useMemo((): number | null => {
        if (!musicId || !musicMetas.length) return null;
        const id = parseInt(musicId);
        const meta = musicMetas.find(
            (m: any) => m.music_id === id && m.difficulty === difficulty,
        );
        if (!meta) return null;
        return (meta as any).event_rate || 100;
    }, [musicId, difficulty, musicMetas]);

    // Selected music title
    const selectedMusicTitle = useMemo(() => {
        if (!musicId) return "";
        const music = musics.find((m) => m.id.toString() === musicId);
        return music ? music.title : `Music ${musicId}`;
    }, [musicId, musics]);

    // Handle calculation
    const handleCalculate = useCallback(() => {
        if (!selectedEventRate) {
            setError("请选择歌曲，并确保所选难度有对应Meta数据");
            return;
        }
        if (!targetPT || targetPT <= 0) {
            setError("请输入有效的目标活动PT");
            return;
        }
        if (minBonus > maxBonus) {
            setError("加成下限不能大于上限");
            return;
        }

        setIsCalculating(true);
        setError(null);
        setSmartRoutes(null);
        setFallbackResults(null);
        setFallbackCount(0);
        setExpandedRoute(null);

        setTimeout(() => {
            try {
                const bonusMin = Math.max(0, minBonus);
                const bonusMax = Math.min(415, maxBonus);

                const routes = planSmartRoutes(
                    targetPT, selectedEventRate, bonusMin, bonusMax, 100000, 10, 20,
                );
                setSmartRoutes(routes);

                if (routes.length > 0) {
                    setExpandedRoute(0);
                } else {
                    const raw = getValidScores(targetPT, selectedEventRate, 415, 100000);
                    const filtered = raw.filter(r => r.eventBonus >= bonusMin && r.eventBonus <= bonusMax);
                    const groups = groupByBoost(filtered);
                    setFallbackResults(groups);
                    setFallbackCount(filtered.length);
                }
            } catch (err: any) {
                setError(err.message || "计算出错");
                setSmartRoutes(null);
                setFallbackResults(null);
            } finally {
                setIsCalculating(false);
            }
        }, 10);

        // === Deck Builder: start worker if enabled ===
        if (deckBuilderEnabled) {
            if (!dbUserId.trim()) {
                setDbError("请输入用户ID");
                return;
            }
            if (!dbEventId.trim()) {
                setDbError("请选择活动");
                return;
            }

            setDbError(null);
            setDbResults(null);
            setDbDuration(null);
            setDbUploadTime(null);
            setDbIsCalculating(true);

            // Build card config
            const configForCalc: Record<string, any> = {};
            for (const [key, val] of Object.entries(dbCardConfig)) {
                if (val.disable) {
                    configForCalc[key] = { disable: true };
                } else {
                    configForCalc[key] = {
                        rankMax: val.rankMax,
                        episodeRead: val.episodeRead,
                        masterMax: val.masterMax,
                        skillMax: val.skillMax,
                    };
                }
            }

            // Pass the user's bonus range directly to the deck builder
            const bonusMin = Math.max(0, minBonus);
            const bonusMax = Math.min(415, maxBonus);

            if (dbWorkerRef.current) {
                dbWorkerRef.current.terminate();
            }

            const worker = new Worker(
                new URL("@/lib/deck-recommend/deck-builder-worker.ts", import.meta.url)
            );
            dbWorkerRef.current = worker;

            worker.onmessage = (event) => {
                const data = event.data;
                if (data.error) {
                    setDbError(getErrorMessage(data.error));
                } else {
                    const results = data.result || [];
                    setDbResults(results);
                    if (data.userCards) setDbUserCards(data.userCards);
                    setDbDuration(data.duration || null);
                    if (data.upload_time) setDbUploadTime(data.upload_time);

                    // Re-plan smart routes using ONLY the bonuses we found
                    if (results.length > 0) {
                        const foundBonuses = Array.from(new Set<number>(results.map((r: any) => {
                            const bonus = r.eventBonus ?? (r.score || 0); // Handle potentially different field names
                            return typeof bonus === 'number' ? bonus : 0;
                        })));

                        // Recalculate routes with valid bonuses
                        const newRoutes = planSmartRoutes(
                            targetPT, selectedEventRate!, Math.max(0, minBonus), Math.min(415, maxBonus), 100000, 10, 20,
                            foundBonuses
                        );
                        setSmartRoutes(newRoutes);
                        if (newRoutes.length > 0) {
                            setExpandedRoute(0);
                        }
                    } else {
                        // If no decks found, clear smart routes to avoid showing impossible plans
                        setSmartRoutes([]);
                    }
                }
                setDbIsCalculating(false);
                worker.terminate();
                dbWorkerRef.current = null;
            };

            worker.onerror = (err) => {
                setDbError(`Worker 错误: ${err.message}`);
                setDbIsCalculating(false);
                worker.terminate();
                dbWorkerRef.current = null;
            };

            worker.postMessage({
                args: {
                    userId: dbUserId.trim(),
                    server: dbServer,
                    eventId: parseInt(dbEventId),
                    minBonus: bonusMin,
                    maxBonus: bonusMax,
                    liveType: dbLiveType,
                    musicId: parseInt(musicId),
                    difficulty,
                    supportCharacterId: dbSupportCharacterId || undefined,
                    cardConfig: configForCalc,
                },
            });
        }
    }, [selectedEventRate, targetPT, minBonus, maxBonus, deckBuilderEnabled, dbUserId, dbServer, dbEventId, dbLiveType, dbSupportCharacterId, musicId, difficulty, dbCardConfig, smartRoutes]);

    // Update deck builder card config
    const updateDbCardConfig = useCallback((rarity: string, field: keyof CardConfigItem, value: boolean) => {
        setDbCardConfig((prev) => ({
            ...prev,
            [rarity]: { ...prev[rarity], [field]: value },
        }));
    }, []);

    // Find card master data by ID
    const getCardMaster = useCallback((cardId: number) => {
        return cardsMaster.find((c: any) => c.id === cardId);
    }, [cardsMaster]);

    /** Render results table for fallback exact match */
    const renderResultsTable = (items: ScoreControlResult[]) => (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-50">
                        <th className="text-left px-5 py-2.5 font-medium">卡组活动加成</th>
                        <th className="text-left px-5 py-2.5 font-medium">得分下界</th>
                        <th className="text-left px-5 py-2.5 font-medium">得分上界</th>
                        <th className="text-left px-5 py-2.5 font-medium">得分窗口</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((r, i) => {
                        const isAFK = r.scoreMin === 0;
                        return (
                            <tr key={i} className={`sc-row border-b border-slate-50 last:border-0 ${isAFK ? "bg-emerald-50/50" : ""}`}>
                                <td className="px-5 py-2.5">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className={`w-2 h-2 rounded-full ${isAFK ? "bg-emerald-500" : "bg-miku"}`}></span>
                                        <span className="font-bold text-primary-text">{r.eventBonus}%</span>
                                        {isAFK && (
                                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                                                放置
                                            </span>
                                        )}
                                    </span>
                                </td>
                                <td className="px-5 py-2.5 font-mono text-slate-600">
                                    {isAFK ? (
                                        <span className="text-emerald-600 font-bold">0</span>
                                    ) : (
                                        r.scoreMin.toLocaleString()
                                    )}
                                </td>
                                <td className="px-5 py-2.5 font-mono text-slate-600">
                                    {r.scoreMax.toLocaleString()}
                                </td>
                                <td className="px-5 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <div className="sc-score-bar flex-1 min-w-[60px] max-w-[120px]">
                                            <div
                                                className={`sc-score-bar-fill ${isAFK ? "!bg-gradient-to-r !from-emerald-400 !to-emerald-500" : ""}`}
                                                style={{
                                                    width: `${Math.min(100, ((r.scoreMax - r.scoreMin + 1) / 1000) * 100)}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                                            {isAFK ? (
                                                <span className="text-emerald-500">可放置</span>
                                            ) : (
                                                <>±{Math.floor((r.scoreMax - r.scoreMin) / 2).toLocaleString()}</>
                                            )}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    return (
        <MainLayout activeNav="工具">
            <div className="container mx-auto px-4 sm:px-6 py-8 max-w-5xl">
                {/* Page Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 border border-miku/30 bg-miku/5 rounded-full mb-4">
                        <span className="text-miku text-xs font-bold tracking-widest uppercase">Score Control</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-primary-text">
                        控分<span className="text-miku">计算器</span>
                    </h1>
                    <p className="text-slate-500 mt-2 max-w-2xl mx-auto text-sm sm:text-base">
                        输入目标活动PT，智能规划放置路线
                    </p>
                </div>

                {/* Input Form */}
                <div className="glass-card p-5 sm:p-6 rounded-2xl mb-6">
                    <h2 className="text-lg font-bold text-primary-text mb-4 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-miku rounded-full"></span>
                        歌曲与目标
                    </h2>

                    {/* Song + Difficulty */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                        <div>
                            <MusicSelector
                                selectedMusicId={musicId}
                                onSelect={(id) => setMusicId(id)}
                                recommendMode="event"
                                liveType="multi"
                            />
                            {musicId && selectedEventRate === null && (
                                <p className="mt-1 text-xs text-amber-500">
                                    ⚠️ 该歌曲的 {difficulty.toUpperCase()} 难度暂无Meta数据
                                </p>
                            )}
                            {selectedEventRate !== null && (
                                <p className="mt-1 text-xs text-slate-400">
                                    歌曲PT系数: <span className="font-bold text-miku">{selectedEventRate}%</span>
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">难度</label>
                            <div className="flex flex-wrap gap-2">
                                {DIFFICULTY_OPTIONS.map((d) => {
                                    let activeClass = "";
                                    switch (d.value) {
                                        case "easy": activeClass = "bg-blue-500 text-white shadow-blue-500/20"; break;
                                        case "normal": activeClass = "bg-emerald-500 text-white shadow-emerald-500/20"; break;
                                        case "hard": activeClass = "bg-orange-500 text-white shadow-orange-500/20"; break;
                                        case "expert": activeClass = "bg-red-500 text-white shadow-red-500/20"; break;
                                        case "master": activeClass = "bg-purple-500 text-white shadow-purple-500/20"; break;
                                        case "append": activeClass = "bg-fuchsia-500 text-white shadow-fuchsia-500/20"; break;
                                        default: activeClass = "bg-miku text-white shadow-miku/20";
                                    }
                                    return (
                                        <button
                                            key={d.value}
                                            onClick={() => setDifficulty(d.value)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-md ${difficulty === d.value
                                                ? activeClass
                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200 shadow-none"
                                                }`}
                                        >
                                            {d.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Target PT + Bonus Range */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                目标活动PT <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="number"
                                value={targetPT}
                                onChange={(e) => setTargetPT(Number(e.target.value))}
                                placeholder="698"
                                min={1}
                                className="sc-number-input w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-miku/20 focus:border-miku transition-all text-sm"
                            />
                            <p className="mt-1 text-xs text-slate-400">
                                希望获得的活动PT点数
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                加成下限 (%)
                            </label>
                            <input
                                type="number"
                                value={minBonus}
                                onChange={(e) => setMinBonus(Number(e.target.value))}
                                placeholder="5"
                                min={0}
                                max={415}
                                className="sc-number-input w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-miku/20 focus:border-miku transition-all text-sm"
                            />
                            <p className="mt-1 text-xs text-slate-400">
                                卡组活动加成最低值
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                加成上限 (%)
                            </label>
                            <input
                                type="number"
                                value={maxBonus}
                                onChange={(e) => setMaxBonus(Number(e.target.value))}
                                placeholder="200"
                                min={0}
                                max={415}
                                className="sc-number-input w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-miku/20 focus:border-miku transition-all text-sm"
                            />
                            <p className="mt-1 text-xs text-slate-400">
                                卡组活动加成最高值
                            </p>
                        </div>
                    </div>

                    {/* ====== Deck Builder Toggle ====== */}
                    <div className="mb-5 p-4 rounded-xl border border-slate-200/60 bg-slate-50/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-primary-text">控分组卡</span>
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Beta</span>
                            </div>
                            <button
                                onClick={() => setDeckBuilderEnabled(!deckBuilderEnabled)}
                                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${deckBuilderEnabled ? 'bg-miku' : 'bg-slate-200'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${deckBuilderEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                        {deckBuilderEnabled && (
                            <div className="mt-2 text-xs text-amber-600 flex items-start gap-1.5">
                                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <span>启用控分组卡时，计算时间将大幅增加，请尽量采用 PC / iPad；没有计算出来是算法的问题，因为它正在测试，你仍然可以尝试在游戏手动组卡</span>
                            </div>
                        )}
                    </div>

                    {/* ====== Deck Builder Expanded Options ====== */}
                    {deckBuilderEnabled && (
                        <div className="mb-5 space-y-4 p-4 rounded-xl border border-miku/20 bg-miku/5">
                            <h3 className="text-sm font-bold text-primary-text flex items-center gap-2">
                                <span className="w-1 h-4 bg-miku rounded-full"></span>
                                控分组卡设置
                            </h3>

                            {/* User ID + Server */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        用户ID <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={dbUserId}
                                        onChange={(e) => {
                                            setDbUserId(e.target.value);
                                            if (dbAllowSave) localStorage.setItem("deck_recommend_userid", e.target.value);
                                        }}
                                        placeholder="输入游戏ID"
                                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-miku/20 focus:border-miku transition-all text-sm"
                                    />
                                    <div className="flex items-center justify-between mt-2 px-1">
                                        <span className="text-xs text-slate-500">保存在浏览器本地</span>
                                        <button
                                            onClick={() => {
                                                const n = !dbAllowSave;
                                                setDbAllowSave(n);
                                                if (n) {
                                                    localStorage.setItem("deck_recommend_userid", dbUserId);
                                                    localStorage.setItem("deck_recommend_server", dbServer);
                                                } else {
                                                    localStorage.removeItem("deck_recommend_userid");
                                                    localStorage.removeItem("deck_recommend_server");
                                                }
                                            }}
                                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${dbAllowSave ? 'bg-miku' : 'bg-slate-200'}`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${dbAllowSave ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">
                                        需先在 <ExternalLink href="https://haruki.seiunx.com" className="text-miku hover:underline">Haruki工具箱</ExternalLink> 上传数据并开启公开API
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">服务器</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SERVER_OPTIONS.map((s) => (
                                            <button
                                                key={s.value}
                                                onClick={() => {
                                                    setDbServer(s.value);
                                                    if (dbAllowSave) localStorage.setItem("deck_recommend_server", s.value);
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${dbServer === s.value
                                                    ? "bg-miku text-white shadow-md shadow-miku/20"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                    }`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Event + Live Type */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        活动 <span className="text-red-400">*</span>
                                    </label>
                                    <EventSelector
                                        selectedEventId={dbEventId}
                                        onSelect={setDbEventId}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Live类型</label>
                                    <div className="flex flex-wrap gap-2">
                                        {LIVE_TYPE_OPTIONS.map((lt) => (
                                            <button
                                                key={lt.value}
                                                onClick={() => setDbLiveType(lt.value)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${dbLiveType === lt.value
                                                    ? "bg-miku text-white shadow-md shadow-miku/20"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                    }`}
                                            >
                                                {lt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Support Character (optional) */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">支援角色（可选，仅世界开花）</label>
                                <CharacterSelector
                                    selectedCharacterId={dbSupportCharacterId}
                                    onSelect={setDbSupportCharacterId}
                                />
                            </div>

                            {/* Card Config Toggle */}
                            <div>
                                <button
                                    onClick={() => setDbShowCardConfig(!dbShowCardConfig)}
                                    className="text-sm font-medium text-slate-600 hover:text-miku transition-colors flex items-center gap-1"
                                >
                                    <svg className={`w-4 h-4 transition-transform ${dbShowCardConfig ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    卡牌养成设置
                                </button>
                                {dbShowCardConfig && (
                                    <div className="mt-2 overflow-x-auto">
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="text-slate-400">
                                                    <th className="text-left py-1 px-2">稀有度</th>
                                                    <th className="text-center py-1 px-2">启用</th>
                                                    <th className="text-center py-1 px-2">满级</th>
                                                    <th className="text-center py-1 px-2">读卡面</th>
                                                    <th className="text-center py-1 px-2">满破</th>
                                                    <th className="text-center py-1 px-2">满技能</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {RARITY_CONFIG_KEYS.map((rk) => {
                                                    const cfg = dbCardConfig[rk.key];
                                                    return (
                                                        <tr key={rk.key} className="border-t border-slate-100">
                                                            <td className="py-1.5 px-2 font-bold" style={{ color: rk.color }}>{rk.label}</td>
                                                            <td className="py-1.5 px-2 text-center">
                                                                <input type="checkbox" checked={!cfg.disable} onChange={(e) => updateDbCardConfig(rk.key, 'disable', !e.target.checked)} className="accent-miku" />
                                                            </td>
                                                            <td className="py-1.5 px-2 text-center">
                                                                <input type="checkbox" checked={cfg.rankMax} onChange={(e) => updateDbCardConfig(rk.key, 'rankMax', e.target.checked)} className="accent-miku" disabled={cfg.disable} />
                                                            </td>
                                                            <td className="py-1.5 px-2 text-center">
                                                                <input type="checkbox" checked={cfg.episodeRead} onChange={(e) => updateDbCardConfig(rk.key, 'episodeRead', e.target.checked)} className="accent-miku" disabled={cfg.disable} />
                                                            </td>
                                                            <td className="py-1.5 px-2 text-center">
                                                                <input type="checkbox" checked={cfg.masterMax} onChange={(e) => updateDbCardConfig(rk.key, 'masterMax', e.target.checked)} className="accent-miku" disabled={cfg.disable} />
                                                            </td>
                                                            <td className="py-1.5 px-2 text-center">
                                                                <input type="checkbox" checked={cfg.skillMax} onChange={(e) => updateDbCardConfig(rk.key, 'skillMax', e.target.checked)} className="accent-miku" disabled={cfg.disable} />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Calculate Button */}
                    <button
                        onClick={handleCalculate}
                        disabled={!selectedEventRate || isCalculating}
                        className="w-full px-6 py-3 bg-gradient-to-r from-miku to-miku-dark text-white rounded-xl font-bold shadow-lg shadow-miku/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isCalculating ? (
                            <>
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                计算中...
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                智能计算
                            </>
                        )}
                    </button>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="glass-card p-4 rounded-2xl mb-6 bg-red-50/80 border border-red-200/50">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm font-medium text-red-700">{error}</p>
                        </div>
                    </div>
                )}

                {/* ===== Smart Route Plans (Primary) ===== */}
                {smartRoutes !== null && smartRoutes.length > 0 && (
                    <div className="sc-result-enter mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <h2 className="text-lg font-bold text-primary-text flex items-center gap-2">
                                <span className="w-1.5 h-6 bg-gradient-to-b from-emerald-400 to-miku rounded-full"></span>
                                智能路线规划
                            </h2>
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full">
                                {smartRoutes.length} 条路线
                            </span>
                            <span className="text-xs text-slate-400">
                                加成范围 {minBonus}% ~ {maxBonus}%
                            </span>
                        </div>

                        <div className="space-y-3">
                            {smartRoutes.map((plan, idx) => {
                                const isExpanded = expandedRoute === idx;
                                return (
                                    <div key={idx} className="glass-card rounded-2xl overflow-hidden">
                                        {/* Route header */}
                                        <button
                                            onClick={() => setExpandedRoute(isExpanded ? null : idx)}
                                            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                                <span className="text-sm font-black text-primary-text whitespace-nowrap">
                                                    路线 {idx + 1}
                                                </span>
                                                {plan.isPureAFK ? (
                                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                                                        ✨ 纯放置
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                                                        ⚡ 放置+控分
                                                    </span>
                                                )}
                                                <span className="text-xs text-slate-400 whitespace-nowrap">
                                                    {plan.totalPlays} 场游戏
                                                    {plan.afkCount > 0 && (
                                                        <span className="text-emerald-500 ml-1">
                                                            ({plan.afkCount} 场放置)
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-xs font-bold text-orange-500 whitespace-nowrap">
                                                    = {plan.totalPT} PT
                                                </span>
                                            </div>
                                            <svg
                                                className={`w-5 h-5 text-slate-400 transition-transform flex-shrink-0 ml-2 ${isExpanded ? "rotate-180" : ""}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {/* Expanded steps */}
                                        {isExpanded && (
                                            <div className="border-t border-slate-100 px-5 py-4 space-y-3">
                                                {plan.steps.map((step, si) => (
                                                    <div
                                                        key={si}
                                                        className={`rounded-xl p-4 border ${step.isAFK
                                                            ? "bg-emerald-50/60 border-emerald-200/50"
                                                            : "bg-blue-50/60 border-blue-200/50"
                                                            }`}
                                                    >
                                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${step.isAFK
                                                                ? "bg-emerald-100 text-emerald-700"
                                                                : "bg-blue-100 text-blue-700"
                                                                }`}>
                                                                {step.isAFK ? "放置" : "控分"}
                                                            </span>
                                                            <span className="text-sm font-bold text-primary-text">
                                                                ×{step.count}
                                                            </span>
                                                            <span className="text-xs text-slate-400">
                                                                每次 {step.pt} PT
                                                            </span>
                                                            <span className="text-xs text-slate-400">
                                                                → 小计 <span className="font-bold text-primary-text">{step.pt * step.count} PT</span>
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                                            <div>
                                                                <span className="text-slate-400">火罐</span>
                                                                <div className="font-bold text-primary-text mt-0.5">
                                                                    {fireLabel(step.boost)}
                                                                    <span className="text-slate-400 font-normal ml-1">×{step.boostRate}</span>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-400">卡组加成</span>
                                                                <div className="font-bold text-primary-text mt-0.5">
                                                                    {step.eventBonus}%
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-400">得分范围</span>
                                                                <div className="font-bold text-primary-text mt-0.5 font-mono">
                                                                    {step.isAFK ? (
                                                                        <span className="text-emerald-600">
                                                                            0 ~ {step.scoreMax.toLocaleString()}
                                                                        </span>
                                                                    ) : (
                                                                        <span>
                                                                            {step.scoreMin.toLocaleString()} ~ {step.scoreMax.toLocaleString()}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-400">操作</span>
                                                                <div className="font-bold mt-0.5">
                                                                    {step.isAFK ? (
                                                                        <span className="text-emerald-600">直接放置即可 ✨</span>
                                                                    ) : (
                                                                        <span className="text-blue-600">
                                                                            控分到 {step.scoreMin.toLocaleString()}~{step.scoreMax.toLocaleString()}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Total summary */}
                                                <div className="flex items-center justify-end gap-2 pt-1">
                                                    <span className="text-xs text-slate-400">总计:</span>
                                                    <span className="text-sm font-black text-orange-500 font-mono">
                                                        {plan.steps.reduce((sum, s) => sum + s.pt * s.count, 0)} PT
                                                    </span>
                                                    <span className="text-emerald-500 text-xs font-bold">✓ 恰好达成</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ===== Fallback: Exact Single-Play (only if no smart routes) ===== */}
                {smartRoutes !== null && smartRoutes.length === 0 && fallbackResults !== null && (
                    <div className="sc-result-enter">
                        {/* Fallback notice */}
                        <div className="glass-card p-4 rounded-2xl mb-4 bg-amber-50/80 border border-amber-200/50">
                            <div className="flex items-start gap-3">
                                <span className="text-xl flex-shrink-0">💡</span>
                                <div>
                                    <p className="text-sm font-medium text-amber-800">
                                        未找到放置路线方案，以下是常规单次达成方案
                                    </p>
                                    <p className="text-xs text-amber-600 mt-0.5">
                                        加成范围 {minBonus}% ~ {maxBonus}% · 目标 {targetPT} PT
                                    </p>
                                </div>
                            </div>
                        </div>

                        {fallbackResults.length === 0 ? (
                            <div className="glass-card p-8 rounded-2xl text-center">
                                <div className="text-4xl mb-3">🤔</div>
                                <p className="text-slate-500 font-medium">
                                    未找到满足条件的方案
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    尝试调整目标PT、加成范围或更换歌曲
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="glass-card p-4 sm:p-5 rounded-2xl mb-4">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-lg font-bold text-primary-text flex items-center gap-2">
                                                <span className="w-1.5 h-6 bg-miku rounded-full"></span>
                                                常规单次方案
                                            </h2>
                                            <span className="px-2.5 py-1 bg-miku/10 text-miku text-xs font-bold rounded-full">
                                                {fallbackCount} 种方案
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                                            <span>目标PT: <span className="font-bold text-orange-500">{targetPT}</span></span>
                                            <span>·</span>
                                            <span>歌曲系数: {selectedEventRate}%</span>
                                            {selectedMusicTitle && (
                                                <>
                                                    <span>·</span>
                                                    <span className="truncate max-w-[200px]">{selectedMusicTitle}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {fallbackResults.map((group) => (
                                    <div key={group.boost} className="glass-card rounded-2xl mb-4 overflow-hidden">
                                        <div className="sc-boost-header px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">{group.label}</span>
                                                <span className="text-xs text-slate-400">
                                                    倍率 ×{group.boostRate}
                                                </span>
                                            </div>
                                            <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
                                                {group.results.length} 种方案
                                            </span>
                                        </div>
                                        {renderResultsTable(group.results)}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* No results at all */}
                {smartRoutes !== null && smartRoutes.length === 0 && fallbackResults === null && (
                    <div className="glass-card p-8 rounded-2xl text-center sc-result-enter">
                        <div className="text-4xl mb-3">🤔</div>
                        <p className="text-slate-500 font-medium">
                            未找到满足条件的方案
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            尝试调整目标PT、加成范围或更换歌曲
                        </p>
                    </div>
                )}

                {/* ====== Deck Builder Results ====== */}
                {deckBuilderEnabled && (
                    <div className="sc-result-enter mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <h2 className="text-lg font-bold text-primary-text flex items-center gap-2">
                                <span className="w-1.5 h-6 bg-gradient-to-b from-amber-400 to-miku rounded-full"></span>
                                控分组卡结果
                            </h2>
                            {dbDuration !== null && (
                                <span className="text-xs text-slate-400">
                                    耗时 {(dbDuration / 1000).toFixed(1)}s
                                </span>
                            )}
                            {dbUploadTime && (
                                <span className="text-xs text-slate-400">
                                    数据时间: {new Date(dbUploadTime * 1000).toLocaleString()}
                                </span>
                            )}
                        </div>

                        {dbIsCalculating && (
                            <div className="glass-card p-8 rounded-2xl text-center">
                                <svg className="w-8 h-8 animate-spin mx-auto text-miku" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <p className="text-slate-500 mt-3 text-sm">控分组卡计算中，请耐心等待...</p>
                                <p className="text-xs text-slate-400 mt-1">全量搜索可能需要较长时间</p>
                            </div>
                        )}

                        {dbError && (
                            <div className="glass-card p-4 rounded-2xl mb-4 bg-red-50/80 border border-red-200/50">
                                <div className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-sm font-medium text-red-700">{dbError}</p>
                                </div>
                            </div>
                        )}

                        {!dbIsCalculating && dbResults !== null && dbResults.length === 0 && (
                            <div className="glass-card p-8 rounded-2xl text-center">
                                <div className="text-4xl mb-3">🤔</div>
                                <p className="text-slate-500 font-medium">
                                    未找到匹配目标加成的卡组
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    试试调整目标加成范围、开启更多稀有度、或检查用户数据
                                </p>
                            </div>
                        )}

                        {!dbIsCalculating && dbResults !== null && dbResults.length > 0 && (
                            <div className="space-y-3">
                                {dbResults.map((deck: any, idx: number) => {
                                    const eventBonus = deck.eventBonus ?? (deck.score || 0);
                                    return (
                                        <div key={idx} className="glass-card rounded-2xl overflow-hidden">
                                            <div className="px-5 py-4">
                                                <div className="flex items-center gap-3 mb-3 flex-wrap">
                                                    <span className="text-sm font-bold text-primary-text">推荐卡组</span>
                                                    <span className="text-xs font-bold text-miku bg-miku/10 px-2 py-0.5 rounded-full">
                                                        活动加成 {eventBonus.toFixed(1)}%
                                                    </span>
                                                </div>

                                                {/* Card Thumbnails */}
                                                <div className="flex gap-2 flex-wrap mb-3">
                                                    {deck.cards?.slice(0, 5).map((card: any, i: number) => {
                                                        const masterCard = getCardMaster(card.cardId);
                                                        const userCard = dbUserCards.find((u: any) => u.cardId === card.cardId);
                                                        let rarity = masterCard?.rarity || 1;
                                                        const rarityType = masterCard?.cardRarityType || card.cardRarityType;
                                                        const isBirthday = rarityType === "rarity_birthday";
                                                        if (rarityType) {
                                                            switch (rarityType) {
                                                                case "rarity_1": rarity = 1; break;
                                                                case "rarity_2": rarity = 2; break;
                                                                case "rarity_3": rarity = 3; break;
                                                                case "rarity_4": rarity = 4; break;
                                                                case "rarity_birthday": rarity = 4; break;
                                                            }
                                                        }
                                                        const masterRank = userCard?.masterRank ?? card.masterRank ?? 0;
                                                        const level = userCard?.level ?? card.level ?? 1;
                                                        const showTrained = ((rarityType === "rarity_3" || rarityType === "rarity_4") && !isBirthday);

                                                        if (!masterCard) {
                                                            return (
                                                                <div key={i} className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-xs">?</div>
                                                            );
                                                        }
                                                        return (
                                                            <div key={i} className="relative flex flex-col items-center gap-0.5">
                                                                <div className="relative w-12 h-12 rounded overflow-hidden ring-1 ring-slate-200">
                                                                    <Link href={`/cards/${card.cardId}`} className="block relative w-full h-full" target="_blank">
                                                                        <Image
                                                                            src={getCardThumbnailUrl(masterCard.characterId, masterCard.assetbundleName, showTrained, assetSource)}
                                                                            alt={`Card ${card.cardId}`}
                                                                            fill
                                                                            className="object-cover"
                                                                            unoptimized
                                                                        />
                                                                    </Link>
                                                                    {masterCard.attr && (
                                                                        <div className="absolute top-0.5 left-0.5 w-3 h-3 drop-shadow-md z-10">
                                                                            <Image src={`/data/icon/${ATTR_ICON_PATHS[masterCard.attr as import("@/types/types").CardAttribute]}`} alt={masterCard.attr} fill className="object-contain" unoptimized />
                                                                        </div>
                                                                    )}
                                                                    <div className="absolute top-0.5 right-0.5 z-10">
                                                                        <div className="bg-black/40 backdrop-blur-[2px] rounded-full px-1 py-0 flex items-center gap-0.5 min-h-[10px]">
                                                                            {isBirthday ? (
                                                                                <div className="w-2.5 h-2.5 relative"><Image src="/data/icon/birthday.webp" alt="Birthday" fill className="object-contain" unoptimized /></div>
                                                                            ) : (
                                                                                <>
                                                                                    <span className="text-white text-[6px] font-bold leading-none">{rarity}</span>
                                                                                    <div className="w-1.5 h-1.5 relative"><Image src="/data/icon/star.webp" alt="Star" fill className="object-contain" unoptimized /></div>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {i === 0 && (
                                                                        <div className="absolute bottom-0 right-0 bg-miku/90 text-white text-[8px] font-bold px-1 py-[1px] rounded-tl-md leading-none backdrop-blur-[1px]">L</div>
                                                                    )}
                                                                </div>
                                                                <div className="text-[9px] text-slate-500 font-mono leading-none flex items-center gap-0.5">
                                                                    <span>Lv.{level}</span>
                                                                    {masterRank > 0 && (
                                                                        <span className="bg-slate-100 text-slate-600 rounded-full px-[3px] py-[1px] flex items-center gap-[1px] leading-none border border-slate-200">
                                                                            <span className="text-[7px]">🔷</span>
                                                                            <span className="text-[8px] font-bold">{masterRank}</span>
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Detail Table */}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-slate-400">
                                                                <th className="text-left py-1 px-1">队长</th>
                                                                <th className="text-left py-1 px-1">卡牌ID</th>
                                                                <th className="text-left py-1 px-1">卡面名称</th>
                                                                <th className="text-right py-1 px-1">综合力</th>
                                                                <th className="text-right py-1 px-1">活动加成</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {deck.cards?.map((card: any, i: number) => {
                                                                const mc = getCardMaster(card.cardId);
                                                                const basePower = card.power
                                                                    ? (card.power.base || 0) + (card.power.areaItem || 0) + (card.power.characterRank || 0) +
                                                                    (card.power.honor || 0) + (card.power.mysekaiGate || 0) + (card.power.mysekaiCanvas || 0) + (card.power.masterRank || 0)
                                                                    : 0;
                                                                const eb = card.eventBonus;
                                                                const cardName = mc?.prefix || (mc ? CHAR_NAMES[mc.characterId] : `ID:${card.characterId}`);
                                                                return (
                                                                    <tr key={i} className="border-t border-slate-50">
                                                                        <td className="py-1.5 px-1 font-bold text-slate-500">{i === 0 ? "队长" : `#${i + 1}`}</td>
                                                                        <td className="py-1.5 px-1 font-mono text-slate-600">{card.cardId}</td>
                                                                        <td className="py-1.5 px-1 text-slate-600">{cardName}</td>
                                                                        <td className="py-1.5 px-1 text-right font-mono text-slate-600">{basePower.toLocaleString()}</td>
                                                                        <td className="py-1.5 px-1 text-right font-bold text-amber-600">
                                                                            {typeof eb === "string" ? eb : (eb?.total || eb?.all || 0) > 0 ? `${eb?.total || eb?.all}%` : "-"}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="mt-12 text-center text-xs text-slate-400">
                    <p>
                        控分公式参考自社区，计算结果仅供参考
                    </p>
                </div>
            </div>
        </MainLayout>
    );
}
