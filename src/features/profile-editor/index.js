import { LOG_PREFIX } from '../../core.js';
import { findModel } from '../../endpoint-url.js';
import { fetchEndpointModels } from '../../connection.js';
import {
    FIELD_LABELS,
    applyProfileEdits,
    diffProfiles,
    getApiKeysForMode,
    getFieldsForMode,
    validateProfileName,
} from './logic.js';

const TOOLBAR_BUTTON_ID = 'thread_tools_profile_editor_button';

// Fields picked from a fixed list; the values come from SillyTavern's own slash command definitions.
const SELECT_FIELDS = new Set(['api', 'preset', 'proxy', 'sysprompt', 'instruct', 'context', 'tokenizer', 'reasoning-template', 'prompt-post-processing', 'regex-preset', 'sysprompt-state', 'instruct-state']);
// Commands whose enum description is a friendlier label than the value itself.
const DESCRIPTION_LABELS = new Set(['regex-preset', 'tokenizer', 'prompt-post-processing']);

/** @type {import('../../core.js').FeatureApi} */
let api;

function getProfiles() {
    const manager = SillyTavern.getContext().extensionSettings.connectionManager;
    return Array.isArray(manager?.profiles) ? manager.profiles : [];
}

function getSelectedProfileId() {
    return SillyTavern.getContext().extensionSettings.connectionManager?.selectedProfile ?? '';
}

/**
 * Reads the values a slash command accepts.
 * @param {string} command Command name
 * @returns {{ value: string, label: string }[]}
 */
function getCommandOptions(command) {
    const arg = SillyTavern.getContext().SlashCommandParser?.commands?.[command]?.unnamedArgumentList?.[0];
    let values = [];
    try {
        values = arg?.enumList?.length ? arg.enumList : (arg?.enumProvider?.() ?? []);
    } catch (error) {
        console.debug(LOG_PREFIX, `No options for /${command}`, error);
    }
    return values
        .map(v => typeof v === 'string'
            ? { value: v, label: v }
            : { value: String(v.value ?? ''), label: String((DESCRIPTION_LABELS.has(command) && v.description) || v.value || '') })
        .filter(v => v.value);
}

function getCurrentApiKey() {
    try {
        return String(SillyTavern.getContext().SlashCommandParser.commands.api.callback({ quiet: 'true' }, '') ?? '');
    } catch {
        return '';
    }
}

/**
 * @param {string} key Field name
 * @param {string} mode Profile mode
 * @returns {{ value: string, label: string }[]}
 */
function getFieldOptions(key, mode) {
    const context = SillyTavern.getContext();
    switch (key) {
        case 'api':
            return getApiKeysForMode(context.CONNECT_API_MAP, mode).map(value => ({ value, label: value }));
        case 'preset': {
            const manager = context.getPresetManager?.(mode === 'cc' ? 'openai' : 'textgenerationwebui');
            return (manager?.getAllPresets?.() ?? []).map(value => ({ value, label: value }));
        }
        case 'sysprompt-state':
        case 'instruct-state':
            return [{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }];
        default:
            return getCommandOptions(key);
    }
}

function createSelect(key, mode, value) {
    const select = document.createElement('select');
    select.className = 'text_pole';
    const options = getFieldOptions(key, mode);
    if (value && !options.some(o => o.value === value)) {
        options.unshift({ value, label: `${value} (not found)` });
    }
    if (!value) {
        options.unshift({ value: '', label: '—' });
    }
    for (const option of options) {
        select.append(new Option(option.label, option.value, false, option.value === value));
    }
    return select;
}

function createDatalistInput(id, values) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text_pole';
    const list = document.createElement('datalist');
    list.id = id;
    for (const value of values) {
        list.append(new Option(value, value));
    }
    input.setAttribute('list', id);
    return { input, list };
}

/**
 * Builds the input for one field.
 * @returns {{ element: HTMLElement, control: HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement }}
 */
function createControl(key, profile) {
    const value = profile[key] === undefined ? '' : String(profile[key]);

    if (SELECT_FIELDS.has(key)) {
        const select = createSelect(key, profile.mode, value);
        return { element: select, control: select };
    }

    if (key === 'start-reply-with') {
        const textarea = document.createElement('textarea');
        textarea.className = 'text_pole textarea_compact';
        textarea.rows = 2;
        textarea.value = value;
        return { element: textarea, control: textarea };
    }

    if (key === 'model') {
        const wrapper = document.createElement('div');
        wrapper.className = 'thread_tools_pe_model';
        const { input, list } = createDatalistInput('thread_tools_pe_models', []);
        input.value = value;
        const refresh = document.createElement('div');
        refresh.className = 'menu_button menu_button_icon fa-solid fa-rotate thread_tools_pe_fetch';
        refresh.title = 'Load the model list from this profile\'s endpoint';
        const status = document.createElement('div');
        status.className = 'thread_tools_hint thread_tools_pe_model_status';
        wrapper.append(input, refresh, list, status);
        return { element: wrapper, control: input };
    }

    if (key === 'secret-id') {
        // Secrets are listed for the active API only, so only suggest them when the profile uses it.
        const secrets = profile.api && profile.api === getCurrentApiKey() ? getCommandOptions('secret-id').map(x => x.value) : [];
        const { input, list } = createDatalistInput('thread_tools_pe_secrets', secrets);
        input.value = value;
        const wrapper = document.createElement('div');
        wrapper.append(input, list);
        return { element: wrapper, control: input };
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text_pole';
    input.value = value;
    if (key === 'api-url') {
        input.placeholder = 'http://127.0.0.1:5000';
    }
    if (key === 'stop-strings') {
        input.placeholder = '["\\n\\n"]';
    }
    return { element: input, control: input };
}

/**
 * The editor form for one profile.
 */
class ProfileForm {
    /** @param {Record<string, any>} profile */
    constructor(profile) {
        this.profile = profile;
        this.dirty = false;
        this.root = document.createElement('div');
        this.root.className = 'thread_tools_pe_form';
        /** @type {Map<string, { include: HTMLInputElement, control: HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement }>} */
        this.rows = new Map();
        this.modelsLoaded = false;
        this.render();
    }

    render() {
        const { profile } = this;
        const exclude = Array.isArray(profile.exclude) ? profile.exclude : [];

        const nameRow = document.createElement('label');
        nameRow.className = 'thread_tools_pe_name';
        nameRow.innerHTML = '<span>Name</span>';
        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.className = 'text_pole';
        this.nameInput.value = profile.name ?? '';
        nameRow.append(this.nameInput);

        const mode = document.createElement('div');
        mode.className = 'thread_tools_hint';
        mode.textContent = `${profile.mode === 'cc' ? 'Chat Completion' : 'Text Completion'} profile. Untick a setting to leave it out of the profile.`;

        const fields = document.createElement('div');
        fields.className = 'thread_tools_pe_fields';

        for (const key of getFieldsForMode(profile.mode)) {
            const row = document.createElement('div');
            row.className = 'thread_tools_pe_row';
            row.dataset.key = key;

            const label = document.createElement('label');
            label.className = 'checkbox_label';
            const include = document.createElement('input');
            include.type = 'checkbox';
            include.checked = profile[key] !== undefined && !exclude.includes(key);
            const text = document.createElement('span');
            text.textContent = FIELD_LABELS[key] ?? key;
            if (exclude.includes(key)) {
                text.title = 'Excluded from this profile';
            }
            label.append(include, text);

            const { element, control } = createControl(key, profile);
            const syncDisabled = () => {
                control.disabled = !include.checked;
                row.classList.toggle('thread_tools_pe_row_off', !include.checked);
            };
            include.addEventListener('change', syncDisabled);
            syncDisabled();

            row.append(label, element);
            fields.append(row);
            this.rows.set(key, { include, control });
        }

        this.root.append(nameRow, mode, fields);
        this.root.addEventListener('input', () => this.dirty = true);
        this.root.addEventListener('change', () => this.dirty = true);

        const model = this.rows.get('model');
        const fetchButton = this.root.querySelector('.thread_tools_pe_fetch');
        model?.control.addEventListener('focus', () => !this.modelsLoaded && this.loadModels());
        model?.control.addEventListener('input', () => this.updateModelStatus());
        fetchButton?.addEventListener('click', () => this.loadModels());
        this.updateModelStatus();
        // Changing API or URL changes which models exist.
        for (const key of ['api', 'api-url']) {
            this.rows.get(key)?.control.addEventListener('change', () => {
                this.modelsLoaded = false;
                this.models = undefined;
                this.updateModelStatus();
            });
        }
    }

    getValue(key) {
        return String(this.rows.get(key)?.control.value ?? '');
    }

    async loadModels() {
        const status = this.root.querySelector('.thread_tools_pe_model_status');
        const list = this.root.querySelector('#thread_tools_pe_models');
        if (!status || !list) {
            return;
        }
        this.modelsLoaded = true;
        status.textContent = 'Loading models…';
        const target = {
            mode: this.profile.mode,
            api: this.getValue('api') || this.profile.api,
            url: this.rows.get('api-url')?.include.checked ? this.getValue('api-url') : '',
        };
        const models = await fetchEndpointModels(target);
        list.replaceChildren(...models.map(m => new Option(m, m)));
        this.models = models;
        this.updateModelStatus();
    }

    updateModelStatus() {
        const status = this.root.querySelector('.thread_tools_pe_model_status');
        if (!status) {
            return;
        }
        if (!this.models) {
            status.textContent = 'Click the field or the refresh button to load models from the endpoint.';
            return;
        }
        if (!this.models.length) {
            status.textContent = 'Couldn\'t load a model list from this endpoint.';
            return;
        }
        const value = this.getValue('model').trim();
        const offered = !value || findModel(this.models, value);
        status.textContent = `${this.models.length} models offered by this endpoint.${offered ? '' : ' The model above isn\'t one of them.'}`;
    }

    /** @returns {{ name: string, fields: Record<string, { include: boolean, value: string }> }} */
    collect() {
        const fields = {};
        for (const [key, { include, control }] of this.rows) {
            fields[key] = { include: include.checked, value: control.value };
        }
        return { name: this.nameInput.value, fields };
    }
}

function refreshConnectionManagerUi(profile) {
    const option = document.querySelector(`#connection_profiles option[value="${CSS.escape(profile.id)}"]`);
    if (option) {
        option.textContent = profile.name;
    }
    // Re-render the details view if it's open, by toggling it off and on.
    const view = document.getElementById('view_connection_profile');
    if (view?.classList.contains('active')) {
        view.click();
        view.click();
    }
}

async function saveProfile(profile, updated) {
    const { eventSource, event_types, saveSettingsDebounced } = SillyTavern.getContext();
    const before = structuredClone(profile);
    for (const key of Object.keys(profile)) {
        if (!(key in updated)) {
            delete profile[key];
        }
    }
    Object.assign(profile, updated);
    saveSettingsDebounced();
    await eventSource.emit(event_types.CONNECTION_PROFILE_UPDATED, before, profile);
    refreshConnectionManagerUi(profile);
}

function loadProfile(profile) {
    const select = document.getElementById('connection_profiles');
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }
    select.value = profile.id;
    select.dispatchEvent(new Event('change'));
}

/**
 * Opens the editor popup.
 * @param {string} [profileId] Profile to start with; defaults to the selected one
 */
export async function openProfileEditor(profileId) {
    const context = SillyTavern.getContext();
    const profiles = getProfiles();
    if (!profiles.length) {
        toastr.info('There are no connection profiles yet. Create one in the API Connections panel first.');
        return;
    }

    let profile = profiles.find(p => p.id === (profileId || getSelectedProfileId())) ?? profiles[0];

    const root = document.createElement('div');
    root.className = 'thread_tools_pe';
    root.innerHTML = '<h3>Edit connection profile</h3><div class="thread_tools_hint">Edit any profile without switching to it.</div>';

    const picker = document.createElement('select');
    picker.className = 'text_pole thread_tools_pe_picker';
    for (const p of [...profiles].sort((a, b) => a.name.localeCompare(b.name))) {
        const isActive = p.id === getSelectedProfileId();
        picker.append(new Option(isActive ? `${p.name} (active)` : p.name, p.id, false, p.id === profile.id));
    }
    const pickerRow = document.createElement('label');
    pickerRow.className = 'thread_tools_pe_name';
    pickerRow.innerHTML = '<span>Profile</span>';
    pickerRow.append(picker);

    const formHost = document.createElement('div');
    root.append(pickerRow, formHost);

    let form = new ProfileForm(profile);
    formHost.append(form.root);

    picker.addEventListener('change', async () => {
        const next = profiles.find(p => p.id === picker.value);
        if (!next) {
            return;
        }
        if (form.dirty) {
            const discard = await context.callGenericPopup(`Discard unsaved changes to "${profile.name}"?`, context.POPUP_TYPE.CONFIRM);
            if (!discard) {
                picker.value = profile.id;
                return;
            }
        }
        profile = next;
        form = new ProfileForm(profile);
        formHost.replaceChildren(form.root);
    });

    /** @type {Record<string, any>|null} */
    let updated = null;
    const popup = new context.Popup(root, context.POPUP_TYPE.TEXT, '', {
        okButton: 'Save',
        cancelButton: 'Cancel',
        customButtons: [{ text: 'Save & load', result: context.POPUP_RESULT.CUSTOM1, classes: ['popup-button-ok'] }],
        wide: true,
        allowVerticalScrolling: true,
        onClosing: (p) => {
            if (p.result !== context.POPUP_RESULT.AFFIRMATIVE && p.result !== context.POPUP_RESULT.CUSTOM1) {
                return true;
            }
            const edits = form.collect();
            const error = validateProfileName(edits.name, profiles, profile.id);
            if (error) {
                toastr.error(error);
                return false;
            }
            updated = applyProfileEdits(profile, edits);
            return true;
        },
    });

    const result = await popup.show();
    if (!updated) {
        return;
    }

    const changed = diffProfiles(profile, updated);
    await saveProfile(profile, updated);
    const andLoad = result === context.POPUP_RESULT.CUSTOM1;

    if (andLoad) {
        loadProfile(profile);
    }

    if (changed.length || andLoad) {
        const isActive = profile.id === getSelectedProfileId();
        const note = isActive && !andLoad ? ' It\'s the active profile: reload it to apply the changes.' : '';
        toastr.success(`Saved "${profile.name}".${note}`);
    }
}

function addToolbarButton() {
    if (document.getElementById(TOOLBAR_BUTTON_ID)) {
        return;
    }
    const anchor = document.getElementById('edit_connection_profile');
    if (!anchor) {
        return;
    }
    const button = document.createElement('i');
    button.id = TOOLBAR_BUTTON_ID;
    button.className = 'menu_button fa-solid fa-sliders';
    button.title = 'Edit any connection profile without switching to it (Thread Tools)';
    button.addEventListener('click', () => openProfileEditor());
    anchor.after(button);
}

function removeToolbarButton() {
    document.getElementById(TOOLBAR_BUTTON_ID)?.remove();
}

/** @type {import('../../core.js').Feature} */
export default {
    id: 'profileEditor',
    title: 'Profile editor',
    description: 'Edit the settings saved in any connection profile (model, server URL, presets, templates, …) without switching to it. Opens from the sliders button next to the connection profile list, or from here.',

    renderSettings(container) {
        const button = document.createElement('div');
        button.className = 'menu_button menu_button_icon';
        button.innerHTML = '<i class="fa-solid fa-sliders"></i><span>Open profile editor</span>';
        button.addEventListener('click', () => {
            if (!api.isEnabled()) {
                toastr.info('Turn on the profile editor first.');
                return;
            }
            openProfileEditor();
        });
        container.append(button);
    },

    init(featureApi) {
        api = featureApi;
        // The connection manager builds its toolbar during startup; wait for the app to be ready.
        const { eventSource, event_types } = SillyTavern.getContext();
        const place = () => api.isEnabled() && addToolbarButton();
        place();
        eventSource.on(event_types.APP_READY, place);
    },

    onToggle(enabled) {
        enabled ? addToolbarButton() : removeToolbarButton();
    },
};

