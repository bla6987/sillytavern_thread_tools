import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideModel } from '../src/features/profile-model-memory/logic.js';

test('leaves profiles that have a model alone, even if the endpoint lacks it', () => {
    assert.deepEqual(
        decideModel({ wanted: 'llama-3', current: 'llama-3', available: ['qwen', 'llama-3'], remembered: 'qwen' }),
        { action: 'none', reason: 'profile-has-model' },
    );
    assert.deepEqual(
        decideModel({ wanted: 'retired', current: 'first', available: ['first', 'b'], remembered: 'b' }),
        { action: 'none', reason: 'profile-has-model' },
    );
});

test('restores the remembered model when the profile has no model', () => {
    assert.deepEqual(
        decideModel({ wanted: '', current: 'a', available: ['a', 'B'], remembered: 'b' }),
        { action: 'restore', model: 'B', changed: true, reason: 'profile-has-no-model' },
    );
    assert.deepEqual(
        decideModel({ wanted: '  ', current: 'b', available: ['a', 'b'], remembered: 'b' }),
        { action: 'restore', model: 'b', changed: false, reason: 'profile-has-no-model' },
    );
});

test('does nothing when there is nothing usable to restore', () => {
    assert.deepEqual(
        decideModel({ wanted: '', current: 'a', available: ['a'], remembered: 'gone' }),
        { action: 'none', reason: 'remembered-model-unavailable' },
    );
    assert.deepEqual(
        decideModel({ wanted: '', current: 'a', available: ['a'], remembered: '' }),
        { action: 'none', reason: 'nothing-remembered' },
    );
});

test('trusts the remembered model when the endpoint has no model list', () => {
    assert.deepEqual(
        decideModel({ wanted: '', current: '', available: [], remembered: 'x' }),
        { action: 'restore', model: 'x', changed: true, reason: 'profile-has-no-model' },
    );
});
