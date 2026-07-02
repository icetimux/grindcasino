"use strict";

const MESSAGE_TYPES = Object.freeze({
	IMPACT: "impact",
	SPIN_START: "spin:start",
	SPIN_STOP: "spin:stop",
	SPIN_FORCE: "spin:force",
});

function withTimestamp(message) {
	return {
		...message,
		timestamp: message.timestamp ?? Date.now(),
	};
}

function normalizeMessage(message) {
	if (!message || typeof message !== "object") {
		return null;
	}

	const type = message.type || message.cmd;
	if (!type) {
		return null;
	}

	const normalized = { ...message, type };
	if (!normalized.cmd) {
		normalized.cmd = type;
	}

	return normalized;
}

function createImpactEvent({ intensity, sensor, timestamp } = {}) {
	return withTimestamp({
		type: MESSAGE_TYPES.IMPACT,
		intensity: typeof intensity === "number" ? intensity : 0,
		sensor: Number.isFinite(sensor) ? sensor : 1,
		timestamp,
	});
}

function createSpinStartEvent({ source, timestamp } = {}) {
	return withTimestamp({
		type: MESSAGE_TYPES.SPIN_START,
		source: source || "server",
		timestamp,
	});
}

function createSpinStopEvent({ result, source, timestamp } = {}) {
	return withTimestamp({
		type: MESSAGE_TYPES.SPIN_STOP,
		result: Array.isArray(result) ? result : [],
		source: source || "server",
		timestamp,
	});
}

function createSpinForceEvent({ symbolNums, source, timestamp } = {}) {
	return withTimestamp({
		type: MESSAGE_TYPES.SPIN_FORCE,
		symbolNums: Array.isArray(symbolNums) ? symbolNums : [],
		source: source || "server",
		timestamp,
	});
}

module.exports = {
	MESSAGE_TYPES,
	normalizeMessage,
	createImpactEvent,
	createSpinStartEvent,
	createSpinStopEvent,
	createSpinForceEvent,
};
