import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyProfileEdits,
    diffProfiles,
    getApiKeysForMode,
    validateProfileName,
} from '../src/features/profile-editor/logic.js';

const baseProfile = {
    id: 'p1',
    mode: 'cc',
    name: 'Local',
    api: 'custom',
    'api-url': 'http://127.0.0.1:5000/v1',
    model: 'alpha',
    preset: 'Default',
    'start-reply-with': '',
    exclude: ['proxy'],
};

const field = (value, include = true) => ({ include, value });

test('updates values, renames, and does not touch the original', () => {
    const original = structuredClone(baseProfile);
    const next = applyProfileEdits(baseProfile, {
        name: '  Local 2 ',
        fields: { model: field('beta'), 'api-url': field(' http://10.0.0.2:5000/v1 ') },
    });
    assert.equal(next.name, 'Local 2');
    assert.equal(next.model, 'beta');
    assert.equal(next['api-url'], 'http://10.0.0.2:5000/v1');
    assert.equal(next.id, 'p1');
    assert.deepEqual(baseProfile, original);
});

test('unticking a field removes it and excludes it if the profile had it', () => {
    const next = applyProfileEdits(baseProfile, {
        name: 'Local',
        fields: { model: field('alpha', false), 'reasoning-template': field('', false) },
    });
    assert.equal('model' in next, false);
    assert.deepEqual(next.exclude.sort(), ['model', 'proxy']);
});

test('ticking an excluded field adds it back and un-excludes it', () => {
    const next = applyProfileEdits(baseProfile, { name: 'Local', fields: { proxy: field('My proxy') } });
    assert.equal(next.proxy, 'My proxy');
    assert.deepEqual(next.exclude, []);
});

test('empty values: dropped for normal fields, kept where empty means "clear it"', () => {
    const next = applyProfileEdits(baseProfile, {
        name: 'Local',
        fields: { preset: field('   '), 'start-reply-with': field(''), 'stop-strings': field('') },
    });
    assert.equal('preset' in next, false);
    assert.equal(next['start-reply-with'], '');
    assert.equal(next['stop-strings'], '');
});

test('start-reply-with keeps its whitespace', () => {
    const next = applyProfileEdits(baseProfile, { name: 'Local', fields: { 'start-reply-with': field(' <think>\n') } });
    assert.equal(next['start-reply-with'], ' <think>\n');
});

test('ignores fields that do not belong to the profile mode', () => {
    const next = applyProfileEdits(baseProfile, { name: 'Local', fields: { instruct: field('Alpaca') } });
    assert.equal('instruct' in next, false);
});

test('validates names', () => {
    const profiles = [{ id: 'p1', name: 'Local' }, { id: 'p2', name: 'Remote' }];
    assert.equal(validateProfileName('Local', profiles, 'p1'), '');
    assert.equal(validateProfileName(' ', profiles, 'p1'), 'Name cannot be empty.');
    assert.equal(validateProfileName('Remote', profiles, 'p1'), 'A profile with the same name already exists.');
});

test('lists one API key per source for the profile mode', () => {
    const map = {
        kobold: { selected: 'kobold' },
        koboldcpp: { selected: 'textgenerationwebui', type: 'koboldcpp' },
        kcpp: { selected: 'textgenerationwebui', type: 'koboldcpp' },
        vllm: { selected: 'textgenerationwebui', type: 'vllm' },
        openai: { selected: 'openai', source: 'openai' },
        oai: { selected: 'openai', source: 'openai' },
        custom: { selected: 'openai', source: 'custom' },
    };
    assert.deepEqual(getApiKeysForMode(map, 'tc'), ['koboldcpp', 'vllm']);
    assert.deepEqual(getApiKeysForMode(map, 'cc'), ['openai', 'custom']);
});

test('diffs changed fields', () => {
    const next = { ...baseProfile, name: 'X', model: 'beta' };
    assert.deepEqual(diffProfiles(baseProfile, next), ['name', 'model']);
});
