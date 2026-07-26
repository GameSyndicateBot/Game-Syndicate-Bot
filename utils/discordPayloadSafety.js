'use strict';

/**
 * Discord rejects a message when any component custom_id is repeated anywhere
 * in the same payload. This guard removes only later exact duplicates while
 * preserving the first working control.
 */
function componentToJSON(component) {
  if (!component) return null;
  if (typeof component.toJSON === 'function') return component.toJSON();
  if (component.data && typeof component.data === 'object') return { ...component.data };
  return { ...component };
}

function sanitizeComponents(components) {
  if (!Array.isArray(components)) return components;

  const seen = new Set();
  const safeRows = [];

  for (const row of components) {
    const rowJson = componentToJSON(row);
    const rawChildren = rowJson?.components || row?.components || row?.data?.components;
    if (!Array.isArray(rawChildren)) {
      safeRows.push(rowJson || row);
      continue;
    }

    const safeChildren = [];
    for (const child of rawChildren) {
      const childJson = componentToJSON(child);
      const customId = childJson?.custom_id;
      if (customId && seen.has(customId)) {
        console.warn(`[Discord Payload Safety] Removed duplicate custom_id: ${customId}`);
        continue;
      }
      if (customId) seen.add(customId);
      safeChildren.push(childJson);
    }

    if (safeChildren.length) {
      safeRows.push({ ...rowJson, type: rowJson?.type || 1, components: safeChildren });
    }
  }

  return safeRows;
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.components)) return payload;
  return { ...payload, components: sanitizeComponents(payload.components) };
}

function protectInteractionResponses(interaction) {
  if (!interaction || interaction.__gsPayloadSafetyInstalled) return;
  interaction.__gsPayloadSafetyInstalled = true;

  for (const methodName of ['reply', 'update', 'editReply', 'followUp']) {
    const original = interaction[methodName];
    if (typeof original !== 'function') continue;
    interaction[methodName] = function protectedResponse(payload, ...rest) {
      return original.call(this, sanitizePayload(payload), ...rest);
    };
  }
}

module.exports = { sanitizeComponents, sanitizePayload, protectInteractionResponses };
