/**
 * Normalizes an endpoint URL so that cosmetic differences map to the same key:
 * scheme, case, trailing slashes, a trailing /v1, and localhost vs 127.0.0.1.
 * @param {string} url Endpoint URL
 * @returns {string} Normalized URL, or '' when empty
 */
export function normalizeEndpointUrl(url) {
    let value = String(url ?? '').trim().toLowerCase();
    if (!value) {
        return '';
    }
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    value = value.replace(/\/+$/, '').replace(/\/v1$/, '').replace(/\/+$/, '');
    value = value.replace(/^(localhost|\[::1\]|0\.0\.0\.0)(?=[:/]|$)/, '127.0.0.1');
    return value;
}

/**
 * Finds a model in a list, ignoring case and surrounding whitespace.
 * @param {string[]} available Model IDs
 * @param {string} model Model to look for
 * @returns {string|null} The matching entry from `available`
 */
export function findModel(available, model) {
    const needle = String(model ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    return available.find(x => x.toLowerCase() === needle) ?? null;
}
