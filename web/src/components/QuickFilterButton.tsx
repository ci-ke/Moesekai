"use client";
import React, { useEffect, useState } from "react";
import Modal from "@/components/common/Modal";
import { useQuickFilterContext } from "@/contexts/QuickFilterContext";

/**
 * Floating action button + Modal for the Quick Filter.
 * Renders a filter-funnel icon above the ScrollToTop button to
 * let users open the page's filter panel without scrolling.
 *
 * Only visible when a page has registered filter content via
 * `useQuickFilter()`.
 */
export default function QuickFilterButton() {
    const { filterContent, filterTitle, isOpen, open, close } = useQuickFilterContext();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const toggleVisibility = () => {
            setIsVisible(window.scrollY > 300);
        };

        window.addEventListener("scroll", toggleVisibility);
        toggleVisibility();

        return () => window.removeEventListener("scroll", toggleVisibility);
    }, []);

    // Don't render anything if no page has registered filters
    if (!filterContent) return null;

    return (
        <>
            {/* Floating button */}
            <button
                onClick={open}
                className={`fixed bottom-[6.5rem] right-8 p-3 rounded-2xl bg-white/80 backdrop-blur-md border border-miku/20 text-miku shadow-lg shadow-miku/10 transition-all duration-500 z-[100] hover:bg-miku hover:text-white hover:shadow-miku/30 hover:-translate-y-1 hover:scale-110 active:scale-95 transform group md:hidden ${isVisible
                    ? "opacity-100 translate-y-0 scale-100"
                    : "opacity-0 translate-y-10 scale-90 pointer-events-none"
                    }`}
                aria-label="打开快捷筛选"
            >
                <svg
                    className="w-6 h-6 transition-transform duration-500 group-hover:rotate-12"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                </svg>
            </button>

            {/* Modal overlay with the page's filter content */}
            <Modal
                isOpen={isOpen}
                onClose={close}
                title={filterTitle}
                size="md"
            >
                <div className="quick-filter-modal-content">
                    {filterContent}
                </div>
            </Modal>
        </>
    );
}
