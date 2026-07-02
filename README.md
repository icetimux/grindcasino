## GrindCasino

Project layout:

- `server/` runs the HTTP server, WebSocket relay, and serial bridge.
- `client/` contains the display page at `index.html` and the admin panel at `admin.html`.
- `shared/` holds the message protocol.
- `tools/mock-sensor.js` generates fake impact events for local testing.

## Start the project

1. Install server dependencies:

	```bash
	cd server
	npm install
	```

2. Start the bridge:

	```bash
	npm start
	```

3. Open the app:

	- Display: `http://localhost:8080/`
	- Admin: `http://localhost:8080/admin`

## Mock sensor mode

Use the mock sensor when you do not have the Arduino connected:

```bash
cd server
USE_MOCK_SENSOR=true npm start
```

That starts a fake impact generator that emits protocol events into the WebSocket stream.

## Serial settings

Set the serial device path and baud rate with environment variables:

```bash
cd server
SERIAL_PATH=/dev/tty.usbserial-XXXX BAUD_RATE=115200 npm start
```

- `SERIAL_PATH` enables the physical serial bridge.
- `BAUD_RATE` defaults to `115200` if you do not set it.

