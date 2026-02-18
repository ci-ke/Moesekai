
import { Metadata } from "next";
import MysekaiClient from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 家具图鉴",
};

export default function MysekaiPage() {
    return <MysekaiClient />;
}
