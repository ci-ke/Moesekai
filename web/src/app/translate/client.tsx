"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import styles from "./translate.module.css";
import { markTranslationsUpdated } from "@/lib/translations";

// ============================================================================
// Types
// ============================================================================

interface FieldInfo {
    name: string;
    total: number;
    cnCount: number;
    humanCount: number;
    pinnedCount: number;
    llmCount: number;
    unknownCount: number;
}

interface CategoryInfo {
    name: string;
    fields: FieldInfo[];
}

interface TranslationEntry {
    key: string;
    text: string;
    source: string;
}

interface Toast {
    message: string;
    type: "success" | "error";
    id: number;
}

// ============================================================================
// API helpers
// ============================================================================

const getApiBase = () => {
    let url = process.env.NEXT_PUBLIC_API_URL || "";
    if (url && !url.startsWith("http")) {
        url = "http://" + url;
    }
    return url + "/api/translate";
};
const API_BASE = getApiBase();

function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("translate-token");
}

function setToken(token: string) {
    localStorage.setItem("translate-token", token);
}

function clearToken() {
    localStorage.removeItem("translate-token");
    localStorage.removeItem("translate-username");
}

function getUsername(): string {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("translate-username") || "";
}

function setUsername(username: string) {
    localStorage.setItem("translate-username", username);
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options?.headers,
        },
    });

    if (res.status === 401) {
        clearToken();
        window.location.reload();
        throw new Error("Unauthorized");
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
    }

    return res.json();
}

// ============================================================================
// Login Component
// ============================================================================

function LoginPage({ onLogin }: { onLogin: (username: string) => void }) {
    const [username, setUser] = useState("");
    const [password, setPass] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const data = await apiFetch<{ token: string; username: string }>(
                "/login",
                {
                    method: "POST",
                    body: JSON.stringify({ username, password }),
                }
            );
            setToken(data.token);
            setUsername(data.username);
            onLogin(data.username);
        } catch (err) {
            setError(err instanceof Error ? err.message : "登录失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles["login-container"]}>
            <form className={styles["login-card"]} onSubmit={handleSubmit}>
                <h1>翻译校对系统</h1>
                <p>Moesekai Translation Proofreading</p>
                {error && <div className={styles["login-error"]}>{error}</div>}
                <input
                    type="text"
                    placeholder="用户名"
                    value={username}
                    onChange={(e) => setUser(e.target.value)}
                    autoFocus
                />
                <input
                    type="password"
                    placeholder="密码"
                    value={password}
                    onChange={(e) => setPass(e.target.value)}
                />
                <button type="submit" disabled={loading || !username || !password}>
                    {loading ? "登录中..." : "登录"}
                </button>
            </form>
        </div>
    );
}

// ============================================================================
// Category Label Map (friendly names)
// ============================================================================

const CATEGORY_LABELS: Record<string, string> = {
    cards: "卡牌",
    events: "活动",
    music: "音乐",
    gacha: "卡池",
    virtualLive: "虚拟Live",
    sticker: "贴纸",
    comic: "漫画",
    mysekai: "我的世界",
    costumes: "服装",
    characters: "角色",
    units: "团体",
};

const FIELD_LABELS: Record<string, string> = {
    prefix: "卡面名称",
    skillName: "技能名",
    gachaPhrase: "抽卡台词",
    name: "名称",
    title: "标题",
    artist: "音乐人",
    vocalCaption: "歌手名",
    fixtureName: "家具名",
    flavorText: "描述文本",
    genre: "分类",
    tag: "标签",
    colorName: "配色名",
    designer: "设计师",
    hobby: "爱好",
    specialSkill: "特技",
    favoriteFood: "喜欢的食物",
    hatedFood: "讨厌的食物",
    weak: "弱点",
    introduction: "自我介绍",
    unitName: "团体名",
    profileSentence: "团体简介",
};

const SOURCE_LABELS: Record<string, string> = {
    cn: "官方",
    human: "人工",
    pinned: "锁定",
    llm: "AI",
    unknown: "未知",
};

// ============================================================================
// Memoized Row Component (performance fix)
// ============================================================================

interface RowProps {
    entry: TranslationEntry;
    isActive: boolean;
    onSelect: (key: string) => void;
}

const TranslationRow = memo(function TranslationRow({ entry, isActive, onSelect }: RowProps) {
    return (
        <tr
            className={`${styles["entry-row"]} ${isActive ? styles["row-active"] : ""}`}
            onClick={() => onSelect(entry.key)}
        >
            <td>
                <span className={`${styles["source-tag"]} ${styles[entry.source] || ""}`}>
                    {SOURCE_LABELS[entry.source] || entry.source}
                </span>
            </td>
            <td>
                <div className={styles["jp-text"]}>{entry.key}</div>
            </td>
            <td>
                <div className={styles["cn-text"]}>{entry.text}</div>
            </td>
        </tr>
    );
});

// ============================================================================
// Main Component
// ============================================================================

export default function TranslateClient() {
    // Auth state
    const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
    const [currentUser, setCurrentUser] = useState("");

    // Data state
    const [categories, setCategories] = useState<CategoryInfo[]>([]);
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedField, setSelectedField] = useState("");
    const [sourceFilter, setSourceFilter] = useState("");
    const [entries, setEntries] = useState<TranslationEntry[]>([]);
    const [loadingEntries, setLoadingEntries] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Edit state — selectedKey is the active entry in the proofreading panel
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [isEditingText, setIsEditingText] = useState(false); // true = user has started typing / clicked gray text
    const editRef = useRef<HTMLTextAreaElement>(null);

    // Push state
    const [pushing, setPushing] = useState(false);
    const [pushStatus, setPushStatus] = useState<{
        lastPush: string;
        lastError: string;
    } | null>(null);

    // Mobile sidebar
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Saving flag to prevent double-submit
    const savingRef = useRef(false);

    // Toast
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastId = useRef(0);

    const showToast = useCallback((message: string, type: "success" | "error") => {
        const id = ++toastId.current;
        setToasts((prev) => [...prev, { message, type, id }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    // ---- Memoized filtered entries (performance fix) ----
    const filteredEntries = useMemo(() => {
        return entries.filter((e) => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return e.key.toLowerCase().includes(q) || e.text.toLowerCase().includes(q);
        });
    }, [entries, searchQuery]);

    // ---- Current entry being edited ----
    const selectedEntry = useMemo(() => {
        if (!selectedKey) return null;
        return filteredEntries.find((e) => e.key === selectedKey) || null;
    }, [selectedKey, filteredEntries]);

    const selectedIndex = useMemo(() => {
        if (!selectedKey) return -1;
        return filteredEntries.findIndex((e) => e.key === selectedKey);
    }, [selectedKey, filteredEntries]);

    // ---- Auth check ----
    useEffect(() => {
        const token = getToken();
        if (token) {
            apiFetch<CategoryInfo[]>("/categories")
                .then((cats) => {
                    setCategories(cats);
                    setLoggedIn(true);
                    setCurrentUser(getUsername());
                })
                .catch(() => {
                    clearToken();
                    setLoggedIn(false);
                });
        } else {
            setLoggedIn(false);
        }
    }, []);

    // ---- Load entries when selection changes ----
    useEffect(() => {
        if (!selectedCategory || !selectedField || !loggedIn) return;

        setLoadingEntries(true);
        setSelectedKey(null);
        setIsEditingText(false);
        const params = new URLSearchParams({
            category: selectedCategory,
            field: selectedField,
        });
        if (sourceFilter) params.set("source", sourceFilter);

        apiFetch<TranslationEntry[]>(`/entries?${params}`)
            .then((data) => {
                const order: Record<string, number> = { unknown: 0, llm: 1, human: 2, pinned: 3, cn: 4 };
                data.sort((a, b) => (order[a.source] ?? 5) - (order[b.source] ?? 5));
                setEntries(data);
                // Auto-select first entry
                if (data.length > 0) {
                    setSelectedKey(data[0].key);
                    setEditValue(data[0].text);
                    setIsEditingText(false);
                }
            })
            .catch((err) => showToast(err.message, "error"))
            .finally(() => setLoadingEntries(false));
    }, [selectedCategory, selectedField, sourceFilter, loggedIn, showToast]);

    // ---- Fetch push status ----
    useEffect(() => {
        if (!loggedIn) return;
        const fetchStatus = () => {
            apiFetch<{ lastPush: string; lastError: string; pushing: boolean }>("/status")
                .then(setPushStatus)
                .catch(() => { });
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, [loggedIn]);

    // ---- Focus textarea when entry selected ----
    useEffect(() => {
        if (!selectedKey || !editRef.current) return;

        editRef.current.focus();

        // Select all text so typing overwrites immediately on a newly selected entry.
        requestAnimationFrame(() => {
            if (!editRef.current) return;
            const textLength = editRef.current.value.length;
            editRef.current.setSelectionRange(0, textLength);
        });
    }, [selectedKey]);

    // ---- Handlers ----

    const handleLogin = (username: string) => {
        setCurrentUser(username);
        setLoggedIn(true);
        apiFetch<CategoryInfo[]>("/categories")
            .then(setCategories)
            .catch((err) => showToast(err.message, "error"));
    };

    const handleLogout = () => {
        clearToken();
        setLoggedIn(false);
        setCurrentUser("");
    };

    const handleFieldSelect = (category: string, field: string) => {
        setSelectedCategory(category);
        setSelectedField(field);
        setSearchQuery("");
        setSidebarOpen(false); // close mobile sidebar
    };

    const selectEntry = useCallback((key: string) => {
        setSelectedKey(key);
        setIsEditingText(false);
        // Find entry and set edit value
        setEntries((prev) => {
            const entry = prev.find((e) => e.key === key);
            if (entry) {
                setEditValue(entry.text);
            }
            return prev; // no mutation
        });
    }, []);

    const handleSave = useCallback(async (overrideSource?: string) => {
        if (savingRef.current) return;
        // Read current state values at call time
        const key = selectedKey;
        if (!key || !selectedCategory || !selectedField) return;

        savingRef.current = true;
        const sourceToSave = overrideSource || "human";
        try {
            const result = await apiFetch<{ status: string }>("/entry", {
                method: "PUT",
                body: JSON.stringify({
                    category: selectedCategory,
                    field: selectedField,
                    key: key,
                    text: editValue,
                    source: sourceToSave,
                }),
            });

            // Update local state
            setEntries((prev) =>
                prev.map((e) =>
                    e.key === key ? { ...e, text: editValue, source: sourceToSave } : e
                )
            );

            if (result.status !== "noop") {
                markTranslationsUpdated();
                showToast("保存成功", "success");
            } else {
                showToast("内容未变化，已跳过写入", "success");
            }

            // Move to next entry
            const idx = filteredEntries.findIndex((e) => e.key === key);
            if (idx < filteredEntries.length - 1) {
                const next = filteredEntries[idx + 1];
                setSelectedKey(next.key);
                setEditValue(next.text);
                setIsEditingText(false);
            } else {
                // No more entries
                showToast("已到最后一条", "success");
            }
        } catch (err) {
            showToast(err instanceof Error ? err.message : "保存失败", "error");
        } finally {
            savingRef.current = false;
        }
    }, [selectedKey, selectedCategory, selectedField, editValue, filteredEntries, showToast]);

    // Change source type inline from the list (without editing text)
    const handleSourceChange = useCallback(async (key: string, newSource: string) => {
        if (!selectedCategory || !selectedField) return;

        // Find current entry data
        const entry = entries.find((e) => e.key === key);
        if (!entry) return;

        try {
            const result = await apiFetch<{ status: string }>("/entry", {
                method: "PUT",
                body: JSON.stringify({
                    category: selectedCategory,
                    field: selectedField,
                    key: key,
                    text: entry.text,
                    source: newSource,
                }),
            });

            // Update local state
            setEntries((prev) =>
                prev.map((e) =>
                    e.key === key ? { ...e, source: newSource } : e
                )
            );

            if (result.status !== "noop") {
                markTranslationsUpdated();
            }

            // Also update editSource if this is the currently selected entry
            // (Removed as source dropdown is removed from panel)

            showToast(`来源已更改为「${SOURCE_LABELS[newSource] || newSource}」`, "success");
        } catch (err) {
            showToast(err instanceof Error ? err.message : "修改失败", "error");
        }
    }, [selectedCategory, selectedField, entries, selectedKey, showToast]);

    const handlePush = async () => {
        setPushing(true);
        try {
            await apiFetch("/push", { method: "POST" });
            showToast("推送成功", "success");
            markTranslationsUpdated();
            const status = await apiFetch<{ lastPush: string; lastError: string; pushing: boolean }>("/status");
            setPushStatus(status);
        } catch (err) {
            showToast(err instanceof Error ? err.message : "推送失败", "error");
        } finally {
            setPushing(false);
        }
    };

    // Navigate to prev/next entry
    const navigateEntry = useCallback((direction: 1 | -1) => {
        if (selectedIndex < 0) return;
        const newIdx = selectedIndex + direction;
        if (newIdx >= 0 && newIdx < filteredEntries.length) {
            const next = filteredEntries[newIdx];
            setSelectedKey(next.key);
            setEditValue(next.text);
            setIsEditingText(false);

            // Scroll the row into view
            const row = document.querySelector(`[data-entry-key="${CSS.escape(next.key)}"]`);
            row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }, [selectedIndex, filteredEntries]);

    // ---- Textarea key handler ----
    const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            setSelectedKey(null);
            setIsEditingText(false);
        }
        // Ctrl+ArrowUp / Ctrl+ArrowDown to navigate
        if (e.ctrlKey && e.key === "ArrowUp") {
            e.preventDefault();
            navigateEntry(-1);
        }
        if (e.ctrlKey && e.key === "ArrowDown") {
            e.preventDefault();
            navigateEntry(1);
        }
    }, [handleSave, navigateEntry]);

    // Handle textarea change — activate editing mode on first input
    const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (!isEditingText) {
            setIsEditingText(true);
        }
        setEditValue(e.target.value);
    }, [isEditingText]);

    // Click on gray text to activate editing
    const handleTextareaClick = useCallback(() => {
        if (!isEditingText) {
            setIsEditingText(true);
        }
    }, [isEditingText]);

    // ---- Global keyboard shortcuts ----
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't intercept when typing in search or login
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
            // Don't intercept textarea events (handled separately)
            if (target.tagName === "TEXTAREA") return;

            // Ctrl+S: save current edit
            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
                if (selectedKey) {
                    handleSave();
                }
            }
            // Arrow keys to navigate when not editing
            if (e.key === "ArrowDown" || e.key === "j") {
                e.preventDefault();
                navigateEntry(1);
            }
            if (e.key === "ArrowUp" || e.key === "k") {
                e.preventDefault();
                navigateEntry(-1);
            }
            // Enter to focus the textarea
            if (e.key === "Enter" && selectedKey) {
                e.preventDefault();
                editRef.current?.focus();
            }
            // Escape to deselect
            if (e.key === "Escape") {
                setSelectedKey(null);
                setIsEditingText(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedKey, handleSave, navigateEntry]);

    // ---- Render ----

    if (loggedIn === null) {
        return (
            <div className={styles["translate-page"]}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    验证身份中...
                </div>
            </div>
        );
    }

    if (!loggedIn) {
        return (
            <div className={styles["translate-page"]}>
                <LoginPage onLogin={handleLogin} />
            </div>
        );
    }

    const currentFieldInfo = categories
        .find((c) => c.name === selectedCategory)
        ?.fields?.find((f) => f.name === selectedField);

    // Determine if the edit text should show as gray (preview mode)
    const isGrayText = !isEditingText;

    return (
        <div className={styles["translate-page"]}>
            {/* Mobile header */}
            <div className={styles["mobile-header"]}>
                <button
                    className={styles["hamburger-btn"]}
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    aria-label="菜单"
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
                <h2>翻译校对</h2>
                <span className={styles["mobile-user"]}>{currentUser}</span>
            </div>

            <div className={styles["translate-layout"]}>
                {/* ---- Sidebar ---- */}
                {sidebarOpen && (
                    <div
                        className={styles["sidebar-overlay"]}
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
                <aside className={`${styles["translate-sidebar"]} ${sidebarOpen ? styles["sidebar-open"] : ""}`}>
                    <div className={styles["sidebar-header"]}>
                        <h2>翻译校对</h2>
                        <span className={styles["sidebar-user"]}>{currentUser}</span>
                    </div>

                    {/* Source Filter */}
                    <div className={styles["sidebar-filter"]}>
                        <label>来源过滤</label>
                        <select
                            value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                        >
                            <option value="">全部</option>
                            <option value="llm">仅 AI 翻译</option>
                            <option value="human">仅人工校对</option>
                            <option value="pinned">仅锁定</option>
                            <option value="cn">仅官方</option>
                            <option value="unknown">仅未知</option>
                        </select>
                    </div>

                    {/* Category Tree */}
                    <div className={styles["sidebar-categories"]}>
                        {categories.map((cat) => (
                            <div key={cat.name} className={styles["category-group"]}>
                                <div className={styles["category-name"]}>
                                    {CATEGORY_LABELS[cat.name] || cat.name}
                                </div>
                                {cat.fields?.map((field) => {
                                    const llmUnknownCount = field.llmCount + field.unknownCount;

                                    return (
                                        <div
                                            key={`${cat.name}-${field.name}`}
                                            className={`${styles["field-item"]} ${selectedCategory === cat.name && selectedField === field.name
                                                ? styles.active
                                                : ""
                                                }`}
                                            onClick={() => handleFieldSelect(cat.name, field.name)}
                                        >
                                            <span>{FIELD_LABELS[field.name] || field.name}</span>
                                            <div className={styles["field-stats"]}>
                                                {llmUnknownCount > 0 && (
                                                    <span className={`${styles["stat-badge"]} ${styles.llm}`}>
                                                        {llmUnknownCount}
                                                    </span>
                                                )}
                                                {field.humanCount > 0 && (
                                                    <span className={`${styles["stat-badge"]} ${styles.human}`}>
                                                        {field.humanCount}
                                                    </span>
                                                )}
                                                {field.pinnedCount > 0 && (
                                                    <span className={`${styles["stat-badge"]} ${styles.pinned}`}>
                                                        {field.pinnedCount}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* Footer: Push & Logout */}
                    <div className={styles["sidebar-footer"]}>
                        <button
                            className={styles["push-btn"]}
                            onClick={handlePush}
                            disabled={pushing}
                        >
                            {pushing ? "推送中..." : "📤 推送到 GitHub"}
                        </button>
                        {pushStatus?.lastPush && (
                            <div className={styles["push-status"]}>
                                上次推送: {new Date(pushStatus.lastPush).toLocaleString("zh-CN")}
                            </div>
                        )}
                        {pushStatus?.lastError && (
                            <div className={styles["push-status"]} style={{ color: "#ef4444" }}>
                                错误: {pushStatus.lastError}
                            </div>
                        )}
                        <button className={styles["logout-btn"]} onClick={handleLogout}>
                            退出登录
                        </button>
                    </div>
                </aside>

                {/* ---- Main Content ---- */}
                <main className={styles["translate-main"]}>
                    {!selectedCategory || !selectedField ? (
                        <div className={styles["empty-state"]}>
                            <p>← 选择一个翻译类别</p>
                            <span>从左侧面板选择类别和字段开始校对</span>
                        </div>
                    ) : (
                        <>
                            <div className={styles["main-header"]}>
                                <h1>
                                    {CATEGORY_LABELS[selectedCategory] || selectedCategory} /{" "}
                                    {FIELD_LABELS[selectedField] || selectedField}
                                </h1>
                                <span className={styles["entry-count"]}>
                                    {selectedIndex >= 0 ? `${selectedIndex + 1} / ` : ""}
                                    {filteredEntries.length} 条
                                    {currentFieldInfo && ` (total: ${currentFieldInfo.total})`}
                                </span>
                            </div>

                            <div className={styles["search-bar"]}>
                                <input
                                    type="text"
                                    placeholder="搜索日文或中文..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* ---- Proofreading Panel ---- */}
                            {selectedEntry && (
                                <div className={styles["proof-panel"]}>
                                    <div className={styles["proof-original"]}>
                                        <label>日文原文</label>
                                        <div className={styles["proof-jp"]}>{selectedEntry.key}</div>
                                    </div>
                                    <div className={styles["proof-edit"]}>
                                        <div className={styles["proof-edit-header"]}>
                                            <label>
                                                翻译校对
                                                <span className={`${styles["source-tag"]} ${styles[selectedEntry.source] || ""}`} style={{ marginLeft: "0.5rem" }}>
                                                    {SOURCE_LABELS[selectedEntry.source] || selectedEntry.source}
                                                </span>
                                            </label>
                                            <div className={styles["proof-nav"]}>
                                                <button
                                                    onClick={() => navigateEntry(-1)}
                                                    disabled={selectedIndex <= 0}
                                                    title="上一条 (Ctrl+↑)"
                                                >
                                                    ↑ 上一条
                                                </button>
                                                <button
                                                    onClick={() => navigateEntry(1)}
                                                    disabled={selectedIndex >= filteredEntries.length - 1}
                                                    title="下一条 (Ctrl+↓)"
                                                >
                                                    下一条 ↓
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            ref={editRef}
                                            className={`${styles["proof-textarea"]} ${isGrayText ? styles["gray-text"] : ""}`}
                                            value={editValue}
                                            onChange={handleTextareaChange}
                                            onClick={handleTextareaClick}
                                            onKeyDown={handleTextareaKeyDown}
                                            placeholder="输入翻译..."
                                            rows={3}
                                        />
                                        <div className={styles["proof-actions"]}>
                                            <button
                                                className={styles["btn-save"]}
                                                onClick={() => handleSave()}
                                            >
                                                ✓ 保存并下一条
                                            </button>
                                            <button
                                                className={styles["btn-pinned"]}
                                                onClick={() => handleSave("pinned")}
                                                title="锁定 (不会被任何自动流程覆盖)"
                                            >
                                                🔒 锁定保存
                                            </button>
                                            <button
                                                className={styles["btn-cancel"]}
                                                onClick={() => {
                                                    setSelectedKey(null);
                                                    setIsEditingText(false);
                                                }}
                                            >
                                                取消
                                            </button>
                                            <div className={styles["proof-hints"]}>
                                                <kbd>Enter</kbd> 保存并下一条
                                                <kbd>Ctrl+↑↓</kbd> 切换条目
                                                <kbd>Esc</kbd> 取消
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ---- Entry List ---- */}
                            {loadingEntries ? (
                                <div className={styles.loading}>
                                    <div className={styles.spinner}></div>
                                    加载中...
                                </div>
                            ) : filteredEntries.length === 0 ? (
                                <div className={styles["empty-state"]}>
                                    <p>暂无数据</p>
                                    <span>{searchQuery ? "尝试其他搜索关键词" : "该字段下没有翻译条目"}</span>
                                </div>
                            ) : (
                                <div className={styles["entry-list-wrapper"]}>
                                    <table className={styles["translation-table"]}>
                                        <thead>
                                            <tr>
                                                <th className={styles["col-source"]}>来源</th>
                                                <th className={styles["col-jp"]}>日文原文</th>
                                                <th className={styles["col-cn"]}>当前翻译</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredEntries.map((entry) => (
                                                <tr
                                                    key={entry.key}
                                                    data-entry-key={entry.key}
                                                    className={`${styles["entry-row"]} ${selectedKey === entry.key ? styles["row-active"] : ""}`}
                                                    onClick={() => selectEntry(entry.key)}
                                                >
                                                    <td onClick={(e) => e.stopPropagation()}>
                                                        <select
                                                            value={entry.source}
                                                            onChange={(e) => handleSourceChange(entry.key, e.target.value)}
                                                            className={`${styles["source-tag"]} ${styles[entry.source] || ""}`}
                                                            style={{ border: "none", outline: "none", cursor: "pointer" }}
                                                        >
                                                            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                                                                <option key={k} value={k}>{v}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <div className={styles["jp-text"]}>{entry.key}</div>
                                                    </td>
                                                    <td>
                                                        <div className={styles["cn-text"]}>{entry.text}</div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>

            {/* Toasts */}
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`${styles.toast} ${styles[toast.type]}`}
                >
                    {toast.message}
                </div>
            ))}
        </div>
    );
}
