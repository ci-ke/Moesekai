
import { Suspense } from "react";
import MainLayout from "@/components/MainLayout";
import CharacterDetailClient from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Moesekai - 角色详情",
};

export default function CharacterDetailPage() {
    return (
        <MainLayout>
            <Suspense fallback={<div className="flex h-[50vh] w-full items-center justify-center text-slate-500">正在加载角色详情...</div>}>
                <CharacterDetailClient />
            </Suspense>
        </MainLayout>
    );
}
