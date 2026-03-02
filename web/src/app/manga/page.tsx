
import { Metadata } from "next";
import MangaClient from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 官方四格",
};

export default function MangaPage() {
    return <MangaClient />;
}
