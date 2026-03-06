import { Metadata } from "next";
import GuessJacketClient from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 猜曲绘",
    description: "猜曲绘小游戏 - 通过歌曲封面局部猜测曲目",
};

export default function GuessJacketPage() {
    return <GuessJacketClient />;
}
