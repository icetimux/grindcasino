"use strict";

const {
	createImpactEvent,
	createSpinForceEvent,
	createSpinStartEvent,
	createSpinStopEvent,
} = require("../../shared/protocol");
const { createMockSensor } = require("../../tools/mock-sensor");

const STRIP_COUNT = 30;

function randomStripIndex() {
	return Math.floor(Math.random() * STRIP_COUNT);
}

function parseSerialLine(rawLine) {
	const line = String(rawLine || "").trim().toUpperCase();

	if (!line) {
		return null;
	}

	if (line === "START") {
		return createSpinStartEvent({ source: "serial" });
	}

	if (line === "STOP") {
		return createSpinStopEvent({
			source: "serial",
			result: [randomStripIndex(), randomStripIndex(), randomStripIndex()],
		});
	}

	if (line.startsWith("FORCE:")) {
		const symbolNums = line
			.slice(6)
			.split(",")
			.map((value) => Number(value.trim()))
			.filter((value) => Number.isInteger(value))
			.slice(0, 3);

		if (symbolNums.length === 3 && symbolNums.every((value) => value >= 1 && value <= 6)) {
			return createSpinForceEvent({ source: "serial", symbolNums });
		}
	}

	return null;
}

function startSerialBridge(options = {}) {
	const { broadcast, logger = console } = options;
	const stopHandlers = [];
	const serialPath = process.env.SERIAL_PATH || "";
	const useMockSensor = String(process.env.USE_MOCK_SENSOR || "").toLowerCase() === "true";

	if (serialPath) {
		try {
			const { SerialPort } = require("serialport");
			const { ReadlineParser } = require("@serialport/parser-readline");

			const port = new SerialPort({ path: serialPath, baudRate: Number(process.env.BAUD_RATE || "115200") });
			const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

			port.on("open", () => logger.log(`[Serial] open: ${serialPath}`));
			port.on("error", (error) => logger.error(`[Serial] error: ${error.message}`));

			parser.on("data", (raw) => {
				const message = parseSerialLine(raw);
				if (message && typeof broadcast === "function") {
					broadcast(message);
				}
			});

			stopHandlers.push(() => {
				try {
					port.close();
				} catch (error) {
					// ignore shutdown errors
				}
			});
		} catch (error) {
			logger.warn("[Serial] unavailable — run npm install");
			logger.warn(error.message);
		}
	}

	if (useMockSensor) {
		const stopMockSensor = createMockSensor({
			logger,
			onImpact: (event) => {
				if (typeof broadcast === "function") {
					broadcast(event);
				}
			},
		});

		stopHandlers.push(stopMockSensor);
	}

	if (!serialPath && !useMockSensor) {
		logger.log("[Serial] disabled — set SERIAL_PATH or USE_MOCK_SENSOR=true");
	}

	return function stopSerialBridge() {
		while (stopHandlers.length > 0) {
			const stop = stopHandlers.pop();
			if (typeof stop === "function") {
				stop();
			}
		}
	};
}

module.exports = {
	startSerialBridge,
	parseSerialLine,
	createImpactEvent,
};
