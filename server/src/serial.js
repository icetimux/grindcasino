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

	if (line === "IMPACT") {
		return createImpactEvent({ intensity: 1, sensor: 1 });
	}

	if (line.startsWith("IMPACT:")) {
		const payload = line.slice(7).split(",").map((value) => value.trim());
		const intensity = Number(payload[0]);
		const sensor = Number(payload[1]);

		return createImpactEvent({
			intensity: Number.isFinite(intensity) ? intensity : 1,
			sensor: Number.isFinite(sensor) ? sensor : 1,
		});
	}

	return null;
}

async function resolveSerialPath(logger) {
	const explicit = process.env.SERIAL_PATH || "";
	if (explicit) {
		return explicit;
	}

	try {
		const { SerialPort } = require("serialport");
		const ports = await SerialPort.list();

		const candidates = ports.filter((port) => {
			const portPath = port.path || "";
			const looksUsb =
				Boolean(port.vendorId) ||
				/usbserial|wchusbserial|slab_usbtouart|ttyusb|ttyacm|cu\.usb/i.test(portPath);
			const isNoise = /bluetooth|debug-console|wlan/i.test(portPath);
			return looksUsb && !isNoise;
		});

		if (candidates.length === 1) {
			logger.log(`[Serial] auto-detected device: ${candidates[0].path}`);
			return candidates[0].path;
		}

		if (candidates.length > 1) {
			logger.warn(
				`[Serial] multiple devices found, using first (set SERIAL_PATH to override): ${candidates
					.map((port) => port.path)
					.join(", ")}`
			);
			return candidates[0].path;
		}
	} catch (error) {
		logger.warn(`[Serial] port detection failed: ${error.message}`);
	}

	return "";
}

function startSerialBridge(options = {}) {
	const { broadcast, logger = console } = options;
	const stopHandlers = [];
	const useMockSensor = String(process.env.USE_MOCK_SENSOR || "").toLowerCase() === "true";
	let closed = false;

	function openSerialPort(serialPath) {
		if (closed) {
			return;
		}

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
	} else {
		resolveSerialPath(logger).then((serialPath) => {
			if (!serialPath) {
				logger.log("[Serial] no device found — set SERIAL_PATH or USE_MOCK_SENSOR=true");
				return;
			}
			openSerialPort(serialPath);
		});
	}

	return function stopSerialBridge() {
		closed = true;
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
