"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import MainNavbar from "./MainNavbar";
import Sidebar from "./Sidebar";
import MainFooter from "./MainFooter";
import ScrollToTop from "./ScrollToTop";
import SekaiLoader from "./SekaiLoader";
import BackgroundPattern from "./BackgroundPattern";
import KeyboardShortcutsHelp from "./KeyboardShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePageListShortcuts } from "@/hooks/usePageListShortcuts";
import { useTheme } from "@/contexts/ThemeContext";

interface MainLayoutProps {
    children: React.ReactNode;
    showLoader?: boolean;
}

export default function MainLayout({
    children,
    showLoader = false
}: MainLayoutProps) {
    const router = useRouter();
    const { useTrainedThumbnail, setUseTrainedThumbnail } = useTheme();
    const pageContentRef = useRef<HTMLDivElement>(null);

    // Keep the initial value false to avoid hydration mismatch.
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);

    // Centralized UI states managed by MainLayout.
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

    // Restore sidebar state from sessionStorage after mount.
    // Use two RAF ticks: set position first, then enable transitions.
    useEffect(() => {
        const saved = sessionStorage.getItem("sidebar_open");
        const nextSidebarOpen = saved !== null
            ? saved === "true"
            : window.innerWidth >= 768;
        let raf1 = 0;
        let raf2 = 0;

        raf1 = requestAnimationFrame(() => {
            setIsSidebarOpen(nextSidebarOpen);
            raf2 = requestAnimationFrame(() => {
                setHasMounted(true);
            });
        });

        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
        };
    }, []);

    const handleMenuToggle = useCallback(() => {
        setIsSidebarOpen(prev => {
            const newState = !prev;
            sessionStorage.setItem('sidebar_open', String(newState));
            return newState;
        });
    }, []);

    const handleSidebarClose = useCallback(() => {
        setIsSidebarOpen(false);
        sessionStorage.setItem('sidebar_open', 'false');
    }, []);

    // Keyboard shortcut handlers.
    const shortcutHandlers = useMemo(() => ({
        onToggleSidebar: () => {
            setIsSidebarOpen(prev => {
                const newState = !prev;
                sessionStorage.setItem('sidebar_open', String(newState));
                return newState;
            });
        },
        onToggleSettings: () => setIsSettingsOpen(prev => !prev),
        onToggleSearch: () => setIsSearchOpen(prev => !prev),
        onToggleShortcutsHelp: () => setIsShortcutsHelpOpen(prev => !prev),
        onToggleTrainedThumbnail: () => setUseTrainedThumbnail(!useTrainedThumbnail),
        onNavigateBack: () => router.back(),
        onNavigateForward: () => window.history.forward(),
        onNavigateHome: () => router.push("/"),
        onNavigateCards: () => router.push("/cards"),
        onNavigateMusic: () => router.push("/music"),
        onNavigateEvents: () => router.push("/events"),
        onNavigateProfile: () => router.push("/profile"),
    }), [router, useTrainedThumbnail, setUseTrainedThumbnail]);

    const isShortcutScopeLocked = isSearchOpen || isSettingsOpen || isShortcutsHelpOpen;

    useKeyboardShortcuts(shortcutHandlers, {
        disabled: isShortcutScopeLocked,
    });

    usePageListShortcuts({
        rootRef: pageContentRef,
        disabled: isShortcutScopeLocked,
    });

    return (
        <main className="min-h-screen relative selection:bg-miku selection:text-white font-sans flex flex-col">
            {/* Loading Animation */}
            {showLoader && <SekaiLoader />}

            {/* Background Pattern */}
            <BackgroundPattern />

            {/* Navbar */}
            <MainNavbar
                onMenuToggle={handleMenuToggle}
                isSearchOpen={isSearchOpen}
                onSearchToggle={() => setIsSearchOpen(prev => !prev)}
                onSearchClose={() => setIsSearchOpen(false)}
                isSettingsOpen={isSettingsOpen}
                onSettingsToggle={() => setIsSettingsOpen(prev => !prev)}
                onSettingsClose={() => setIsSettingsOpen(false)}
                onShortcutsHelpToggle={() => setIsShortcutsHelpOpen(prev => !prev)}
            />

            {/* Layout with Sidebar */}
            <div className="flex flex-grow pt-[4.5rem] relative">
                {/* Sidebar */}
                <Sidebar
                    isOpen={isSidebarOpen}
                    onClose={handleSidebarClose}
                    hasMounted={hasMounted}
                    disableKeyboardNavigation={isShortcutScopeLocked}
                />

                {/* Main content area */}
                <div ref={pageContentRef} data-shortcut-page-root="true" className={`flex-grow relative z-10 w-full min-w-0 ${hasMounted ? 'transition-all duration-300' : ''} ${isSidebarOpen ? 'md:ml-64' : 'md:ml-0'
                    }`}>
                    {children}
                </div>
            </div>

            {/* Footer */}
            <div className={`relative z-[5] ${hasMounted ? 'transition-all duration-300' : ''} ${isSidebarOpen ? 'md:ml-64' : 'md:ml-0'
                }`}>
                <MainFooter />
            </div>

            {/* Scroll To Top */}
            <ScrollToTop />

            {/* Keyboard Shortcuts Help */}
            <KeyboardShortcutsHelp isOpen={isShortcutsHelpOpen} onClose={() => setIsShortcutsHelpOpen(false)} />
        </main>
    );
}
