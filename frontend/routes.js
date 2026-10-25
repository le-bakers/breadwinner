// Resolve navigation from this module, not the server root. This also works
// when the frontend is served below a project folder without route rewrites.
export const pages = {
    '/': 'index/index.html',
    '/home': 'home/home.html',
    '/history': 'history/history.html',
    '/settings': 'settings/settings.html',
    '/signin': 'signin/signin.html',
    '/resetlink': 'resetlink/resetlink.html',
    '/signup': 'onboarding/onboarding.html',
    '/about': 'about/about.html',
    '/contact': 'contactus/contactus.html',
    '/privacy': 'legal/privacy.html',
    '/terms': 'legal/terms.html'
};
export function assetUrl(path) {
    return new URL(path, import.meta.url).href;
}
export function pageUrl(route) {
    const match = route.match(/^([^?#]*)(.*)$/);
    const path = pages[match[1]];
    if (!path)
        throw new Error('Unknown page: ' + route);
    return assetUrl(path + match[2]);
}
