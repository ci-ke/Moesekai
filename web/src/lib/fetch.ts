/**
 * Fetch utilities with compression header support
 * Ensures requests include Accept-Encoding: gzip, deflate, br, zstd
 */

const MASTER_BASE_URL = "https://sekaimaster.exmeaning.com/master";

/**
 * Fetch with explicit compression headers
 * Modern browsers typically send these automatically, but this ensures they're always present
 */
export async function fetchWithCompression(
    url: string,
    options?: RequestInit
): Promise<Response> {
    const headers = new Headers(options?.headers);
    // Only set if not already present (browser may set its own)
    if (!headers.has("Accept-Encoding")) {
        headers.set("Accept-Encoding", "gzip, deflate, br, zstd");
    }
    return fetch(url, { ...options, headers });
}

/**
 * Fetch master data from sekaimaster.exmeaning.com with compression support
 * @param path - Path relative to master directory (e.g., "gachas.json", "cards.json")
 */
export async function fetchMasterData<T>(path: string): Promise<T> {
    const url = `${MASTER_BASE_URL}/${path}`;
    const response = await fetchWithCompression(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch master data: ${path}`);
    }
    return response.json();
}

/**
 * Fetch multiple master data files in parallel
 * @param paths - Array of paths relative to master directory
 */
export async function fetchMultipleMasterData<T extends unknown[]>(
    paths: string[]
): Promise<T> {
    const results = await Promise.all(
        paths.map((path) => fetchMasterData(path))
    );
    return results as T;
}
