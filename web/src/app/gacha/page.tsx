
import { Metadata } from "next";
import GachaContent from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 扭蛋图鉴",
};

export default function GachaPage() {
    return <GachaContent />;
}
