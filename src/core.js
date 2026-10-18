export const EXTENSION_ID = 'sillytavern_thread_tools';
export const LOG_PREFIX = '[Thread Tools]';

/**
 * @typedef {object} FeatureApi
 * @property {Record<string, any>} settings This feature's settings object (persisted)
 * @property {() => void} save Persist settings
 * @property {() => boolean} isEnabled Whether the feature is currently turned on
 */

/**
 * @typedef {object} Feature
 * @property {string} id Key under which the feature's settings are stored
 * @property {string} title Section title in the settings panel
 * @property {string} description One or two sentences shown under the title
 * @property {Record<string, any>} [defaults] Default settings (an `enabled` flag is added automatically)
 * @property {(container: HTMLElement, api: FeatureApi) => void} [renderSettings] Adds the feature's own controls
 * @property {(api: FeatureApi) => void} [init] Registers listeners; runs once, whether or not the feature is enabled
 * @property {(enabled: boolean, api: FeatureApi) => void} [onToggle] Called when the user flips the feature on or off
 */

/** @type {Feature[]} */
const features = [];

/**
 * Adds a feature. Call before initFeatures().
 * @param {Feature} feature
 */
export function registerFeature(feature) {
    features.push(feature);
}

function getRootSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[EXTENSION_ID] || typeof extensionSettings[EXTENSION_ID] !== 'object') {
        extensionSettings[EXTENSION_ID] = {};
    }
    const root = extensionSettings[EXTENSION_ID];
    if (!root.features || typeof root.features !== 'object') {
        root.features = {};
    }
    return root;
}

/**
 * @param {Feature} feature
 * @returns {FeatureApi}
 */
function createFeatureApi(feature) {
    const root = getRootSettings();
    const defaults = { enabled: true, ...(feature.defaults ?? {}) };
    const settings = root.features[feature.id] ??= {};
    for (const [key, value] of Object.entries(defaults)) {
        if (settings[key] === undefined) {
            settings[key] = structuredClone(value);
        }
    }
    return {
        settings,
        save: () => SillyTavern.getContext().saveSettingsDebounced(),
        isEnabled: () => !!settings.enabled,
    };
}

function renderPanel() {
    const panel = document.createElement('div');
    panel.id = 'thread_tools_settings';
    panel.className = 'thread_tools_settings';
    panel.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Thread Tools</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="thread_tools_hint">Small fixes and tools. Each section can be turned on or off on its own.</div>
                <div class="thread_tools_features"></div>
            </div>
        </div>`;
    document.getElementById('extensions_settings2')?.append(panel);
    return /** @type {HTMLElement} */ (panel.querySelector('.thread_tools_features'));
}

/**
 * @param {HTMLElement} list
 * @param {Feature} feature
 * @param {FeatureApi} api
 */
function renderFeatureSection(list, feature, api) {
    const section = document.createElement('div');
    section.className = 'thread_tools_feature inline-drawer';
    section.dataset.feature = feature.id;
    section.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header">
            <span class="thread_tools_feature_title"></span>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="thread_tools_hint thread_tools_feature_description"></div>
            <label class="checkbox_label">
                <input type="checkbox" class="thread_tools_feature_enabled" />
                <span>Enabled</span>
            </label>
            <div class="thread_tools_feature_body"></div>
        </div>`;
    section.querySelector('.thread_tools_feature_title').textContent = feature.title;
    section.querySelector('.thread_tools_feature_description').textContent = feature.description;

    const toggle = /** @type {HTMLInputElement} */ (section.querySelector('.thread_tools_feature_enabled'));
    toggle.checked = api.isEnabled();
    section.classList.toggle('thread_tools_feature_off', !api.isEnabled());
    toggle.addEventListener('change', () => {
        api.settings.enabled = toggle.checked;
        section.classList.toggle('thread_tools_feature_off', !toggle.checked);
        api.save();
        feature.onToggle?.(toggle.checked, api);
    });

    list.append(section);
    feature.renderSettings?.(/** @type {HTMLElement} */ (section.querySelector('.thread_tools_feature_body')), api);
}

export function initFeatures() {
    const list = renderPanel();
    for (const feature of features) {
        try {
            const api = createFeatureApi(feature);
            if (list) {
                renderFeatureSection(list, feature, api);
            }
            feature.init?.(api);
        } catch (error) {
            console.error(LOG_PREFIX, `Failed to start feature "${feature.id}"`, error);
        }
    }
}
