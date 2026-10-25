import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestSlot } from '../src/request-lifecycle.js';
import { ProfileForm } from '../src/features/profile-editor/index.js';
import { fetchEndpointModels } from '../src/connection.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('same-key work shares one request, endpoint changes abort and reject stale results', async () => {
    const slot = new RequestSlot();
    const first = deferred(), second = deferred();
    const applied = [];
    let requests = 0, oldSignal;
    const a = slot.run('one', signal => { requests++; oldSignal = signal; return first.promise; }, value => applied.push(value));
    assert.equal(slot.run('one', () => { throw new Error('duplicate request'); }, () => {}), a);
    const b = slot.run('two', () => { requests++; return second.promise; }, value => applied.push(value));
    assert.equal(oldSignal.aborted, true);
    second.resolve('new'); await b;
    first.resolve('old'); await a;
    assert.equal(requests, 2);
    assert.deepEqual(applied, ['new']);
    assert.equal(slot.pending, null);
});

test('disposing an owner cancels requests even if their transport ignores abort', async () => {
    const slot = new RequestSlot();
    const response = deferred();
    let signal, applied = false;
    const work = slot.run('models', s => { signal = s; return response.promise; }, () => applied = true);
    slot.dispose();
    assert.equal(signal.aborted, true);
    response.resolve(['late']); await work;
    assert.equal(applied, false);
    assert.equal(slot.pending, null);
    await slot.run('again', () => { throw new Error('disposed owner restarted'); }, () => {});
});

function modelContext() {
    globalThis.SillyTavern = { getContext: () => ({
        CONNECT_API_MAP: { custom: { source: 'custom' } },
        chatCompletionSettings: { custom_url: 'https://default.example/v1' },
        getRequestHeaders: () => ({}),
    }) };
}

test('profile form single-flight load, replacement and popup disposal preserve the newest list', async () => {
    modelContext();
    globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
    const pending = [];
    globalThis.fetch = (_url, init) => {
        const response = deferred(); pending.push({ ...response, signal: init.signal }); return response.promise;
    };
    const list = { children: [], replaceChildren() { this.children = []; }, append(option) { this.children.push(option); } };
    const status = { textContent: '' };
    const form = Object.create(ProfileForm.prototype);
    Object.assign(form, { profile: { mode: 'cc', api: 'custom' }, modelRequest: new RequestSlot(), disposed: false,
        root: { querySelector: selector => selector.includes('models') ? list : status },
        rows: new Map([['api', { control: { value: 'custom' } }],
            ['api-url', { control: { value: 'https://first.example/v1' }, include: { checked: true } }],
            ['model', { control: { value: '' } }]]),
    });
    const first = form.loadModels(), duplicate = form.loadModels();
    assert.equal(pending.length, 1);
    form.modelRequest.cancel();
    form.rows.get('api-url').control.value = 'https://second.example/v1';
    const second = form.loadModels();
    pending[1].resolve({ ok: true, json: async () => ({ data: [{ id: 'new-model' }] }) });
    await second;
    pending[0].resolve({ ok: true, json: async () => ({ data: [{ id: 'stale-model' }] }) });
    await Promise.all([first, duplicate]);
    assert.deepEqual(list.children.map(option => option.value), ['new-model']);
    assert.equal(pending[0].signal.aborted, true);
    const closing = form.loadModels();
    form.dispose();
    assert.equal(pending[2].signal.aborted, true);
    pending[2].resolve({ ok: true, json: async () => ({ data: [{ id: 'closed-model' }] }) });
    await closing;
    assert.equal(list.children.length, 0);
    assert.equal(form.models, undefined);
});

test('model endpoint transport aborts on timeout and does not substitute a stale DOM list', async () => {
    modelContext();
    globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    await assert.rejects(fetchEndpointModels({ mode: 'cc', api: 'custom' }, { timeoutMs: 5 }), { name: 'TimeoutError' });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(fetchEndpointModels({ mode: 'cc', api: 'custom' }, { signal: controller.signal }), { name: 'AbortError' });
});

test('profile-memory replacement, disabling and disposal release polling and subscriptions', async () => {
    const { default: feature } = await import('../src/features/profile-model-memory/index.js');
    const originals = new Map(['setTimeout', 'clearTimeout', 'document', '$', 'SillyTavern', 'HTMLElement'].map(key => [key, globalThis[key]]));
    const timers = new Map(), events = new Map(), domListeners = new Set(), jqListeners = new Set();
    let next = 0, enabled = true;
    globalThis.setTimeout = callback => { timers.set(++next, callback); return next; };
    globalThis.clearTimeout = id => timers.delete(id);
    globalThis.HTMLElement = class {};
    globalThis.document = { getElementById: () => null, querySelectorAll: () => [],
        addEventListener: (_type, fn) => domListeners.add(fn), removeEventListener: (_type, fn) => domListeners.delete(fn) };
    globalThis.$ = () => ({ on: (_type, fn) => jqListeners.add(fn), off: (_type, fn) => jqListeners.delete(fn) });
    const profiles = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const context = { extensionSettings: { connectionManager: { profiles, selectedProfile: 'a' } },
        event_types: { CONNECTION_PROFILE_LOADED: 'profile', GENERATION_STARTED: 'generation' },
        eventSource: {
            on(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
            removeListener(type, fn) { events.get(type)?.delete(fn); },
        } };
    globalThis.SillyTavern = { getContext: () => context };
    const api = { settings: { endpoints: {} }, isEnabled: () => enabled, save() {} };
    try {
        feature.init(api);
        const onProfile = [...events.get('profile')][0];
        const first = onProfile('A');
        assert.equal(timers.size, 1);
        context.extensionSettings.connectionManager.selectedProfile = 'b';
        const second = onProfile('B');
        await first;
        assert.equal(timers.size, 1, 'replacement releases the old polling timer');
        enabled = false; feature.onToggle(false); await second;
        assert.equal(timers.size, 0);
        feature.init(api);
        assert.equal(events.get('profile').size, 1);
        assert.equal(domListeners.size, 1); assert.equal(jqListeners.size, 1);
        enabled = true;
        const closing = [...events.get('profile')][0]('B');
        feature.dispose(); await closing;
        assert.equal(timers.size, 0);
        assert.equal(events.get('profile').size, 0); assert.equal(events.get('generation').size, 0);
        assert.equal(domListeners.size, 0); assert.equal(jqListeners.size, 0);
    } finally {
        feature.dispose();
        for (const [key, value] of originals) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    }
});
