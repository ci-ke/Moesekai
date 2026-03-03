import { NextRequest, NextResponse } from "next/server";

/**
 * 图片代理 API - 解决 Canvas 绘制跨域图片的 CORS 问题
 * 用法: /api/image-proxy?url=https://example.com/image.png
 */
export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // 白名单：只允许代理可信域名的图片
    const allowedHosts = [
        "snowyassets.exmeaning.com",
        "assets.exmeaning.com",
        "assets.unipjsk.com",
        "storage.sekai.best",
    ];

    try {
        const parsedUrl = new URL(url);
        if (!allowedHosts.includes(parsedUrl.hostname)) {
            return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
        }
    } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    try {
        const res = await fetch(url);
        if (!res.ok) {
            return NextResponse.json({ error: "Upstream error" }, { status: res.status });
        }

        const contentType = res.headers.get("content-type") || "image/png";
        const buffer = await res.arrayBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=86400",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch {
        return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
    }
}
