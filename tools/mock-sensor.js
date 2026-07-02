"use strict";

const { createImpactEvent } = require("../shared/protocol");

function randomInt(min, max) {
	return Math.floor(min + Math.random() * (max - min + 1));
}

function createMockSensor(options = {}) {
	const {
		onImpact,
		logger = console,
		sensorCount = 2,
		minDelayMs = 5000,
		maxDelayMs = 6000,
		minIntensity = 200,
		maxIntensity = 400,
	} = options;

	let active = true;
	let timer = null;

	function scheduleNext() {
		if (!active) {
			return;
		}

		const delay = randomInt(minDelayMs, maxDelayMs);
		timer = setTimeout(emitImpact, delay);
	}

	function emitImpact() {
		if (!active) {
			return;
		}

		const sensor = randomInt(1, Math.max(1, sensorCount));
		const intensity = Math.round(minIntensity + Math.random() * (maxIntensity - minIntensity));
		const event = createImpactEvent({ intensity, sensor });

		if (logger && typeof logger.log === "function") {
			logger.log(`[MockSensor] ${JSON.stringify(event)}`);
		}

		if (typeof onImpact === "function") {
			onImpact(event);
		}

		scheduleNext();
	}

	scheduleNext();

	return function stopMockSensor() {
		active = false;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};
}

if (require.main === module) {
	const stop = createMockSensor({
		onImpact: (event) => {
			process.stdout.write(`${JSON.stringify(event)}\n`);
		},
	});

	process.on("SIGINT", () => {
		stop();
		process.exit(0);
	});
}

module.exports = {
	createMockSensor,
};
