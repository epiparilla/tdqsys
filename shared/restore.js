'use strict';
const { ensureInstanceId, ensureCloudWriterToken, normalizeConfig, defaultConfig } = require('./config');

function prepareRestoredState(source, destination) {
    if (!source || !source.config || !source.queues) throw new Error('Backup does not contain valid queue data.');
    const restored = JSON.parse(JSON.stringify(source));
    const identity = { ...(destination?.config || {}) };
    ensureInstanceId(identity); ensureCloudWriterToken(identity);
    restored.config.instanceId = identity.instanceId;
    restored.config.cloudWriterToken = identity.cloudWriterToken;
    // Product-specific connections stay with this installation, not a v1 backup.
    restored.config.cloudBase = identity.cloudBase || defaultConfig().cloudBase;
    restored.config.ttsPort = identity.ttsPort || defaultConfig().ttsPort;
    normalizeConfig(restored.config);
    return restored;
}
module.exports = { prepareRestoredState };
