import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findModel, normalizeEndpointUrl } from '../src/endpoint-url.js';

test('normalizes cosmetic URL differences to one key', () => {
    for (const url of [
        'http://127.0.0.1:8000',
        'http://localhost:8000/',
        'HTTP://LOCALHOST:8000/v1',
        'https://localhost:8000/v1/',
        '  http://0.0.0.0:8000//  ',
    ]) {
        assert.equal(normalizeEndpointUrl(url), '127.0.0.1:8000', url);
    }
    assert.equal(normalizeEndpointUrl('https://api.example.com/openai/v1'), 'api.example.com/openai');
    assert.equal(normalizeEndpointUrl('http://localhostish:1234'), 'localhostish:1234');
    assert.equal(normalizeEndpointUrl(''), '');
    assert.equal(normalizeEndpointUrl(null), '');
});

test('finds models ignoring case and whitespace', () => {
    assert.equal(findModel(['Alpha', 'beta'], ' alpha '), 'Alpha');
    assert.equal(findModel(['Alpha'], 'gamma'), null);
    assert.equal(findModel(['Alpha'], ''), null);
});
