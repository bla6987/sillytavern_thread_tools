// Field lists mirror CC_COMMANDS / TC_COMMANDS in SillyTavern's connection-manager.
const CC_FIELDS = ['api', 'preset', 'api-url', 'model', 'proxy', 'stop-strings', 'start-reply-with', 'reasoning-template', 'prompt-post-processing', 'secret-id', 'regex-preset'];
const TC_FIELDS = ['api', 'preset', 'api-url', 'model', 'sysprompt', 'sysprompt-state', 'instruct', 'context', 'instruct-state', 'tokenizer', 'stop-strings', 'start-reply-with', 'reasoning-template', 'secret-id', 'regex-preset'];

export const FIELD_LABELS = {
    'api': 'API',
    'api-url': 'Server URL',
    'preset': 'Settings Preset',
    'model': 'Model',
    'proxy': 'Proxy Preset',
    'sysprompt-state': 'Use System Prompt',
    'sysprompt': 'System Prompt Name',
    'instruct-state': 'Instruct Mode',
    'instruct': 'Instruct Template',
    'context': 'Context Template',
    'tokenizer': 'Tokenizer',
    'stop-strings': 'Custom Stopping Strings',
    'start-reply-with': 'Start Reply With',
    'reasoning-template': 'Reasoning Template',
    'prompt-post-processing': 'Prompt Post-Processing',
    'secret-id': 'Secret',
    'regex-preset': 'Regex Preset',
};

// Fields whose empty value is meaningful ("set this to nothing") rather than "don't set".
export const ALLOW_EMPTY = ['stop-strings', 'start-reply-with'];

/**
 * @param {string} mode Profile mode ('cc' or 'tc')
 * @returns {string[]} Editable fields, in display order
 */
export function getFieldsForMode(mode) {
    return mode === 'cc' ? CC_FIELDS : TC_FIELDS;
}

/**
 * Lists the API keys valid for a profile mode, one per source/type.
 * The first key wins, matching what `/api` reports back for the current API.
 * @param {Record<string, { selected: string, source?: string, type?: string }>} apiMap CONNECT_API_MAP
 * @param {string} mode Profile mode ('cc' or 'tc')
 * @returns {string[]}
 */
export function getApiKeysForMode(apiMap, mode) {
    const selected = mode === 'cc' ? 'openai' : 'textgenerationwebui';
    const seen = new Set();
    const keys = [];
    for (const [key, config] of Object.entries(apiMap ?? {})) {
        if (config?.selected !== selected) {
            continue;
        }
        const id = config.source ?? config.type ?? key;
        if (seen.has(id)) {
            continue;
        }
        seen.add(id);
        keys.push(key);
    }
    return keys;
}

/**
 * @param {string} name Proposed profile name
 * @param {{ id: string, name: string }[]} profiles All profiles
 * @param {string} id ID of the profile being edited
 * @returns {string} Error message, or '' if the name is fine
 */
export function validateProfileName(name, profiles, id) {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) {
        return 'Name cannot be empty.';
    }
    if (profiles.some(p => p.id !== id && p.name === trimmed)) {
        return 'A profile with the same name already exists.';
    }
    return '';
}

/**
 * Applies editor values to a copy of a profile.
 * An unticked field is removed from the profile. If the profile used to set it,
 * it is also added to the exclude list, so SillyTavern's "Update" button doesn't
 * record it again. A ticked field is removed from the exclude list.
 * @param {Record<string, any>} profile Original profile (not modified)
 * @param {object} edits
 * @param {string} edits.name New name
 * @param {Record<string, { include: boolean, value: string }>} edits.fields Field values keyed by field name
 * @returns {Record<string, any>} Updated profile
 */
export function applyProfileEdits(profile, { name, fields }) {
    const next = structuredClone(profile);
    const exclude = new Set(Array.isArray(next.exclude) ? next.exclude : []);
    next.name = String(name ?? '').trim();

    for (const key of getFieldsForMode(next.mode)) {
        const field = fields[key];
        if (!field) {
            continue;
        }
        const raw = String(field.value ?? '');
        const value = key === 'start-reply-with' ? raw : raw.trim();
        const keep = field.include && (value !== '' || ALLOW_EMPTY.includes(key));

        if (keep) {
            next[key] = value;
            exclude.delete(key);
        } else {
            if (key in profile) {
                exclude.add(key);
            }
            delete next[key];
        }
    }

    next.exclude = [...exclude];
    return next;
}

/**
 * Lists fields whose values differ between two profiles, for a change summary.
 * @param {Record<string, any>} before
 * @param {Record<string, any>} after
 * @returns {string[]} Field keys (plus 'name') that changed
 */
export function diffProfiles(before, after) {
    const changed = [];
    if (before.name !== after.name) {
        changed.push('name');
    }
    for (const key of getFieldsForMode(after.mode)) {
        if (before[key] !== after[key]) {
            changed.push(key);
        }
    }
    return changed;
}
