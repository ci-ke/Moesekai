
import { Metadata } from "next";
import VirtualLiveContent from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 演唱会",
};

export default function LivePage() {
    return <VirtualLiveContent />;
}
