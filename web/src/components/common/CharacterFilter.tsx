"use client";
import React from "react";
import Image from "next/image";
import { FilterSection } from "@/components/common/BaseFilters";
import { CHARACTER_NAMES, UNIT_DATA } from "@/types/types";
import { getCharacterIconUrl } from "@/lib/assets";

const UNIT_ICONS: Record<string, string> = {
    "ln": "ln.webp",
    "mmj": "mmj.webp",
    "vbs": "vbs.webp",
    "ws": "wxs.webp",
    "25ji": "n25.webp",
    "vs": "vs.webp",
};

interface CharacterFilterProps {
    selectedCharacters: number[];
    onCharacterChange: (chars: number[]) => void;
    selectedUnitIds: string[];
    onUnitIdsChange: (units: string[]) => void;
    /** Label for the unit section, defaults to "团体" */
    unitLabel?: string;
    /** Label for the character section, defaults to "角色" */
    characterLabel?: string;
}

export default function CharacterFilter({
    selectedCharacters,
    onCharacterChange,
    selectedUnitIds,
    onUnitIdsChange,
    unitLabel = "团体",
    characterLabel = "角色",
}: CharacterFilterProps) {
    const toggleCharacter = (id: number) => {
        if (selectedCharacters.includes(id)) {
            onCharacterChange(selectedCharacters.filter(c => c !== id));
        } else {
            onCharacterChange([...selectedCharacters, id]);
        }
    };

    const handleUnitClick = (unitId: string) => {
        const unit = UNIT_DATA.find(u => u.id === unitId);
        if (!unit) return;

        if (selectedUnitIds.includes(unitId)) {
            // Remove this unit and its characters
            onUnitIdsChange(selectedUnitIds.filter(id => id !== unitId));
            const newChars = selectedCharacters.filter(c => !unit.charIds.includes(c));
            onCharacterChange(newChars);
        } else {
            // Add this unit and its characters
            onUnitIdsChange([...selectedUnitIds, unitId]);
            const newChars = [...new Set([...selectedCharacters, ...unit.charIds])];
            onCharacterChange(newChars);
        }
    };

    const currentUnits = selectedUnitIds.length > 0
        ? UNIT_DATA.filter(u => selectedUnitIds.includes(u.id))
        : [];

    return (
        <>
            {/* Unit Selection */}
            <FilterSection label={unitLabel}>
                <div className="flex flex-wrap gap-2">
                    {UNIT_DATA.map(unit => {
                        const iconName = UNIT_ICONS[unit.id] || "";
                        return (
                            <button
                                key={unit.id}
                                onClick={() => handleUnitClick(unit.id)}
                                className={`p-1.5 rounded-xl transition-all ${selectedUnitIds.includes(unit.id)
                                    ? "ring-2 ring-miku shadow-lg bg-white"
                                    : "hover:bg-slate-100 border border-transparent bg-slate-50"
                                    }`}
                                title={unit.name}
                            >
                                <div className="w-8 h-8 relative">
                                    <Image
                                        src={`/data/icon/${iconName}`}
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
            </FilterSection>

            {/* Character Selection */}
            {(currentUnits.length > 0 || selectedCharacters.length > 0) && (
                <FilterSection label={characterLabel}>
                    <div className="flex flex-wrap gap-2">
                        {(currentUnits.length > 0
                            ? currentUnits.flatMap(u => u.charIds)
                            : [...new Set(selectedCharacters)]
                        ).map(charId => (
                            <button
                                key={charId}
                                onClick={() => toggleCharacter(charId)}
                                className={`relative transition-all ${selectedCharacters.includes(charId)
                                    ? "ring-2 ring-miku scale-110 z-10 rounded-full"
                                    : "ring-2 ring-transparent hover:ring-slate-200 rounded-full opacity-80 hover:opacity-100"
                                    }`}
                                title={CHARACTER_NAMES[charId]}
                            >
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100">
                                    <Image
                                        src={getCharacterIconUrl(charId)}
                                        alt={CHARACTER_NAMES[charId]}
                                        width={40}
                                        height={40}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                    />
                                </div>
                            </button>
                        ))}
                    </div>
                </FilterSection>
            )}
        </>
    );
}
