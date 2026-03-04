"use client";

const DEFAULT_IMAGE_PROXY_PATH = "/api/image-proxy";

const EXTENSION_BY_MIME: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
};

interface ImageActionOptions {
    proxyPath?: string;
}

function sanitizeFileName(fileName: string): string {
    const trimmed = fileName.trim();
    const fallback = "image";
    const safeBase = (trimmed || fallback)
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/^\.+/, "")
        .slice(0, 120);

    return safeBase || fallback;
}

function ensureFileExtension(fileName: string, mimeType: string): string {
    if (/\.[a-zA-Z0-9]+$/.test(fileName)) {
        return fileName;
    }
    const ext = EXTENSION_BY_MIME[mimeType] || "png";
    return `${fileName}.${ext}`;
}

function toAbsoluteUrl(imageUrl: string): string {
    return new URL(imageUrl, window.location.href).toString();
}

async function fetchImageBlobDirect(url: string): Promise<Blob> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Image request failed: ${res.status}`);
    }

    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) {
        throw new Error("Response is not an image");
    }

    return blob;
}

export async function fetchImageBlob(
    imageUrl: string,
    options: ImageActionOptions = {}
): Promise<Blob> {
    if (typeof window === "undefined") {
        throw new Error("Image actions are only available in browser");
    }

    const proxyPath = options.proxyPath || DEFAULT_IMAGE_PROXY_PATH;
    const absoluteUrl = toAbsoluteUrl(imageUrl);
    const absolute = new URL(absoluteUrl);
    const isSameOrigin = absolute.origin === window.location.origin;

    if (isSameOrigin) {
        return fetchImageBlobDirect(absoluteUrl);
    }

    try {
        return await fetchImageBlobDirect(absoluteUrl);
    } catch {
        const proxyUrl = `${proxyPath}?url=${encodeURIComponent(absoluteUrl)}`;
        return fetchImageBlobDirect(proxyUrl);
    }
}

export async function saveImageFromUrl(
    imageUrl: string,
    fileName: string,
    options: ImageActionOptions = {}
): Promise<void> {
    const blob = await fetchImageBlob(imageUrl, options);
    const safeName = ensureFileExtension(sanitizeFileName(fileName), blob.type);

    const objectUrl = URL.createObjectURL(blob);
    try {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = safeName;
        link.click();
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export async function copyImageFromUrl(
    imageUrl: string,
    options: ImageActionOptions = {}
): Promise<void> {
    if (!navigator.clipboard?.write) {
        throw new Error("Clipboard API is not supported");
    }

    type ClipboardItemConstructor = new (items: Record<string, Blob>) => ClipboardItem;
    const ClipboardItemCtor = (window as Window & { ClipboardItem?: ClipboardItemConstructor }).ClipboardItem;
    if (!ClipboardItemCtor) {
        throw new Error("ClipboardItem is not supported");
    }

    const blob = await fetchImageBlob(imageUrl, options);
    const mimeType = blob.type.startsWith("image/") ? blob.type : "image/png";

    await navigator.clipboard.write([
        new ClipboardItemCtor({ [mimeType]: blob }),
    ]);
}
