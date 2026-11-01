'use strict';
const { ensureInstanceId, ensureCloudWriterToken, normalizeConfig } = require('./config');

function prepareRestoredState(source, destination) {
    if (!source || !source.config || !source.queues) throw new Error('Backup does not contain valid queue data.');
    const restored = JSON.parse(JSON.stringify(source));
    const identity = { ...(destination?.config || {}) };
    ensureInstanceId(identity); ensureCloudWriterToken(identity);
    restored.config.instanceId = identity.instanceId;
    restored.config.cloudWriterToken = identity.cloudWriterToken;
    normalizeConfig(restored.config);
    return restored;
}
module.exports = { prepareRestoredState };
