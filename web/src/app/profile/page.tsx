import { Metadata } from "next";
import ProfileClient from "./client";

export const metadata: Metadata = {
    title: "Moesekai - 我的主页",
};

export default function ProfilePage() {
    return <ProfileClient />;
}
