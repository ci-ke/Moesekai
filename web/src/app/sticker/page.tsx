
import { Metadata } from "next";
import StickerContent from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 贴纸图鉴",
};

export default function StickerPage() {
    return <StickerContent />;
}
