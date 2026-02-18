
import { Metadata } from "next";
import CharacterListContent from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 角色图鉴",
};

export default function CharacterPage() {
    return <CharacterListContent />;
}
