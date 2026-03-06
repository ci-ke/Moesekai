import { Metadata } from "next";
import TranslateClient from "./client";

export const metadata: Metadata = {
    title: "翻译校对 - Moesekai",
    robots: { index: false, follow: false }, // Don't index this internal tool
};

export default function TranslatePage() {
    return <TranslateClient />;
}
