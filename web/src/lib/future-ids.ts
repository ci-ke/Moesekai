/**
 * Utility for pre-generating future IDs in SSG.
 * 
 * Since the app uses `output: "export"` (fully static), detail pages for IDs
 * that don't exist at build time won't have a static HTML shell. By reserving
 * extra sequential IDs beyond the current max, small masterdata updates
 * (new cards, events, gacha, etc.) can be accessed without a CI rebuild.
 * 
 * The detail pages are client-rendered — the static HTML is just a shell.
 * The client component fetches fresh data at runtime, so "future" pages
 * work correctly as soon as the masterdata is updated on the server.
 */

// Number of extra IDs to reserve per entity type
const RESERVE_COUNTS: Record<string, number> = {
    cards: 30,       // New events add 4-8 cards, gacha adds more
    events: 5,       // ~1-2 per update cycle
    gachas: 5,       // ~1-2 per update cycle
    musics: 10,      // ~1-3 per update cycle
    virtualLives: 5, // ~1 per update cycle
    mysekai: 10,     // Variable
    costumes: 10,    // Variable
    default: 10,
};

/**
 * Given a list of existing numeric ID strings, append N future sequential IDs.
 * @param ids - Current ID strings from masterdata
 * @param entityType - Entity type key for determining reserve count
 * @returns Extended ID array with future IDs appended
 */
export function appendFutureIds(ids: string[], entityType: string = "default"): string[] {
    if (ids.length === 0) return ids;

    const reserveCount = RESERVE_COUNTS[entityType] ?? RESERVE_COUNTS.default;

    // Find the max numeric ID
    const numericIds = ids.map(Number).filter((n) => !isNaN(n));
    if (numericIds.length === 0) return ids;

    const maxId = Math.max(...numericIds);

    // Generate future IDs
    const futureIds: string[] = [];
    for (let i = 1; i <= reserveCount; i++) {
        futureIds.push((maxId + i).toString());
    }

    console.log(`[Build] ${entityType}: ${ids.length} existing + ${reserveCount} reserved (max: ${maxId} → ${maxId + reserveCount})`);

    return [...ids, ...futureIds];
}
