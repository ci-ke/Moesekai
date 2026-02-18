
import { Metadata } from "next";
import EventsContent from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 活动图鉴",
};

export default function EventsPage() {
    return <EventsContent />;
}
