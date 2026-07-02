"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const { createWebSocketBridge } = require("./websocket");
const { startSerialBridge } = require("./serial");

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const CLIENT_ROOT = path.resolve(__dirname, "../../client");

function contentTypeFor(filePath) {
	const ext = path.extname(filePath).toLowerCase();

	if (ext === ".html") return "text/html; charset=utf-8";
	if (ext === ".css") return "text/css; charset=utf-8";
	if (ext === ".js") return "application/javascript; charset=utf-8";
	if (ext === ".json") return "application/json; charset=utf-8";
	if (ext === ".svg") return "image/svg+xml";
	if (ext === ".png") return "image/png";
	if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
	if (ext === ".webp") return "image/webp";
	if (ext === ".ico") return "image/x-icon";

	return "application/octet-stream";
}

function serveFile(res, filePath) {
	fs.readFile(filePath, (error, data) => {
		if (error) {
			res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
			res.end("Not found");
			return;
		}

		res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
		res.end(data);
	});
}

function serveClientAsset(reqPath, res) {
	const normalizedPath = path.posix.normalize(reqPath);
	const resolvedPath = path.resolve(CLIENT_ROOT, "." + normalizedPath);

	if (!resolvedPath.startsWith(CLIENT_ROOT + path.sep) && resolvedPath !== CLIENT_ROOT) {
		res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
		res.end("Forbidden");
		return;
	}

	serveFile(res, resolvedPath);
}

function serveHtml(res, fileName) {
	const filePath = path.join(CLIENT_ROOT, fileName);
	serveFile(res, filePath);
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

	if (url.startsWith("/src/") || url.startsWith("/public/")) {
		serveClientAsset(url, res);
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
