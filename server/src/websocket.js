"use strict";

const { WebSocketServer } = require("ws");
const { normalizeMessage } = require("../../shared/protocol");

function createWebSocketBridge(httpServer, options = {}) {
	const { logger = console, handleMessage } = options;
	const wss = new WebSocketServer({ noServer: true });
	let isClosed = false;

	function onUpgrade(request, socket, head) {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit("connection", ws, request);
		});
	}

	httpServer.on("upgrade", onUpgrade);

	function broadcast(message) {
		if (!message) {
			return;
		}

		const payload = JSON.stringify(message);
		wss.clients.forEach((client) => {
			if (client.readyState === 1) {
				client.send(payload);
			}
		});
	}

	wss.on("connection", (ws) => {
		logger.log(`[WS] client connected — total: ${wss.clients.size}`);

		ws.on("message", (raw) => {
			try {
				const parsed = JSON.parse(raw.toString());
				const message = normalizeMessage(parsed);

				if (!message) {
					return;
				}

				const nextMessages = typeof handleMessage === "function"
					? handleMessage(message, { source: "ws" })
					: [message];

				if (!nextMessages) {
					return;
				}

				(nextMessages || []).forEach((nextMessage) => {
					if (nextMessage) {
						broadcast(nextMessage);
					}
				});
			} catch (error) {
				logger.warn("[WS] bad message", raw.toString().slice(0, 80));
			}
		});

		ws.on("close", () => {
			logger.log(`[WS] client disconnected — total: ${wss.clients.size}`);
		});
	});

	function close() {
		if (isClosed) {
			return;
		}

		isClosed = true;
		httpServer.off("upgrade", onUpgrade);
		wss.close();
	}

	return {
		wss,
		broadcast,
		close,
	};
}

module.exports = {
	createWebSocketBridge,
};
