import { normalizeEndpointUrl } from './endpoint-url.js';

// Mirrors getModelOptions() in SillyTavern's slash-commands.js. `list` names a
// separate element holding the endpoint's model list when `id` is a free-text input.
export const MODEL_CONTROLS = [
    { id: 'generic_model_textgenerationwebui', api: 'textgenerationwebui', type: 'generic' },
    { id: 'custom_model_textgenerationwebui', api: 'textgenerationwebui', type: 'ooba' },
    { id: 'model_togetherai_select', api: 'textgenerationwebui', type: 'togetherai' },
    { id: 'openrouter_model', api: 'textgenerationwebui', type: 'openrouter' },
    { id: 'model_infermaticai_select', api: 'textgenerationwebui', type: 'infermaticai' },
    { id: 'model_dreamgen_select', api: 'textgenerationwebui', type: 'dreamgen' },
    { id: 'mancer_model', api: 'textgenerationwebui', type: 'mancer' },
    { id: 'vllm_model', api: 'textgenerationwebui', type: 'vllm' },
    { id: 'aphrodite_model', api: 'textgenerationwebui', type: 'aphrodite' },
    { id: 'ollama_model', api: 'textgenerationwebui', type: 'ollama' },
    { id: 'tabby_model', api: 'textgenerationwebui', type: 'tabby' },
    { id: 'llamacpp_model', api: 'textgenerationwebui', type: 'llamacpp' },
    { id: 'featherless_model', api: 'textgenerationwebui', type: 'featherless' },
    { id: 'model_openai_select', api: 'openai', type: 'openai' },
    { id: 'model_claude_select', api: 'openai', type: 'claude' },
    { id: 'model_openrouter_select', api: 'openai', type: 'openrouter' },
    { id: 'model_ai21_select', api: 'openai', type: 'ai21' },
    { id: 'model_google_select', api: 'openai', type: 'makersuite' },
    { id: 'model_vertexai_select', api: 'openai', type: 'vertexai' },
    { id: 'model_mistralai_select', api: 'openai', type: 'mistralai' },
    { id: 'custom_model_id', list: 'model_custom_select', api: 'openai', type: 'custom' },
    { id: 'model_cohere_select', api: 'openai', type: 'cohere' },
    { id: 'model_perplexity_select', api: 'openai', type: 'perplexity' },
    { id: 'model_groq_select', api: 'openai', type: 'groq' },
    { id: 'model_chutes_select', api: 'openai', type: 'chutes' },
    { id: 'model_siliconflow_select', api: 'openai', type: 'siliconflow' },
    { id: 'model_minimax_select', api: 'openai', type: 'minimax' },
    { id: 'model_electronhub_select', api: 'openai', type: 'electronhub' },
    { id: 'model_nanogpt_select', api: 'openai', type: 'nanogpt' },
    { id: 'model_deepseek_select', api: 'openai', type: 'deepseek' },
    { id: 'model_aimlapi_select', api: 'openai', type: 'aimlapi' },
    { id: 'model_xai_select', api: 'openai', type: 'xai' },
    { id: 'model_pollinations_select', api: 'openai', type: 'pollinations' },
    { id: 'model_moonshot_select', api: 'openai', type: 'moonshot' },
    { id: 'model_fireworks_select', api: 'openai', type: 'fireworks' },
    { id: 'model_cometapi_select', api: 'openai', type: 'cometapi' },
    { id: 'model_zai_select', api: 'openai', type: 'zai' },
    { id: 'model_workers_ai_select', api: 'openai', type: 'workers_ai' },
    { id: 'model_novel_select', api: 'novel', type: '' },
    { id: 'horde_model', api: 'koboldhorde', type: '' },
];

/**
 * Describes the endpoint the current connection talks to.
 * @returns {{ api: string, type: string, url: string, key: string, label: string }}
 */
export function getCurrentEndpoint() {
    const context = SillyTavern.getContext();
    const api = String(context.mainApi ?? '');
    let type = '';
    let url = '';

    if (api === 'textgenerationwebui') {
        type = String(context.textCompletionSettings?.type ?? '');
        url = context.textCompletionSettings?.server_urls?.[type] ?? '';
    } else if (api === 'openai') {
        type = String(context.chatCompletionSettings?.chat_completion_source ?? '');
        if (type === 'custom') {
            url = context.chatCompletionSettings?.custom_url ?? '';
        }
    }

    return describeEndpoint(api, type, url);
}

/**
 * Builds the memory key and display label for an endpoint. Endpoints with a URL
 * are keyed by the normalized URL; hosted APIs without one by their API type.
 * @param {string} api Main API (openai, textgenerationwebui, ...)
 * @param {string} type Chat completion source or text completion type
 * @param {string} url Server URL, if any
 */
export function describeEndpoint(api, type, url) {
    const trimmed = String(url ?? '').trim();
    const fallback = type ? `${api}:${type}` : api;
    return {
        api,
        type,
        url: trimmed,
        key: normalizeEndpointUrl(trimmed) || fallback,
        label: trimmed || fallback,
    };
}

function readOptions(element) {
    if (element instanceof HTMLInputElement) {
        element = element.list;
    }
    if (!(element instanceof HTMLSelectElement) && !(element instanceof HTMLDataListElement)) {
        return [];
    }
    const values = Array.from(element.querySelectorAll('option')).map(x => x.value.trim()).filter(Boolean);
    return [...new Set(values)];
}

/**
 * Finds the model control for an API and the models it currently lists.
 * @param {string} [api] Main API; defaults to the current one
 * @param {string} [type] Source/type; defaults to the current one
 * @returns {{ control: HTMLSelectElement|HTMLInputElement|null, available: string[] }}
 */
export function getModelState(api, type) {
    if (api === undefined) {
        ({ api, type } = getCurrentEndpoint());
    }
    const entry = MODEL_CONTROLS.find(x => x.api === api && x.type === type);
    const control = entry ? document.getElementById(entry.id) : null;

    if (!(control instanceof HTMLSelectElement) && !(control instanceof HTMLInputElement)) {
        return { control: null, available: [] };
    }

    const available = readOptions(entry.list ? document.getElementById(entry.list) : control);
    return { control, available };
}

function extractModelIds(data) {
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    const ids = list.map(m => typeof m === 'string' ? m : (m?.id ?? m?.name ?? m?.model ?? '')).map(String).map(x => x.trim()).filter(Boolean);
    return [...new Set(ids)];
}

/**
 * Asks SillyTavern's backend which models an endpoint offers, without
 * changing the active connection.
 * @param {object} target
 * @param {'cc'|'tc'} target.mode Profile mode
 * @param {string} target.api Profile API key (as stored in profiles, e.g. "custom", "vllm")
 * @param {string} [target.url] Server URL from the profile
 * @returns {Promise<string[]>} Model IDs (empty if the endpoint couldn't be queried)
 */
export async function fetchEndpointModels({ mode, api, url }) {
    const context = SillyTavern.getContext();
    const config = context.CONNECT_API_MAP?.[api];
    if (!config) {
        return [];
    }

    let endpoint;
    let body;
    if (mode === 'tc' && config.type) {
        const server = url || context.textCompletionSettings?.server_urls?.[config.type];
        if (!server) {
            return getModelState('textgenerationwebui', config.type).available;
        }
        endpoint = '/api/backends/text-completions/status';
        body = { api_server: server, api_type: config.type };
    } else if (mode === 'cc' && config.source) {
        endpoint = '/api/backends/chat-completions/status';
        body = { chat_completion_source: config.source };
        if (config.source === 'custom') {
            body.custom_url = url || context.chatCompletionSettings?.custom_url || '';
        }
    } else {
        return [];
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify(body),
            cache: 'no-cache',
        });
        if (response.ok) {
            const ids = extractModelIds(await response.json());
            if (ids.length) {
                return ids;
            }
        }
    } catch (error) {
        console.warn('[Thread Tools] Model list request failed', error);
    }

    // Fall back to whatever list SillyTavern already has loaded for that API.
    return getModelState(mode === 'tc' ? 'textgenerationwebui' : 'openai', config.type ?? config.source).available;
}
