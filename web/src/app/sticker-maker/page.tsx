
import { Metadata } from "next";
import StickerMakerContent from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 表情包制作",
};

export default function StickerMakerPage() {
    return <StickerMakerContent />;
}
