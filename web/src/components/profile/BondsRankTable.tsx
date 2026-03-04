"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { CHARACTER_NAMES, UNIT_DATA } from "@/types/types";
import { getCharacterIconUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import type { UserBond, UserCharacter } from "@/lib/account";

interface BondsRankTableProps {
    userBonds: UserBond[];
    userCharacters: UserCharacter[];
}

interface BondRow {
    key: string;
    c1: number;
    c2: number;
    rank: number | null;
    exp: number | null;
}

const UNIT_ICONS: Record<string, string> = {
    ln: "ln.webp",
    mmj: "mmj.webp",
    vbs: "vbs.webp",
    ws: "wxs.webp",
    "25ji": "n25.webp",
    vs: "vs.webp",
};

const MAX_BOND_LEVEL = 75;
const TOPK = 25;

function extractPairFromGroupId(groupId: number): { c1: number; c2: number } {
    return {
        c1: Math.floor(groupId / 100) % 100,
        c2: groupId % 100,
    };
}

function normalizePair(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function pairKey(a: number, b: number): string {
    return `${a}-${b}`;
}

export default function BondsRankTable({ userBonds, userCharacters }: BondsRankTableProps) {
    const { themeColor } = useTheme();
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);

    const characterRankMap = useMemo(() => {
        const map = new Map<number, number>();
        userCharacters.forEach((item) => map.set(item.characterId, item.characterRank));
        return map;
    }, [userCharacters]);

    const bondsMap = useMemo(() => {
        const map = new Map<string, UserBond>();
        userBonds.forEach((item) => {
            const { c1, c2 } = extractPairFromGroupId(item.bondsGroupId);
            map.set(normalizePair(c1, c2), item);
        });
        return map;
    }, [userBonds]);

    const displayedCharacters = useMemo(() => {
        if (!selectedUnitId) {
            return UNIT_DATA.flatMap((u) => u.charIds);
        }
        const unit = UNIT_DATA.find((u) => u.id === selectedUnitId);
        return unit ? unit.charIds : [];
    }, [selectedUnitId]);

    const rows = useMemo((): BondRow[] => {
        if (selectedCharacterId !== null) {
            const selectedRows: BondRow[] = [];
            for (let other = 1; other <= 26; other += 1) {
                if (other === selectedCharacterId) continue;
                const bond = bondsMap.get(normalizePair(selectedCharacterId, other));
                selectedRows.push({
                    key: pairKey(selectedCharacterId, other),
                    c1: selectedCharacterId,
                    c2: other,
                    rank: bond?.rank ?? null,
                    exp: bond?.exp ?? null,
                });
            }
            return selectedRows;
        }

        const topRows = Array.from(bondsMap.entries())
            .map(([pair, bond]) => {
                const [x, y] = pair.split("-").map(Number);
                const xr = characterRankMap.get(x) || 0;
                const yr = characterRankMap.get(y) || 0;
                const c1 = xr >= yr ? x : y;
                const c2 = xr >= yr ? y : x;
                return {
                    key: pairKey(c1, c2),
                    c1,
                    c2,
                    rank: bond.rank,
                    exp: bond.exp,
                } satisfies BondRow;
            })
            .sort((a, b) => {
                const rankDiff = (b.rank || 0) - (a.rank || 0);
                if (rankDiff !== 0) return rankDiff;
                return (b.exp || 0) - (a.exp || 0);
            })
            .slice(0, TOPK);

        return topRows;
    }, [selectedCharacterId, bondsMap, characterRankMap]);

    return (
        <div id="profile-bonds-rank" className="scroll-mt-20 glass-card p-5 sm:p-6 rounded-2xl mb-6">
            <div className="mb-4">
                <h2 className="text-lg font-bold text-primary-text flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-pink-400 rounded-full"></span>
                    羁绊等级查询
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                    未选中角色时显示羁绊等级 Top {TOPK}；选中角色后显示其与其他角色的羁绊信息
                </p>
            </div>

            <div className="space-y-3 mb-4">
                <div className="flex flex-wrap gap-2">
                    {UNIT_DATA.map((unit) => {
                        const selected = selectedUnitId === unit.id;
                        return (
                            <button
                                key={unit.id}
                                onClick={() => setSelectedUnitId(selected ? null : unit.id)}
                                className={`p-1.5 rounded-xl transition-all ${selected
                                    ? "ring-2 ring-miku shadow-lg bg-white"
                                    : "hover:bg-slate-100 border border-transparent bg-slate-50"
                                    }`}
                                title={unit.name}
                            >
                                <div className="w-8 h-8 relative">
                                    <Image
                                        src={`/data/icon/${UNIT_ICONS[unit.id]}`}
                                        alt={unit.name}
                                        fill
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {displayedCharacters.map((characterId) => {
                        const selected = selectedCharacterId === characterId;
                        return (
                            <button
                                key={characterId}
                                onClick={() => setSelectedCharacterId(selected ? null : characterId)}
                                className={`relative transition-all ${selected
                                    ? "ring-2 ring-miku scale-110 z-10 rounded-full"
                                    : "ring-2 ring-transparent hover:ring-slate-200 rounded-full opacity-85 hover:opacity-100"
                                    }`}
                                title={CHARACTER_NAMES[characterId]}
                            >
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100">
                                    <Image
                                        src={getCharacterIconUrl(characterId)}
                                        alt={CHARACTER_NAMES[characterId]}
                                        width={40}
                                        height={40}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="sm:hidden space-y-2">
                {rows.map((row) => {
                    const c1Rank = characterRankMap.get(row.c1) || 0;
                    const c2Rank = characterRankMap.get(row.c2) || 0;
                    const progress = row.rank ? Math.max(0, Math.min((row.rank / MAX_BOND_LEVEL) * 100, 100)) : 0;
                    const expText = row.rank === null ? "-" : row.rank >= MAX_BOND_LEVEL ? "MAX" : String(row.exp || 0);

                    return (
                        <div
                            key={row.key}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 space-y-2"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex -space-x-2">
                                    <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white bg-slate-100">
                                        <Image
                                            src={getCharacterIconUrl(row.c1)}
                                            alt={CHARACTER_NAMES[row.c1]}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                    <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white bg-slate-100">
                                        <Image
                                            src={getCharacterIconUrl(row.c2)}
                                            alt={CHARACTER_NAMES[row.c2]}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                </div>
                                <div className="text-xs font-bold text-slate-700">
                                    角色等级 {c1Rank} &amp; {c2Rank}
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-600">羁绊等级</span>
                                <span className="font-bold text-slate-700">{row.rank ?? "-"}</span>
                            </div>

                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                    <span>进度(上限75级)</span>
                                    <span className="font-bold text-slate-700">升级经验 {expText}</span>
                                </div>
                                <div className="h-3 rounded-full bg-slate-500/75 overflow-hidden relative">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${progress}%`,
                                            backgroundColor: themeColor,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}

                {rows.length === 0 && (
                    <div className="text-center py-8 text-sm text-slate-400">
                        暂无羁绊数据
                    </div>
                )}
            </div>

            <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-[620px] space-y-2">
                    <div className="grid grid-cols-[92px_80px_72px_minmax(164px,1fr)_72px] items-center gap-1.5 px-2 py-2 text-sm font-bold text-slate-600">
                        <div className="text-left">角色</div>
                        <div className="text-center">角色等级</div>
                        <div className="text-center">羁绊等级</div>
                        <div className="text-center">进度(上限75级)</div>
                        <div className="text-center">升级经验</div>
                    </div>

                    {rows.map((row) => {
                        const c1Rank = characterRankMap.get(row.c1) || 0;
                        const c2Rank = characterRankMap.get(row.c2) || 0;
                        const progress = row.rank ? Math.max(0, Math.min((row.rank / MAX_BOND_LEVEL) * 100, 100)) : 0;
                        const expText = row.rank === null ? "-" : row.rank >= MAX_BOND_LEVEL ? "MAX" : String(row.exp || 0);

                        return (
                            <div
                                key={row.key}
                                className="grid grid-cols-[92px_80px_72px_minmax(164px,1fr)_72px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex -space-x-2">
                                        <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-white bg-slate-100">
                                            <Image
                                                src={getCharacterIconUrl(row.c1)}
                                                alt={CHARACTER_NAMES[row.c1]}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                        <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-white bg-slate-100">
                                            <Image
                                                src={getCharacterIconUrl(row.c2)}
                                                alt={CHARACTER_NAMES[row.c2]}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="text-sm font-bold text-slate-700 text-center">
                                    {c1Rank} &amp; {c2Rank}
                                </div>

                                <div className="text-sm font-bold text-slate-700 text-center">
                                    {row.rank ?? "-"}
                                </div>

                                <div>
                                    <div className="h-4 rounded-full bg-slate-500/75 overflow-hidden relative">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${progress}%`,
                                                backgroundColor: themeColor,
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="text-sm font-bold text-slate-700 text-center">
                                    {expText}
                                </div>
                            </div>
                        );
                    })}

                    {rows.length === 0 && (
                        <div className="text-center py-8 text-sm text-slate-400">
                            暂无羁绊数据
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
