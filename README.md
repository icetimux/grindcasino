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

That starts a fake impact generator that emits `impact` events into the server input path.

Current mock sensor defaults:

- Emits one mock impact roughly every `5-6` seconds.
- Each accepted impact causes the server to broadcast `spin:start`.

You can also combine mock mode with other flags:

```bash
cd server
USE_MOCK_SENSOR=true IMPACT_DEBOUNCE_MS=1200 SPIN_STATE_TIMEOUT_MS=4000 SPIN_COOLDOWN_MS=3000 npm start
```

## Serial settings

Set the serial device path and baud rate with environment variables:

```bash
cd server
SERIAL_PATH=/dev/tty.usbserial-XXXX BAUD_RATE=115200 npm start
```

- `SERIAL_PATH` enables the physical serial bridge.
- `BAUD_RATE` defaults to `115200` if you do not set it.

## Environment flags

These are the main runtime flags supported by the server:

- `PORT`
	- HTTP + WebSocket port.
	- Default: `8080`
- `USE_MOCK_SENSOR`
	- Enables fake impact events instead of requiring physical hardware.
	- Default: disabled
- `SERIAL_PATH`
	- Serial device path for the hardware connection.
	- Example: `/dev/tty.usbserial-XXXX`
- `BAUD_RATE`
	- Serial baud rate.
	- Default: `115200`
- `IMPACT_DEBOUNCE_MS`
	- Minimum time between accepted impact events.
	- Default: `1200`
- `SPIN_STATE_TIMEOUT_MS`
	- Server-side fallback timeout for clearing spin state if no stop/force message arrives.
	- Default: `4000`
- `SPIN_COOLDOWN_MS`
	- Cooldown period after `spin:stop` or `spin:force` before the server accepts a new start.
	- Default: `3000`

Example with everything together:

```bash
cd server
PORT=8080 SERIAL_PATH=/dev/tty.usbserial-XXXX BAUD_RATE=115200 IMPACT_DEBOUNCE_MS=1200 SPIN_STATE_TIMEOUT_MS=4000 SPIN_COOLDOWN_MS=3000 npm start
```

