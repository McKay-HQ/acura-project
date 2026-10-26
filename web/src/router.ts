// Path URLs for the app's pages (/, /parts, /part/<key>, ...) with the History API. The server answers every path
// with the app (nginx's try_files, Vite's SPA fallback), except /api and /uploads.

/** Paths the app shows; /api and /uploads go to the server. */
const isAppPath = (path: string): boolean => !/^\/(api|uploads)(\/|$)/.test(path);

/** Go to a page in the app without reloading it; App follows along through popstate. */
export function navigate(to: string, { replace = false } = {}): void {
    if (to === window.location.pathname + window.location.search + window.location.hash) return;
    if (replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * The path for an old hash URL from before the app used paths (#part/key, #parts), or null for an in-page anchor like
 * #photo-3. Old links in bookmarks, messages and saved task steps keep working.
 */
export function pathFromHash(hash: string): string | null {
    const route = decodeURIComponent(hash.slice(1));
    if (!/^[a-z]+(\/.+)?$/.test(route)) return null;
    return route === 'home' ? '/' : `/${route}`;
}

/** Swap an old hash URL in the address bar for its path, keeping the history entry. */
export function upgradeHashUrl(): void {
    const path = pathFromHash(window.location.hash);
    if (path) navigate(path, { replace: true });
}

/**
 * For a document click listener in the capture phase: a plain click on a link to one of the app's pages navigates in
 * the app instead of loading the page again. Links that open elsewhere (new tab, download, another site, the API) and
 * in-page anchors are left to the browser. Capturing comes before links' own handlers, some of which stop the click.
 */
export function followAppLink(event: MouseEvent): void {
    if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
    )
        return;
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !isAppPath(url.pathname)) return;
    const oldStyle = pathFromHash(url.hash);
    if (url.hash && !oldStyle && url.pathname === window.location.pathname) return;
    event.preventDefault();
    navigate(oldStyle ?? url.pathname + url.search);
}
