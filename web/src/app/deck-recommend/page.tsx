import { Metadata } from "next";
import DeckRecommendClient from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 组卡推荐器",
    description: "自动推荐最优卡组，支持挑战Live和活动模式",
};

export default function DeckRecommendPage() {
    return <DeckRecommendClient />;
}
