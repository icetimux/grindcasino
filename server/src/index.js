"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const { createWebSocketBridge } = require("./websocket");
const { startSerialBridge } = require("./serial");

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const CLIENT_ROOT = path.resolve(__dirname, "../../client");

function serveHtml(res, fileName) {
	const filePath = path.join(CLIENT_ROOT, fileName);

	fs.readFile(filePath, (error, data) => {
		if (error) {
			res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
			res.end(`Unable to read ${fileName}`);
			return;
		}

		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		res.end(data);
	});
}

const httpServer = http.createServer((req, res) => {
	const url = (req.url || "/").split("?")[0];

	if (url === "/" || url === "/index.html" || url === "/frontend.html") {
		serveHtml(res, "index.html");
		return;
	}

	if (url === "/admin" || url === "/admin/" || url === "/admin.html" || url === "/backend.html") {
		serveHtml(res, "admin.html");
		return;
	}

	res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
	res.end("Not found");
});

const websocketBridge = createWebSocketBridge(httpServer, { logger: console });
const { broadcast } = websocketBridge;
const stopSerialBridge = startSerialBridge({ broadcast, logger: console });

let isShuttingDown = false;

httpServer.listen(PORT, () => {
	console.log(`[HTTP] http://localhost:${PORT}       ← display (index.html)`);
	console.log(`[HTTP] http://localhost:${PORT}/admin ← admin controls`);
	console.log(`[WS]   ws://localhost:${PORT}         ← WebSocket relay`);
});

function shutdown() {
	if (isShuttingDown) {
		return;
	}

	isShuttingDown = true;

	process.off("SIGINT", shutdown);
	process.off("SIGTERM", shutdown);

	websocketBridge.close();
	stopSerialBridge();
	httpServer.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

module.exports = {
	httpServer,
};
