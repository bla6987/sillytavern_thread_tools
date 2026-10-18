import { initFeatures, registerFeature } from './src/core.js';
import profileModelMemory from './src/features/profile-model-memory/index.js';
import profileEditor from './src/features/profile-editor/index.js';

// Each feature gets its own section in the Thread Tools settings panel.
// To add one: create src/features/<name>/index.js exporting a Feature, and register it here.
registerFeature(profileModelMemory);
registerFeature(profileEditor);

jQuery(() => initFeatures());
