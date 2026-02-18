
import { Metadata } from "next";
import GuessWhoClient from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 我是谁",
    description: "猜卡面小游戏 - 通过卡面局部猜测角色",
};

export default function GuessWhoPage() {
    return <GuessWhoClient />;
}
