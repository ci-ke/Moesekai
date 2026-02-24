"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { searchableNavItems, SEARCH_GROUP_LABELS, SEARCH_GROUP_ROUTES } from "@/lib/navigation";
import { CHARACTER_NAMES } from "@/types/types";

// Dynamic search index item from search-index.json
interface SearchIndexItem {
    id: number;
    n: string;   // name (JP)
    cn?: string;  // name (CN translation)
    g: string;    // group: cards, music, events, gacha
    c?: number;   // characterId (cards only)
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
}

// Max dynamic results per group
const MAX_DYNAMIC_PER_GROUP = 8;

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
    const [mounted, setMounted] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Dynamic search index state (loaded once per session)
    const [searchIndex, setSearchIndex] = useState<SearchIndexItem[] | null>(null);
    const [isLoadingIndex, setIsLoadingIndex] = useState(false);
    const indexLoadedRef = useRef(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Load search index on first open
    useEffect(() => {
        if (isOpen && !indexLoadedRef.current && !isLoadingIndex) {
            indexLoadedRef.current = true;
            setIsLoadingIndex(true);
            fetch("/data/search-index.json")
                .then((res) => res.json())
                .then((data: SearchIndexItem[]) => {
                    setSearchIndex(data);
                    setIsLoadingIndex(false);
                })
                .catch((err) => {
                    console.warn("Failed to load search index:", err);
                    setIsLoadingIndex(false);
                });
        }
    }, [isOpen, isLoadingIndex]);

    // Filter items based on query
    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        if (!q) return searchableNavItems;
        return searchableNavItems.filter(
            (item) =>
                item.name.toLowerCase().includes(q) ||
                item.href.toLowerCase().includes(q) ||
                item.group.toLowerCase().includes(q) ||
                item.keywords.some((kw) => kw.toLowerCase().includes(q))
        );
    }, [query]);

    // Filter dynamic search index items based on query
    const dynamicFiltered = useMemo(() => {
        const q = query.toLowerCase().trim();
        if (!q || !searchIndex) return [];

        const matched = searchIndex.filter((item) => {
            const idStr = item.id.toString();
            if (idStr === q) return true; // Exact ID match
            if (item.n.toLowerCase().includes(q)) return true;
            if (item.cn && item.cn.toLowerCase().includes(q)) return true;
            // For cards, also search by character name
            if (item.c) {
                const charName = CHARACTER_NAMES[item.c];
                if (charName && charName.toLowerCase().includes(q)) return true;
            }
            return false;
        });

        // Group and limit results
        const grouped: Record<string, SearchIndexItem[]> = {};
        for (const item of matched) {
            if (!grouped[item.g]) grouped[item.g] = [];
            if (grouped[item.g].length < MAX_DYNAMIC_PER_GROUP) {
                grouped[item.g].push(item);
            }
        }

        return Object.entries(grouped).flatMap(([, items]) => items);
    }, [query, searchIndex]);

    // Combined flat list for keyboard navigation
    const totalItems = filtered.length + dynamicFiltered.length;

    // Group filtered static items
    const grouped = useMemo(() => {
        const groups: { title: string; items: typeof filtered }[] = [];
        const groupMap = new Map<string, typeof filtered>();
        for (const item of filtered) {
            const existing = groupMap.get(item.group);
            if (existing) {
                existing.push(item);
            } else {
                const arr = [item];
                groupMap.set(item.group, arr);
                groups.push({ title: item.group, items: arr });
            }
        }
        return groups;
    }, [filtered]);

    // Group dynamic items
    const dynamicGrouped = useMemo(() => {
        const groups: { title: string; items: SearchIndexItem[] }[] = [];
        const groupMap = new Map<string, SearchIndexItem[]>();
        for (const item of dynamicFiltered) {
            const groupLabel = SEARCH_GROUP_LABELS[item.g] || item.g;
            const existing = groupMap.get(groupLabel);
            if (existing) {
                existing.push(item);
            } else {
                const arr = [item];
                groupMap.set(groupLabel, arr);
                groups.push({ title: groupLabel, items: arr });
            }
        }
        return groups;
    }, [dynamicFiltered]);

    // Reset state when opening/closing
    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setActiveIndex(0);
            // Focus input after animation starts
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [isOpen]);

    // Prevent body scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    // Reset active index when filtered results change
    useEffect(() => {
        setActiveIndex(0);
    }, [filtered, dynamicFiltered]);

    const navigate = useCallback(
        (href: string) => {
            router.push(href);
            onClose();
        },
        [router, onClose]
    );

    // Scroll active item into view
    useEffect(() => {
        if (!listRef.current) return;
        const activeEl = listRef.current.querySelector("[data-active='true']");
        if (activeEl) {
            activeEl.scrollIntoView({ block: "nearest" });
        }
    }, [activeIndex]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setActiveIndex((prev) => (prev + 1) % totalItems);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setActiveIndex((prev) => (prev - 1 + totalItems) % totalItems);
                    break;
                case "Enter":
                    e.preventDefault();
                    if (activeIndex < filtered.length) {
                        navigate(filtered[activeIndex].href);
                    } else {
                        const dynIdx = activeIndex - filtered.length;
                        if (dynamicFiltered[dynIdx]) {
                            const item = dynamicFiltered[dynIdx];
                            const route = SEARCH_GROUP_ROUTES[item.g] || `/${item.g}`;
                            navigate(`${route}/${item.id}`);
                        }
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    onClose();
                    break;
            }
        },
        [filtered, dynamicFiltered, activeIndex, navigate, onClose, totalItems]
    );

    // Flat index counter for rendering
    let flatIndex = -1;

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[min(20vh,8rem)] px-4">
                    {/* Backdrop */}
                    <motion.div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={onClose}
                    />

                    {/* Dialog */}
                    <motion.div
                        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden flex flex-col max-h-[70vh]"
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15 }}
                        onKeyDown={handleKeyDown}
                    >
                        {/* Search input */}
                        <div className="flex items-center gap-3 px-4 border-b border-slate-200">
                            <svg
                                className="w-5 h-5 text-slate-400 flex-shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                            </svg>
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="搜索页面、卡牌、歌曲、活动..."
                                className="flex-1 py-3.5 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
                            />
                            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-100 rounded border border-slate-200">
                                ESC
                            </kbd>
                        </div>

                        {/* Results */}
                        <div ref={listRef} className="overflow-y-auto flex-1 py-2">
                            {totalItems === 0 && !isLoadingIndex ? (
                                <div className="px-4 py-8 text-center text-sm text-slate-400">
                                    没有找到匹配的结果
                                </div>
                            ) : (
                                <>
                                    {/* Static navigation results */}
                                    {grouped.map((group) => (
                                        <div key={group.title}>
                                            <div className="px-4 pt-3 pb-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                {group.title}
                                            </div>
                                            {group.items.map((item) => {
                                                flatIndex++;
                                                const isActive = flatIndex === activeIndex;
                                                const idx = flatIndex;
                                                return (
                                                    <button
                                                        key={item.href}
                                                        data-active={isActive}
                                                        onClick={() => navigate(item.href)}
                                                        onMouseEnter={() => setActiveIndex(idx)}
                                                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer ${isActive
                                                                ? "bg-miku/10 text-miku"
                                                                : "text-slate-600 hover:bg-slate-50"
                                                            }`}
                                                    >
                                                        <span className="font-medium">{item.name}</span>
                                                        <span
                                                            className={`text-xs ${isActive ? "text-miku/60" : "text-slate-400"
                                                                }`}
                                                        >
                                                            {item.href}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}

                                    {/* Dynamic search results */}
                                    {dynamicGrouped.map((group) => (
                                        <div key={`dyn-${group.title}`}>
                                            <div className="px-4 pt-3 pb-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                {group.title}
                                            </div>
                                            {group.items.map((item) => {
                                                flatIndex++;
                                                const isActive = flatIndex === activeIndex;
                                                const idx = flatIndex;
                                                const route = SEARCH_GROUP_ROUTES[item.g] || `/${item.g}`;
                                                const href = `${route}/${item.id}`;
                                                // For cards, show character name
                                                const subtitle = item.c
                                                    ? CHARACTER_NAMES[item.c] || ""
                                                    : "";
                                                return (
                                                    <button
                                                        key={`${item.g}-${item.id}`}
                                                        data-active={isActive}
                                                        onClick={() => navigate(href)}
                                                        onMouseEnter={() => setActiveIndex(idx)}
                                                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer ${isActive
                                                                ? "bg-miku/10 text-miku"
                                                                : "text-slate-600 hover:bg-slate-50"
                                                            }`}
                                                    >
                                                        <span className="flex flex-col items-start min-w-0">
                                                            <span className="font-medium truncate max-w-[280px]">
                                                                {item.n}
                                                            </span>
                                                            {(item.cn || subtitle) && (
                                                                <span
                                                                    className={`text-xs truncate max-w-[280px] ${isActive ? "text-miku/50" : "text-slate-400"
                                                                        }`}
                                                                >
                                                                    {item.cn}
                                                                    {item.cn && subtitle ? " · " : ""}
                                                                    {subtitle}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span
                                                            className={`text-xs font-mono flex-shrink-0 ${isActive ? "text-miku/60" : "text-slate-400"
                                                                }`}
                                                        >
                                                            #{item.id}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}

                                    {/* Loading indicator for first load */}
                                    {isLoadingIndex && query && (
                                        <div className="px-4 py-3 text-center text-xs text-slate-400">
                                            正在加载数据索引...
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer hints */}
                        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">↑</kbd>
                                <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">↓</kbd>
                                导航
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">Enter</kbd>
                                跳转
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">Esc</kbd>
                                关闭
                            </span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
