"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CHAR_NAMES, CHARACTER_NAMES, type CardAttribute } from "@/types/types";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { getCharacterIconUrl } from "@/lib/assets";
import type {
    ServerType,
    UserArea,
    UserCharacter,
    UserMysekaiFixtureGameCharacterPerformanceBonus,
    UserMysekaiGate,
} from "@/lib/account";

interface Props {
    server: ServerType;
    userAreas: UserArea[];
    userCharacters: UserCharacter[];
    userMysekaiFixtureGameCharacterPerformanceBonuses: UserMysekaiFixtureGameCharacterPerformanceBonus[];
    userMysekaiGates: UserMysekaiGate[];
}

interface AreaItemLevelMaster {
    areaItemId: number;
    level: number;
    targetUnit: string;
    targetCardAttr: string;
    targetGameCharacterId?: number;
    power1BonusRate: number;
}

interface CharacterRankMaster {
    characterId: number;
    characterRank: number;
    power1BonusRate: number;
}

interface GateLevelMaster {
    mysekaiGateId: number;
    level: number;
    powerBonusRate: number;
}

interface GameCharacterMaster {
    id: number;
    firstName?: string;
    givenName?: string;
}

interface UnitProfileMaster {
    unit: string;
    unitName: string;
}

interface CharaBonus {
    areaItem: number;
    rank: number;
    fixture: number;
    total: number;
}

interface UnitBonus {
    areaItem: number;
    gate: number;
    total: number;
}

interface AttrBonus {
    areaItem: number;
    total: number;
}

const UNIT_ORDER = ["light_sound", "idol", "street", "theme_park", "school_refusal", "piapro"] as const;
const ATTR_ORDER: CardAttribute[] = ["cool", "cute", "happy", "mysterious", "pure"];
const ATTR_ICON_FILES: Record<CardAttribute, string> = {
    cool: "Cool.webp",
    cute: "cute.webp",
    happy: "Happy.webp",
    mysterious: "Mysterious.webp",
    pure: "Pure.webp",
};

const UNIT_LABEL_FALLBACK: Record<(typeof UNIT_ORDER)[number], string> = {
    light_sound: "Leo/need",
    idol: "MMJ",
    street: "VBS",
    theme_park: "WxS",
    school_refusal: "25时",
    piapro: "VS",
};

const UNIT_ICON: Record<(typeof UNIT_ORDER)[number], string> = {
    light_sound: "/data/icon/ln.webp",
    idol: "/data/icon/mmj.webp",
    street: "/data/icon/vbs.webp",
    theme_park: "/data/icon/wxs.webp",
    school_refusal: "/data/icon/n25.webp",
    piapro: "/data/icon/vs.webp",
};

const UNIT_CHARS: Record<(typeof UNIT_ORDER)[number], number[]> = {
    light_sound: [1, 2, 3, 4],
    idol: [5, 6, 7, 8],
    street: [9, 10, 11, 12],
    theme_park: [13, 14, 15, 16],
    school_refusal: [17, 18, 19, 20],
    piapro: [21, 22, 23, 24, 25, 26],
};

function fmt(v: number): string {
    return `${v.toFixed(1)}%`;
}

export default function PowerBonusDetail({
    server,
    userAreas,
    userCharacters,
    userMysekaiFixtureGameCharacterPerformanceBonuses,
    userMysekaiGates,
}: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [areaItemLevels, setAreaItemLevels] = useState<AreaItemLevelMaster[]>([]);
    const [characterRanks, setCharacterRanks] = useState<CharacterRankMaster[]>([]);
    const [gateLevels, setGateLevels] = useState<GateLevelMaster[]>([]);
    const [characterNameMap, setCharacterNameMap] = useState<Map<number, string>>(new Map());
    const [unitNameMap, setUnitNameMap] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [a, c, g, chars, unitProfiles] = await Promise.all([
                    fetchMasterDataForServer<AreaItemLevelMaster[]>(server, "areaItemLevels.json"),
                    fetchMasterDataForServer<CharacterRankMaster[]>(server, "characterRanks.json"),
                    fetchMasterDataForServer<GateLevelMaster[]>(server, "mysekaiGateLevels.json"),
                    fetchMasterDataForServer<GameCharacterMaster[]>(server, "gameCharacters.json"),
                    fetchMasterDataForServer<UnitProfileMaster[]>(server, "unitProfiles.json"),
                ]);
                if (cancelled) return;
                setAreaItemLevels(a);
                setCharacterRanks(c);
                setGateLevels(g);

                const charMap = new Map<number, string>();
                chars.forEach((ch) => {
                    const full = `${ch.firstName || ""}${ch.givenName || ""}`.trim();
                    if (full) charMap.set(ch.id, full);
                });
                setCharacterNameMap(charMap);

                const uMap = new Map<string, string>();
                unitProfiles.forEach((u) => {
                    if (u.unit && u.unitName) uMap.set(u.unit, u.unitName);
                });
                setUnitNameMap(uMap);
            } catch {
                if (!cancelled) setError("加成主数据加载失败，请稍后重试");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [server]);

    const areaItemBonusAtCurrentLv = useMemo(() => {
        const byItem = new Map<number, Map<number, AreaItemLevelMaster>>();
        areaItemLevels.forEach((x) => {
            const m = byItem.get(x.areaItemId) || new Map<number, AreaItemLevelMaster>();
            m.set(x.level, x);
            byItem.set(x.areaItemId, m);
        });

        const rows: AreaItemLevelMaster[] = [];
        userAreas.forEach((area) => {
            area.areaItems.forEach((item) => {
                const row = byItem.get(item.areaItemId)?.get(item.level);
                if (row) rows.push(row);
            });
        });
        return rows;
    }, [areaItemLevels, userAreas]);

    const bonus = useMemo(() => {
        const chara = new Map<number, CharaBonus>();
        for (let i = 1; i <= 26; i += 1) {
            chara.set(i, { areaItem: 0, rank: 0, fixture: 0, total: 0 });
        }

        const unit = new Map<(typeof UNIT_ORDER)[number], UnitBonus>();
        UNIT_ORDER.forEach((u) => unit.set(u, { areaItem: 0, gate: 0, total: 0 }));

        const attr = new Map<CardAttribute, AttrBonus>();
        ATTR_ORDER.forEach((a) => attr.set(a, { areaItem: 0, total: 0 }));

        areaItemBonusAtCurrentLv.forEach((item) => {
            const cid = item.targetGameCharacterId;
            if (typeof cid === "number" && cid >= 1 && cid <= 26) {
                const b = chara.get(cid)!;
                b.areaItem += item.power1BonusRate || 0;
            }

            const unitKey = item.targetUnit as (typeof UNIT_ORDER)[number];
            if (UNIT_ORDER.includes(unitKey)) {
                const b = unit.get(unitKey)!;
                b.areaItem += item.power1BonusRate || 0;
            }

            const attrKey = item.targetCardAttr as CardAttribute;
            if (ATTR_ORDER.includes(attrKey)) {
                const b = attr.get(attrKey)!;
                b.areaItem += item.power1BonusRate || 0;
            }
        });

        const rankByChar = new Map<string, CharacterRankMaster>();
        characterRanks.forEach((r) => rankByChar.set(`${r.characterId}-${r.characterRank}`, r));
        userCharacters.forEach((c) => {
            const r = rankByChar.get(`${c.characterId}-${c.characterRank}`);
            if (!r) return;
            const b = chara.get(c.characterId);
            if (!b) return;
            b.rank += r.power1BonusRate || 0;
        });

        userMysekaiFixtureGameCharacterPerformanceBonuses.forEach((f) => {
            const b = chara.get(f.gameCharacterId);
            if (!b) return;
            b.fixture += (f.totalBonusRate || 0) * 0.1;
        });

        const gateByKey = new Map<string, GateLevelMaster>();
        gateLevels.forEach((g) => gateByKey.set(`${g.mysekaiGateId}-${g.level}`, g));
        let maxGateBonus = 0;
        userMysekaiGates.forEach((g) => {
            const lv = gateByKey.get(`${g.mysekaiGateId}-${g.mysekaiGateLevel}`);
            if (!lv) return;
            const gateBonus = lv.powerBonusRate || 0;
            maxGateBonus = Math.max(maxGateBonus, gateBonus);
            const idx = g.mysekaiGateId - 1;
            if (idx >= 0 && idx < 5) {
                const key = UNIT_ORDER[idx];
                const b = unit.get(key)!;
                b.gate += gateBonus;
            }
        });
        unit.get("piapro")!.gate += maxGateBonus;

        chara.forEach((b) => {
            b.total = b.areaItem + b.rank + b.fixture;
        });
        unit.forEach((b) => {
            b.total = b.areaItem + b.gate;
        });
        attr.forEach((b) => {
            b.total = b.areaItem;
        });

        return { chara, unit, attr };
    }, [areaItemBonusAtCurrentLv, characterRanks, gateLevels, userCharacters, userMysekaiFixtureGameCharacterPerformanceBonuses, userMysekaiGates]);

    const grouped = useMemo(() => {
        return UNIT_ORDER.map((unitKey) => ({
            unitKey,
            unitBonus: bonus.unit.get(unitKey)!,
            chars: UNIT_CHARS[unitKey].map((cid) => ({
                cid,
                bonus: bonus.chara.get(cid)!,
            })),
        }));
    }, [bonus]);

    return (
        <div id="profile-power-bonus" className="scroll-mt-20 glass-card p-5 sm:p-6 rounded-2xl mb-6">
            <div className="mb-4">
                <h2 className="text-lg font-bold text-primary-text flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-indigo-400 rounded-full"></span>
                    加成信息
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                    角色加成 = 区域道具 + 角色等级 + MySekai家具；组合加成 = 区域道具 + MySekai门；属性加成 = 区域道具
                </p>
            </div>

            {loading && <div className="py-8 text-center text-sm text-slate-500">正在加载加成信息...</div>}
            {!loading && error && <div className="py-8 text-center text-sm text-red-500">{error}</div>}

            {!loading && !error && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-sm font-bold text-slate-700 mb-3">团体与角色加成</div>
                        <div className="space-y-4">
                            {grouped.map((g) => (
                                <div key={g.unitKey} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                                    <div className="flex items-center gap-2 mb-2.5">
                                        <div className="relative w-7 h-7">
                                            <Image src={UNIT_ICON[g.unitKey]} alt={unitNameMap.get(g.unitKey) || UNIT_LABEL_FALLBACK[g.unitKey]} fill className="object-contain" unoptimized />
                                        </div>
                                        <div className="text-sm font-bold text-slate-700">{unitNameMap.get(g.unitKey) || UNIT_LABEL_FALLBACK[g.unitKey]}</div>
                                        <div className="text-sm font-black text-slate-800">{fmt(g.unitBonus.total)}</div>
                                        <div className="text-[11px] text-slate-500">
                                            区域道具 {fmt(g.unitBonus.areaItem)} + MySekai门 {fmt(g.unitBonus.gate)}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {g.chars.map(({ cid, bonus: b }) => (
                                            <div key={cid} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="relative w-7 h-7 rounded-full overflow-hidden bg-slate-100">
                                                        <Image src={getCharacterIconUrl(cid)} alt={CHARACTER_NAMES[cid]} fill className="object-cover" unoptimized />
                                                    </div>
                                                    <div className="text-sm font-black text-slate-800">{fmt(b.total)}</div>
                                                    <div className="text-[11px] text-slate-500 truncate">{characterNameMap.get(cid) || CHAR_NAMES[cid] || CHARACTER_NAMES[cid]}</div>
                                                </div>
                                                <div className="text-[11px] text-slate-500 mt-1">
                                                    区域道具 {fmt(b.areaItem)} + 角色等级 {fmt(b.rank)} + MySekai玩偶 {fmt(b.fixture)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-sm font-bold text-slate-700 mb-3">属性加成</div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {ATTR_ORDER.map((a) => {
                                const b = bonus.attr.get(a)!;
                                return (
                                    <div key={a} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 flex items-center gap-2">
                                        <div className="relative w-6 h-6">
                                            <Image src={`/data/icon/${ATTR_ICON_FILES[a]}`} alt={a} fill className="object-contain" unoptimized />
                                        </div>
                                        <div className="text-sm font-black text-slate-800">{fmt(b.total)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
