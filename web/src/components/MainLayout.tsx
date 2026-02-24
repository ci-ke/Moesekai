"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import MainNavbar from "./MainNavbar";
import Sidebar from "./Sidebar";
import MainFooter from "./MainFooter";
import ScrollToTop from "./ScrollToTop";
import SekaiLoader from "./SekaiLoader";
import BackgroundPattern from "./BackgroundPattern";
import KeyboardShortcutsHelp from "./KeyboardShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

interface MainLayoutProps {
    children: React.ReactNode;
    showLoader?: boolean;
}

export default function MainLayout({
    children,
    showLoader = false
}: MainLayoutProps) {
    const router = useRouter();

    // 初始值始终为 false，确保 SSR 和客户端首次渲染一致，避免 hydration 不匹配
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);

    // 状态上移：搜索、设置、快捷键帮助由 MainLayout 统一管理
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

    // 客户端挂载后读取 sessionStorage 恢复侧边栏状态
    // 分两阶段：先设置正确位置（无动画），再启用过渡动画
    useEffect(() => {
        const saved = sessionStorage.getItem('sidebar_open');
        if (saved !== null) {
            setIsSidebarOpen(saved === 'true');
        } else {
            // 首次访问，PC 端默认打开
            setIsSidebarOpen(window.innerWidth >= 768);
        }
        // 等浏览器完成绘制后再启用过渡动画，避免初次加载时的滑入动画
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setHasMounted(true);
            });
        });
    }, []);

    // 检测屏幕尺寸
    useEffect(() => {
        const checkDesktop = () => {
            setIsDesktop(window.innerWidth >= 768);
        };

        checkDesktop();
        window.addEventListener('resize', checkDesktop);

        return () => window.removeEventListener('resize', checkDesktop);
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

    // 快捷键回调
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
        onNavigateBack: () => router.back(),
        onNavigateForward: () => window.history.forward(),
        onNavigateHome: () => router.push("/"),
    }), [router]);

    useKeyboardShortcuts(shortcutHandlers);

    return (
        <main className="min-h-screen relative selection:bg-miku selection:text-white font-sans flex flex-col overflow-x-hidden">
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
                <Sidebar isOpen={isSidebarOpen} onClose={handleSidebarClose} hasMounted={hasMounted} />

                {/* Main Content - 添加左边距以适应桌面端侧边栏 */}
                <div className={`flex-grow relative z-10 w-full min-w-0 ${hasMounted ? 'transition-all duration-300' : ''} ${isSidebarOpen ? 'md:ml-64' : 'md:ml-0'
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
