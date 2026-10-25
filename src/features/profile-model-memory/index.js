import { LOG_PREFIX } from '../../core.js';
import { findModel } from '../../endpoint-url.js';
import { MODEL_CONTROLS, getCurrentEndpoint, getModelState } from '../../connection.js';
import { decideModel } from './logic.js';

const WATCHED_IDS = new Set(MODEL_CONTROLS.flatMap(x => x.list ? [x.id, x.list] : [x.id]));

// How long to wait for a profile's reconnect to finish repopulating the model list.
const CONNECT_START_DELAY_MS = 500;
const CONNECT_TIMEOUT_MS = 20000;
const CONNECT_POLL_MS = 250;

/** @type {import('../../core.js').FeatureApi} */
let api;
let reconcileRun = 0;
let reconcileController = null;
let unsubscribe = null;
let rememberTimer = null;

function cancelReconcile() {
    reconcileRun++;
    reconcileController?.abort();
    reconcileController = null;
    if (rememberTimer !== null) clearTimeout(rememberTimer);
    rememberTimer = null;
}

/**
 * Records the model in use for the current endpoint.
 * @param {string} [source] What triggered the recording, for logging
 */
function rememberCurrentModel(source = '') {
    if (!api.isEnabled()) {
        return;
    }

    const endpoint = getCurrentEndpoint();
    const { control, available } = getModelState();
    const model = String(control?.value ?? '').trim();
    if (!control || !model || (available.length && !findModel(available, model))) {
        return;
    }

    const previous = api.settings.endpoints[endpoint.key];
    if (previous?.model === model && previous?.label === endpoint.label) {
        return;
    }

    api.settings.endpoints[endpoint.key] = {
        model,
        label: endpoint.label,
        api: endpoint.type ? `${endpoint.api}:${endpoint.type}` : endpoint.api,
        updatedAt: Date.now(),
    };
    console.debug(LOG_PREFIX, `Remembered "${model}" for ${endpoint.label}`, source);
    api.save();
    renderEndpointList();
}

function findLoadedProfile(profileName) {
    const { extensionSettings } = SillyTavern.getContext();
    const manager = extensionSettings.connectionManager;
    if (!manager || !Array.isArray(manager.profiles)) {
        return null;
    }
    return manager.profiles.find(p => p.id === manager.selectedProfile && p.name === profileName)
        ?? manager.profiles.find(p => p.name === profileName)
        ?? null;
}

function isConnecting() {
    return Array.from(document.querySelectorAll('.api_loading'))
        .some(el => el instanceof HTMLElement && el.offsetParent !== null);
}

const delay = (ms, signal) => new Promise(resolve => {
    if (signal.aborted) return resolve(false);
    const finish = value => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        resolve(value);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), ms);
    signal.addEventListener('abort', abort, { once: true });
});

async function waitForConnection(run, signal) {
    if (!await delay(CONNECT_START_DELAY_MS, signal)) return false;
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;
    while (isConnecting() && Date.now() < deadline) {
        if (run !== reconcileRun) {
            return false;
        }
        if (!await delay(CONNECT_POLL_MS, signal)) return false;
    }
    return run === reconcileRun && api.isEnabled();
}

async function setModel(model, isCurrent) {
    const { SlashCommandParser } = SillyTavern.getContext();
    const command = SlashCommandParser?.commands?.model;
    if (!command) {
        throw new Error('The /model command is not available');
    }
    await command.callback({ quiet: 'true' }, model);
    if (!isCurrent()) return;

    // /model only fills the Custom endpoint's model ID box; show the pick in its model list too.
    const customList = document.getElementById('model_custom_select');
    if (customList instanceof HTMLSelectElement && getCurrentEndpoint().type === 'custom'
        && Array.from(customList.options).some(o => o.value === model)) {
        customList.value = model;
    }
}

async function onProfileLoaded(profileName) {
    cancelReconcile();
    const run = reconcileRun;
    if (!api.isEnabled()) {
        return;
    }

    const profile = findLoadedProfile(profileName);
    if (!profile || String(profile.model ?? '').trim()) {
        return;
    }

    reconcileController = new AbortController();
    if (!await waitForConnection(run, reconcileController.signal)) {
        return;
    }

    const endpoint = getCurrentEndpoint();
    const current = () => run === reconcileRun && api.isEnabled()
        && getCurrentEndpoint().key === endpoint.key && findLoadedProfile(profileName) === profile
        && (!SillyTavern.getContext().extensionSettings.connectionManager?.selectedProfile
            || SillyTavern.getContext().extensionSettings.connectionManager.selectedProfile === profile.id);
    const { control, available } = getModelState();
    if (!control) {
        return;
    }

    const remembered = api.settings.endpoints[endpoint.key]?.model ?? '';
    const decision = decideModel({ wanted: profile.model, current: control.value, available, remembered });
    console.debug(LOG_PREFIX, `Profile "${profile.name}" on ${endpoint.label}:`, decision);

    if (decision.action !== 'restore') {
        return;
    }

    try {
        if (!current()) return;
        if (decision.changed) {
            await setModel(decision.model, current);
        }
    } catch (error) {
        console.error(LOG_PREFIX, 'Failed to set model', error);
        return;
    }

    if (!current()) return;

    let saved = false;
    if (api.settings.saveToProfile) {
        profile.model = decision.model;
        api.save();
        saved = true;
    }
    if (api.settings.notify && (decision.changed || saved)) {
        toastr.success(
            `No model saved in this profile. Using last model for this endpoint: ${decision.model}${saved ? ' (saved to profile)' : ''}`,
            `Profile: ${profile.name}`,
        );
    }
}

function onGenerationStarted(_type, _options, dryRun) {
    if (!dryRun) {
        rememberCurrentModel('generation');
    }
}

function onUserPickedModel(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !WATCHED_IDS.has(target.id)) {
        return;
    }
    // Only user picks: programmatic changes come from profile loads and list refreshes.
    if (event.type === 'change' && !event.isTrusted) {
        return;
    }
    // Custom endpoints mirror the picked list item into the model ID input afterwards.
    if (rememberTimer !== null) clearTimeout(rememberTimer);
    rememberTimer = setTimeout(() => { rememberTimer = null; rememberCurrentModel('user pick'); }, 0);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);
}

function renderEndpointList() {
    const container = document.getElementById('thread_tools_endpoints');
    if (!container) {
        return;
    }
    const entries = Object.entries(api.settings.endpoints)
        .sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    if (!entries.length) {
        container.innerHTML = '<div class="thread_tools_hint">No models remembered yet. Generate once on an endpoint, or pick a model, to remember it.</div>';
        return;
    }

    container.innerHTML = entries.map(([key, entry]) => `
        <div class="thread_tools_endpoint" data-key="${escapeHtml(key)}">
            <div class="thread_tools_endpoint_text">
                <div class="thread_tools_endpoint_url" title="${escapeHtml(entry.api ?? '')}">${escapeHtml(entry.label ?? key)}</div>
                <div class="thread_tools_endpoint_model">${escapeHtml(entry.model)}</div>
            </div>
            <div class="menu_button menu_button_icon thread_tools_forget fa-solid fa-trash-can" title="Forget this endpoint"></div>
        </div>`).join('');
}

/** @type {import('../../core.js').Feature} */
export default {
    id: 'profileModelMemory',
    title: 'Profile model memory',
    description: 'When a connection profile with no model saved loads, switch to the model you last used with that endpoint URL. Profiles that have a model saved are left alone.',
    defaults: {
        notify: true,
        saveToProfile: false,
        endpoints: {},
    },

    renderSettings(container, featureApi) {
        const { settings, save } = featureApi;
        container.innerHTML = `
            <label class="checkbox_label">
                <input type="checkbox" data-setting="saveToProfile" />
                <span>Also save the restored model into the profile</span>
            </label>
            <label class="checkbox_label">
                <input type="checkbox" data-setting="notify" />
                <span>Show a notification when a model is restored</span>
            </label>
            <div class="thread_tools_list_header">
                <span>Remembered endpoints</span>
                <div class="menu_button menu_button_icon thread_tools_clear" title="Forget all endpoints">
                    <i class="fa-solid fa-broom"></i><span>Clear</span>
                </div>
            </div>
            <div id="thread_tools_endpoints" class="thread_tools_endpoints"></div>`;

        for (const input of container.querySelectorAll('input[data-setting]')) {
            const key = input.getAttribute('data-setting');
            input.checked = !!settings[key];
            input.addEventListener('change', () => {
                settings[key] = input.checked;
                save();
            });
        }

        $(container).on('click', '.thread_tools_forget', function () {
            delete settings.endpoints[String($(this).closest('.thread_tools_endpoint').data('key'))];
            save();
            renderEndpointList();
        });
        $(container).on('click', '.thread_tools_clear', () => {
            settings.endpoints = {};
            save();
            renderEndpointList();
        });
    },

    init(featureApi) {
        unsubscribe?.();
        cancelReconcile();
        api = featureApi;
        if (!api.settings.endpoints || typeof api.settings.endpoints !== 'object') {
            api.settings.endpoints = {};
        }
        renderEndpointList();

        const { eventSource, event_types } = SillyTavern.getContext();
        eventSource.on(event_types.CONNECTION_PROFILE_LOADED, onProfileLoaded);
        eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);
        document.addEventListener('change', onUserPickedModel, true);
        $(document).on('select2:select', onUserPickedModel);
        unsubscribe = () => {
            const off = eventSource.removeListener || eventSource.off;
            off?.call(eventSource, event_types.CONNECTION_PROFILE_LOADED, onProfileLoaded);
            off?.call(eventSource, event_types.GENERATION_STARTED, onGenerationStarted);
            document.removeEventListener('change', onUserPickedModel, true);
            $(document).off('select2:select', onUserPickedModel);
        };
    },

    onToggle(enabled) { if (!enabled) cancelReconcile(); },
    dispose() {
        cancelReconcile();
        unsubscribe?.();
        unsubscribe = null;
    },
};
