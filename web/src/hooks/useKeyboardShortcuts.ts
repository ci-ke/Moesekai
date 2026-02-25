"use client";
import { useEffect, useRef, useCallback } from "react";

export interface KeyboardShortcutHandlers {
    onToggleSidebar: () => void;
    onToggleSettings: () => void;
    onToggleSearch: () => void;
    onToggleShortcutsHelp: () => void;
    onToggleTrainedThumbnail: () => void;
    onNavigateBack: () => void;
    onNavigateForward: () => void;
    onNavigateHome: () => void;
}

/**
 * Global keyboard shortcuts hook.
 * Disabled on mobile (viewport < 768px) and when focus is in input/textarea.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
    const pendingKeyRef = useRef<string | null>(null);
    const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearPending = useCallback(() => {
        pendingKeyRef.current = null;
        if (pendingTimerRef.current) {
            clearTimeout(pendingTimerRef.current);
            pendingTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Disable on mobile
            if (window.innerWidth < 768) return;

            // Ignore when typing in input fields
            const target = e.target as HTMLElement;
            const tagName = target.tagName.toLowerCase();
            if (
                tagName === "input" ||
                tagName === "textarea" ||
                target.isContentEditable
            ) {
                return;
            }

            // Ctrl+K / ⌘K → search (migrated from MainNavbar)
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                clearPending();
                handlers.onToggleSearch();
                return;
            }

            // Ctrl+X → settings
            if ((e.metaKey || e.ctrlKey) && e.key === "x") {
                e.preventDefault();
                clearPending();
                handlers.onToggleSettings();
                return;
            }

            // Alt+← → back
            if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                clearPending();
                handlers.onNavigateBack();
                return;
            }

            // Alt+→ → forward
            if (e.altKey && e.key === "ArrowRight") {
                e.preventDefault();
                clearPending();
                handlers.onNavigateForward();
                return;
            }

            // Skip if any modifier is held for the remaining shortcuts
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            // Two-key sequence: G → H (go home)
            if (pendingKeyRef.current === "g") {
                clearPending();
                if (e.key === "h" || e.key === "H") {
                    e.preventDefault();
                    handlers.onNavigateHome();
                }
                return;
            }

            // Start G sequence
            if (e.key === "g") {
                pendingKeyRef.current = "g";
                pendingTimerRef.current = setTimeout(() => {
                    pendingKeyRef.current = null;
                }, 500);
                return;
            }

            // [ → toggle sidebar
            if (e.key === "[") {
                e.preventDefault();
                handlers.onToggleSidebar();
                return;
            }

            // ] → toggle trained thumbnail for 3★/4★
            if (e.key === "]") {
                e.preventDefault();
                handlers.onToggleTrainedThumbnail();
                return;
            }

            // ? or / → shortcuts help
            if (e.key === "?" || e.key === "/") {
                e.preventDefault();
                handlers.onToggleShortcutsHelp();
                return;
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            clearPending();
        };
    }, [handlers, clearPending]);
}
