
import { Metadata } from "next";
import PredictionClient from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 活动预测",
};

export default function PredictionPage() {
    return <PredictionClient />;
}
