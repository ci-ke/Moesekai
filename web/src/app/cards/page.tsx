
import { Metadata } from "next";
import CardsClient from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 卡牌图鉴",
};

export default function CardsPage() {
    return <CardsClient />;
}
