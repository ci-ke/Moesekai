"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ReactECharts from "echarts-for-react";
import { CHAR_NAMES } from "@/types/types";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { getCharacterIconUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import type {
    ServerType,
    UserChallengeLiveSoloHighScoreReward,
    UserChallengeLiveSoloResult,
    UserChallengeLiveSoloStage,
} from "@/lib/account";

type UnitKey = "overview" | "ln" | "mmj" | "vbs" | "wxs" | "n25" | "vs";
type ViewType = "character" | "challenge";

interface Props {
    characterRanks: Map<number, number>;
    challengeStageRanks: Map<number, number>;
    server: ServerType;
    challengeSoloStages: UserChallengeLiveSoloStage[];
    challengeSoloResults: UserChallengeLiveSoloResult[];
    challengeHighScoreRewards: UserChallengeLiveSoloHighScoreReward[];
    uploadTime: number | null;
}

interface Row { characterId: number; rank: number; score: number; remainJewel: number; remainFragment: number; }
interface RewardMaster { id: number; characterId: number; resourceBoxId: number; }
interface BoxDetail { resourceType?: string; resourceId?: number; resourceQuantity?: number; }
interface BoxMaster { id: number; resourceBoxPurpose?: string; details?: BoxDetail[]; }
interface CharMaster { id: number; firstName?: string; givenName?: string; }
interface UnitMaster { unit: string; unitName: string; }

const UNIT_CONFIG: Record<UnitKey, { label: string; color: string; icon?: string; ids: number[] }> = {
    overview: { label: "总览", color: "#7b7b7b", ids: [21, 22, 23, 24, 25, 26, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
    ln: { label: "Leo/need", color: "#4455DD", icon: "/data/icon/ln.webp", ids: [1, 2, 3, 4] },
    mmj: { label: "MMJ", color: "#88DD44", icon: "/data/icon/mmj.webp", ids: [5, 6, 7, 8] },
    vbs: { label: "VBS", color: "#EE1166", icon: "/data/icon/vbs.webp", ids: [9, 10, 11, 12] },
    wxs: { label: "WxS", color: "#FF9900", icon: "/data/icon/wxs.webp", ids: [13, 14, 15, 16] },
    n25: { label: "25时", color: "#884499", icon: "/data/icon/n25.webp", ids: [17, 18, 19, 20] },
    vs: { label: "VS", color: "#33CCBB", icon: "/data/icon/vs.webp", ids: [21, 22, 23, 24, 25, 26] },
};

const GROUPS = [
    { key: "ln" as const, unit: "light_sound", name: "Leo/need", icon: "/data/icon/ln.webp", ids: [1, 2, 3, 4] },
    { key: "mmj" as const, unit: "idol", name: "MORE MORE JUMP!", icon: "/data/icon/mmj.webp", ids: [5, 6, 7, 8] },
    { key: "vbs" as const, unit: "street", name: "Vivid BAD SQUAD", icon: "/data/icon/vbs.webp", ids: [9, 10, 11, 12] },
    { key: "wxs" as const, unit: "theme_park", name: "Wonderlands x Showtime", icon: "/data/icon/wxs.webp", ids: [13, 14, 15, 16] },
    { key: "n25" as const, unit: "school_refusal", name: "25ji, Nightcord de.", icon: "/data/icon/n25.webp", ids: [17, 18, 19, 20] },
    { key: "vs" as const, unit: "piapro", name: "Virtual Singer", icon: "/data/icon/vs.webp", ids: [21, 22, 23, 24, 25, 26] },
];

const scoreCap = (s: ServerType) => (s === "jp" ? 3000000 : 2500000);
const stageToArea = (r: number) => (r <= 0 ? 0.4 : 0.5 + Math.log(r));
const unitColor = (id: number) => id >= 21 ? UNIT_CONFIG.vs.color : id <= 4 ? UNIT_CONFIG.ln.color : id <= 8 ? UNIT_CONFIG.mmj.color : id <= 12 ? UNIT_CONFIG.vbs.color : id <= 16 ? UNIT_CONFIG.wxs.color : UNIT_CONFIG.n25.color;
const rewardId = (x: UserChallengeLiveSoloHighScoreReward) => Number((x as any).challengeLiveHighScoreRewardId ?? (x as any).challengeLiveSoloHighScoreRewardId ?? (x as any).rewardId ?? 0) || null;
const rewardCid = (x: UserChallengeLiveSoloHighScoreReward) => Number((x as any).characterId ?? (x as any).gameCharacterId ?? 0) || null;

function collectBox(resourceMap: Map<number, BoxMaster>, root: number): { jewel: number; frag: number } {
    let jewel = 0; let frag = 0;
    const stack = [root]; const visited = new Set<number>();
    while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        for (const d of resourceMap.get(id)?.details || []) {
            const t = String(d.resourceType || "").toLowerCase();
            const rid = Number(d.resourceId || 0);
            const q = Number(d.resourceQuantity || 0);
            if (!q) continue;
            if (t.includes("jewel")) jewel += q;
            else if (t === "material" && rid === 15) frag += q;
            else if (t.includes("box")) stack.push(rid);
        }
    }
    return { jewel, frag };
}

export default function CharacterRankRadar({
    characterRanks, challengeStageRanks, server, challengeSoloStages, challengeSoloResults, challengeHighScoreRewards, uploadTime,
}: Props) {
    const { themeColor, serverSource } = useTheme();
    const [unit, setUnit] = useState<UnitKey>("overview");
    const [view, setView] = useState<ViewType>("character");
    const [mobile, setMobile] = useState(false);
    const [rows, setRows] = useState<Row[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDetail, setShowDetail] = useState(false);
    const [charNames, setCharNames] = useState<Map<number, string>>(new Map());
    const [unitNames, setUnitNames] = useState<Map<string, string>>(new Map());
    const [points, setPoints] = useState<Array<{ x: number; y: number; lx: number; ly: number; color: string; value: number }>>([]);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const chartRef = useRef<ReactECharts>(null);

    useEffect(() => {
        const fn = () => setMobile(window.innerWidth <= 420);
        fn(); window.addEventListener("resize", fn); return () => window.removeEventListener("resize", fn);
    }, []);

    useEffect(() => { if (view !== "challenge") setShowDetail(false); }, [view]);
    useEffect(() => { setRows(null); setShowDetail(false); setError(null); setLoading(false); }, [server, serverSource, challengeSoloStages, challengeSoloResults, challengeHighScoreRewards]);

    const orderedIds = useMemo(() => {
        const ids = UNIT_CONFIG[unit].ids;
        return ids.length > 1 ? [ids[0], ...ids.slice(1).reverse()] : ids;
    }, [unit]);

    const chartData = useMemo(() => {
        const raw = orderedIds.map((id) => view === "character" ? (characterRanks.get(id) || 0) : (challengeStageRanks.get(id) || 0));
        const plot = raw.map((v) => (view === "challenge" ? stageToArea(v) : v));
        const m = Math.max(view === "challenge" ? 1.2 : 10, ...plot);
        const max = view === "challenge" ? Math.max(1.2, Math.ceil(m * 10) / 10) : Math.ceil(m / 10) * 10;
        return { raw, plot, max };
    }, [orderedIds, view, characterRanks, challengeStageRanks]);

    const option = useMemo(() => ({
        animation: false,
        radar: {
            startAngle: 90,
            clockwise: true,
            indicator: orderedIds.map((id) => ({ name: CHAR_NAMES[id] || `ID ${id}`, max: chartData.max })),
            center: ["50%", "54%"],
            radius: mobile ? (unit === "overview" ? "58%" : "64%") : (unit === "overview" ? "67%" : "74%"),
            splitNumber: 10,
            axisName: { color: "#6e6e6e", fontSize: mobile ? (unit === "overview" ? 9 : 10) : (unit === "overview" ? 10 : 12), fontWeight: 700 },
            splitLine: { lineStyle: { color: "rgba(110,110,110,0.15)" } },
            splitArea: { areaStyle: { color: ["rgba(200,224,227,0.2)", "rgba(200,224,227,0.35)"] } },
            axisLine: { lineStyle: { color: "rgba(110,110,110,0.25)" } },
        },
        series: [{ type: "radar", data: [{ value: chartData.plot, areaStyle: { color: unit === "overview" ? "rgba(57,197,187,0.22)" : `${UNIT_CONFIG[unit].color}33` }, lineStyle: { color: unit === "overview" ? "#39c5bb" : UNIT_CONFIG[unit].color, width: 3 }, symbol: "none" }] }],
    }), [orderedIds, chartData, unit, mobile]);

    const refreshOverlay = useCallback(() => {
        const chart = chartRef.current?.getEchartsInstance();
        if (!chart) return;
        const width = chart.getWidth(); const height = chart.getHeight(); const n = chartData.plot.length;
        if (!width || !height || !n || chartData.max <= 0) return setPoints([]);
        const c = chart.convertToPixel({ radarIndex: 0 } as never, [0, 0]) as number[] | undefined;
        const cx = c?.[0] ?? width * 0.5; const cy = c?.[1] ?? height * 0.54;
        const labelOffset = mobile ? (unit === "overview" ? 8 : 10) : (unit === "overview" ? 12 : 14);
        const next = chartData.plot.map((pv, i) => {
            const axisIndex = i === 0 ? 0 : n - i;
            const ac = chart.convertToPixel({ radarIndex: 0 } as never, [axisIndex, chartData.max]) as number[] | undefined;
            const norm = Math.max(0, Math.min(pv / chartData.max, 1));
            let x: number;
            let y: number;
            if (ac && ac.length >= 2 && Number.isFinite(ac[0]) && Number.isFinite(ac[1])) {
                x = cx + (ac[0] - cx) * norm;
                y = cy + (ac[1] - cy) * norm;
            } else {
                const angle = -Math.PI / 2 + (Math.PI * 2 * axisIndex) / n;
                const radius = Math.min(width, height) * 0.5 * (mobile ? (unit === "overview" ? 0.58 : 0.64) : (unit === "overview" ? 0.67 : 0.74));
                x = cx + Math.cos(angle) * radius * norm;
                y = cy + Math.sin(angle) * radius * norm;
            }
            const vx = x - cx; const vy = y - cy; const len = Math.hypot(vx, vy) || 1;
            const cid = orderedIds[i];
            return { x, y, lx: x + (vx / len) * labelOffset, ly: y + (vy / len) * labelOffset, color: unit === "overview" ? unitColor(cid) : UNIT_CONFIG[unit].color, value: Math.round(chartData.raw[i] || 0) };
        });
        setSize({ width, height }); setPoints(next);
    }, [chartData, orderedIds, unit, mobile]);

    const loadDetail = useCallback(async () => {
        if (loading || rows) return;
        setLoading(true); setError(null);
        try {
            const nameServer: "jp" | "cn" = serverSource === "cn" ? "cn" : "jp";
            const [rewardPack, chars, units] = await Promise.all([
                (async () => {
                    const a = await fetchMasterDataForServer<RewardMaster[]>(server, "challengeLiveHighScoreRewards.json");
                    const b = await fetchMasterDataForServer<BoxMaster[]>(server, "resourceBoxes.json");
                    if (a.length) return { rewards: a, boxes: b };
                    return {
                        rewards: await fetchMasterDataForServer<RewardMaster[]>("jp", "challengeLiveHighScoreRewards.json"),
                        boxes: await fetchMasterDataForServer<BoxMaster[]>("jp", "resourceBoxes.json"),
                    };
                })(),
                fetchMasterDataForServer<CharMaster[]>(nameServer, "gameCharacters.json"),
                fetchMasterDataForServer<UnitMaster[]>(nameServer, "unitProfiles.json"),
            ]);

            const cMap = new Map<number, string>();
            chars.forEach((c) => { const n = `${c.firstName || ""}${c.givenName || ""}`.trim() || c.givenName || c.firstName; if (n) cMap.set(c.id, n); });
            setCharNames(cMap);
            const uMap = new Map<string, string>();
            units.forEach((u) => { if (u.unit && u.unitName) uMap.set(u.unit, u.unitName); });
            setUnitNames(uMap);

            const rewardById = new Map<number, RewardMaster>(); rewardPack.rewards.forEach((r) => rewardById.set(r.id, r));
            const completed = new Map<number, Set<number>>();
            challengeHighScoreRewards.forEach((x) => {
                const rid = rewardId(x); if (!rid) return;
                const cid = rewardCid(x) || rewardById.get(rid)?.characterId || 0; if (!cid) return;
                const set = completed.get(cid) || new Set<number>(); set.add(rid); completed.set(cid, set);
            });
            const rewardsByChar = new Map<number, RewardMaster[]>();
            rewardPack.rewards.forEach((r) => { const arr = rewardsByChar.get(r.characterId) || []; arr.push(r); rewardsByChar.set(r.characterId, arr); });
            const scoreBy = new Map<number, number>(); challengeSoloResults.forEach((x) => scoreBy.set(x.characterId, x.highScore || 0));
            const rankBy = new Map<number, number>(); challengeSoloStages.forEach((x) => rankBy.set(x.characterId, Math.max(rankBy.get(x.characterId) || 0, x.rank || 0)));
            const scopedBoxes = rewardPack.boxes.filter((b) => (b.resourceBoxPurpose || "") === "challenge_live_high_score");
            const boxMap = new Map<number, BoxMaster>(); (scopedBoxes.length ? scopedBoxes : rewardPack.boxes).forEach((b) => boxMap.set(b.id, b));

            const next: Row[] = [];
            for (let cid = 1; cid <= 26; cid += 1) {
                const done = completed.get(cid) || new Set<number>();
                let jewel = 0; let frag = 0;
                (rewardsByChar.get(cid) || []).forEach((r) => {
                    if (done.has(r.id)) return;
                    const am = collectBox(boxMap, r.resourceBoxId); jewel += am.jewel; frag += am.frag;
                });
                next.push({ characterId: cid, rank: rankBy.get(cid) || 0, score: scoreBy.get(cid) || 0, remainJewel: jewel, remainFragment: frag });
            }
            setRows(next);
        } catch {
            setError("挑战详情加载失败，请稍后重试");
        } finally {
            setLoading(false);
        }
    }, [loading, rows, server, serverSource, challengeHighScoreRewards, challengeSoloResults, challengeSoloStages]);

    const openDetail = useCallback(() => {
        if (view !== "challenge") return;
        setShowDetail(true);
        if (!rows && !loading) void loadDetail();
    }, [view, rows, loading, loadDetail]);

    const groupedRows = useMemo(() => {
        if (!rows) return [];
        const map = new Map(rows.map((r) => [r.characterId, r]));
        return GROUPS.map((g) => ({ ...g, rows: g.ids.map((id) => map.get(id)).filter((x): x is Row => Boolean(x)) }));
    }, [rows]);

    return (
        <div id="profile-character-related" className="scroll-mt-20 glass-card p-5 sm:p-6 rounded-2xl mb-6">
            <div className="mb-4">
                <h2 className="text-lg font-bold text-primary-text flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-miku rounded-full"></span>
                    角色等级相关
                </h2>
            </div>

            <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setView("character")} className={"px-4 py-1.5 rounded-full border-2 text-sm font-bold transition-all " + (view === "character" ? "bg-white text-slate-700 border-[#8b8b8b]" : "bg-[#dfe4e8] text-slate-500 border-[#dfe4e8]")}>角色等级</button>
                <button onClick={() => setView("challenge")} className={"px-4 py-1.5 rounded-full border-2 text-sm font-bold transition-all " + (view === "challenge" ? "bg-white text-slate-700 border-[#8b8b8b]" : "bg-[#dfe4e8] text-slate-500 border-[#dfe4e8]")}>挑战舞台等级</button>
            </div>

            <p className="text-xs text-slate-400 mb-3">{uploadTime ? `数据更新于 ${new Date(uploadTime * 1000).toISOString().replace("T", " ").slice(0, 19)}` : "上传时间未知"}</p>
            {view === "challenge" && <p className="mb-4 text-xs italic text-slate-500">点击雷达图可查看挑战信息详情</p>}

            <div className="mb-5 overflow-x-auto snap-x snap-mandatory">
                <div className="flex gap-3 min-w-max pb-1">
                    {(["overview", "ln", "mmj", "vbs", "wxs", "n25", "vs"] as UnitKey[]).map((k) => {
                        const u = UNIT_CONFIG[k]; const active = unit === k;
                        return (
                            <button
                                key={k}
                                onClick={() => setUnit(k)}
                                className="p-1.5 rounded-xl border-2 shrink-0 snap-start flex items-center justify-center transition-all bg-[#dfe4e8]"
                                style={{ color: active ? u.color : "#7b7b7b", borderColor: active ? u.color : "#dfe4e8" }}
                                title={u.label}
                            >
                                <div className="w-8 h-8 relative flex items-center justify-center">
                                    {k === "overview"
                                        ? <span className="text-[12px] font-black leading-tight">总览</span>
                                        : <img src={u.icon} alt={u.label} className="w-8 h-8 object-contain" loading="lazy" />}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="relative h-[340px] sm:h-[620px]">
                <ReactECharts ref={chartRef} option={option} style={{ width: "100%", height: "100%", cursor: view === "challenge" ? "pointer" : "default" }} opts={{ renderer: "svg" }} onChartReady={refreshOverlay} onEvents={{ finished: refreshOverlay, click: openDetail }} />
                <svg className="absolute inset-0 pointer-events-none" width={size.width} height={size.height}>
                    {points.map((p, i) => (
                        <g key={i}>
                            <circle cx={p.x} cy={p.y} r={mobile ? 2.5 : 4.5} fill={p.color} stroke="#fff" strokeWidth={2} />
                            <text x={p.lx} y={p.ly} fill="#4b5563" fontSize={mobile ? (unit === "overview" ? 10 : 11) : (unit === "overview" ? 12 : 13)} fontWeight={700} textAnchor="middle" dominantBaseline="middle">{p.value}</text>
                        </g>
                    ))}
                </svg>
            </div>

            {showDetail && (
                <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-20 pb-8 sm:pt-24 sm:pb-10 sm:p-4 bg-black/40">
                    <div className="relative w-[92vw] sm:w-full max-w-5xl max-h-[calc(100dvh-7rem)] sm:max-h-[calc(100dvh-8.5rem)] rounded-2xl bg-[#eef2f5] border border-slate-200 shadow-2xl overflow-hidden">
                        <button
                            onClick={() => setShowDetail(false)}
                            className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-300 text-slate-700 text-lg leading-none shadow-sm"
                            aria-label="关闭"
                        >
                            ×
                        </button>
                        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 bg-[#eef2f5]">
                            <h3 className="text-base sm:text-lg font-bold text-slate-700">挑战信息详情</h3>
                        </div>
                        <div className="p-3 sm:p-4 overflow-auto max-h-[calc(100dvh-7rem-56px)] sm:max-h-[calc(100dvh-8.5rem-56px)]">
                            {loading && <div className="text-sm text-slate-500 py-8 text-center">正在加载挑战详情...</div>}
                            {error && <div className="text-sm text-red-500 py-8 text-center">{error}</div>}
                            {!loading && !error && groupedRows.length > 0 && (
                                <div>
                                    {mobile ? (
                                        <div className="space-y-4">
                                            {groupedRows.map((g) => (
                                                <div key={g.key} className="space-y-2">
                                                    <div className="flex items-center gap-2 px-1 py-1 text-xs font-bold text-slate-600">{g.icon && <img src={g.icon} alt={g.name} className="w-4 h-4 object-contain" />}<span>{unitNames.get(g.unit) || g.name}</span></div>
                                                    {g.rows.map((r) => {
                                                        const prog = Math.max(0, Math.min((r.score / scoreCap(server)) * 100, 100));
                                                        const cname = charNames.get(r.characterId) || CHAR_NAMES[r.characterId] || `ID ${r.characterId}`;
                                                        return (
                                                            <div key={r.characterId} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-slate-200"><Image src={getCharacterIconUrl(r.characterId)} alt={cname} fill className="object-cover" unoptimized /></div>
                                                                        <span className="text-sm font-semibold text-slate-700 truncate">{cname}</span>
                                                                    </div>
                                                                    <div className="text-xs font-bold text-slate-600">Lv {r.rank}</div>
                                                                </div>
                                                                <div className="text-sm font-bold text-slate-700">最高分 {r.score.toLocaleString()}</div>
                                                                <div className="h-3 rounded-full bg-slate-500/75 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prog}%`, backgroundColor: themeColor }} /></div>
                                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                                    <div className="rounded-lg bg-slate-50 px-2 py-1 text-slate-600">水晶 <span className="font-bold text-slate-700">{r.remainJewel}</span></div>
                                                                    <div className="rounded-lg bg-slate-50 px-2 py-1 text-slate-600">碎片 <span className="font-bold text-slate-700">{r.remainFragment}</span></div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="min-w-[840px]">
                                            <div className="grid grid-cols-[170px_70px_130px_minmax(240px,1fr)_90px_110px] items-center gap-3 px-4 py-2 text-sm font-bold text-slate-600">
                                                <div className="text-left">角色</div>
                                                <div className="text-center">等级</div>
                                                <div className="text-center">最高分</div>
                                                <div className="text-center">{`进度（上限${server === "jp" ? "300w分" : "250w分"}）`}</div>
                                                <div className="text-center">剩余水晶</div>
                                                <div className="text-center">剩余心愿碎片</div>
                                            </div>
                                            <div className="space-y-4">
                                                {groupedRows.map((g) => (
                                                    <div key={g.key} className="space-y-2">
                                                        <div className="flex items-center gap-2 px-3 py-1 text-xs font-bold text-slate-600">{g.icon && <img src={g.icon} alt={g.name} className="w-4 h-4 object-contain" />}<span>{unitNames.get(g.unit) || g.name}</span></div>
                                                        <div className="space-y-2">
                                                            {g.rows.map((r) => {
                                                                const prog = Math.max(0, Math.min((r.score / scoreCap(server)) * 100, 100));
                                                                const cname = charNames.get(r.characterId) || CHAR_NAMES[r.characterId] || `ID ${r.characterId}`;
                                                                return (
                                                                    <div key={r.characterId} className="grid grid-cols-[170px_70px_130px_minmax(240px,1fr)_90px_110px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2">
                                                                        <div className="flex items-center gap-2 min-w-0"><div className="relative w-9 h-9 rounded-full overflow-hidden border border-slate-200"><Image src={getCharacterIconUrl(r.characterId)} alt={cname} fill className="object-cover" unoptimized /></div><span className="text-sm font-semibold text-slate-700 truncate">{cname}</span></div>
                                                                        <div className="text-sm font-bold text-slate-700 text-center">{r.rank}</div>
                                                                        <div className="text-sm font-bold text-slate-700 text-center">{r.score.toLocaleString()}</div>
                                                                        <div className="h-4 rounded-full bg-slate-500/75 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prog}%`, backgroundColor: themeColor }} /></div>
                                                                        <div className="text-sm font-bold text-slate-700 text-center">{r.remainJewel}</div>
                                                                        <div className="text-sm font-bold text-slate-700 text-center">{r.remainFragment}</div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
