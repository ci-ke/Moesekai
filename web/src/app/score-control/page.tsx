import { Metadata } from "next";
import ScoreControlClient from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 控分计算器",
    description: "输入目标活动PT，反向搜索所有满足条件的卡组加成与得分方案",
};

export default function ScoreControlPage() {
    return <ScoreControlClient />;
}
