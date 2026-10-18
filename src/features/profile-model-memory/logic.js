import { findModel } from '../../endpoint-url.js';

/**
 * Decides which model a freshly loaded profile should end up on. Profiles that
 * already have a model saved are left alone; only profiles without one get the
 * model last used with their endpoint.
 * @param {object} state
 * @param {string} state.wanted Model saved in the profile
 * @param {string} state.current Model currently selected in the UI
 * @param {string[]} state.available Models the endpoint offers (empty if unknown)
 * @param {string} state.remembered Last model used with this endpoint
 * @returns {{ action: 'none'|'restore', model?: string, changed?: boolean, reason: string }}
 */
export function decideModel({ wanted, current, available, remembered }) {
    wanted = String(wanted ?? '').trim();
    current = String(current ?? '').trim();
    remembered = String(remembered ?? '').trim();

    if (wanted) {
        return { action: 'none', reason: 'profile-has-model' };
    }
    if (!remembered) {
        return { action: 'none', reason: 'nothing-remembered' };
    }

    // Without a model list we can't check the remembered model, so trust it.
    const model = available.length ? findModel(available, remembered) : remembered;
    if (!model) {
        return { action: 'none', reason: 'remembered-model-unavailable' };
    }
    return { action: 'restore', model, changed: model !== current, reason: 'profile-has-no-model' };
}
