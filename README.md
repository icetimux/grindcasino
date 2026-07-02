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

If a single ESP32 is connected over USB, the server auto-detects the serial port
— you do not need to set `SERIAL_PATH`. You can still pin it explicitly:

```bash
cd server
SERIAL_PATH=/dev/tty.usbserial-XXXX BAUD_RATE=115200 npm start
```

- `SERIAL_PATH` optional. If unset (and mock mode is off), the server auto-detects the only USB serial device.
- `BAUD_RATE` defaults to `115200` if you do not set it.

## Firmware

The ESP32 firmware in `firmware/grindcasino.ino` is intentionally "dumb": it only
senses piezo impacts and streams the raw readings over USB serial. The server
decides which readings are strong enough to accept.

Each reading is sent on its own line:

```
IMPACT:<raw>,<sensor>
```

- `<raw>` is the 12-bit ESP32 ADC value (`0-4095`). Higher = harder impact.
- `<sensor>` is `1` or `2` (piezo 1 on `A0`, piezo 2 on `A1`).

The firmware only applies a tiny `NOISE_FLOOR` so it does not flood the serial
link with idle readings. Tune the real accept range on the server with
`IMPACT_MIN_INTENSITY` / `IMPACT_MAX_INTENSITY`.

## Environment flags

These are the main runtime flags supported by the server:

- `PORT`
	- HTTP + WebSocket port.
	- Default: `8080`
- `USE_MOCK_SENSOR`
	- Enables fake impact events instead of requiring physical hardware.
	- Default: disabled
- `SERIAL_PATH`
	- Serial device path for the hardware connection. Optional — auto-detected when a single USB serial device is present.
	- Example: `/dev/tty.usbserial-XXXX`
- `BAUD_RATE`
	- Serial baud rate.
	- Default: `115200`
- `IMPACT_MIN_INTENSITY`
	- Minimum raw ADC value (`0-4095`) the server accepts as a real hit. Impacts below this are ignored.
	- Default: `800`
- `IMPACT_MAX_INTENSITY`
	- Maximum raw ADC value the server accepts. Impacts above this are ignored (over-range/noise rejection).
	- Default: `4095`
- `IMPACT_DEBOUNCE_MS`
	- Minimum time between accepted impact events.
	- Default: `1200`
- `SPIN_STATE_TIMEOUT_MS`
	- Spin duration. When it elapses with no admin stop/force, the server auto-broadcasts a `spin:stop` (with a random result) so display clients halt on their own.
	- Default: `4000`
- `SPIN_COOLDOWN_MS`
	- Cooldown period after `spin:stop` or `spin:force` before the server accepts a new start.
	- Default: `3000`

Example with everything together:

```bash
cd server
PORT=8080 SERIAL_PATH=/dev/tty.usbserial-XXXX BAUD_RATE=115200 IMPACT_MIN_INTENSITY=800 IMPACT_MAX_INTENSITY=4095 IMPACT_DEBOUNCE_MS=1200 SPIN_STATE_TIMEOUT_MS=4000 SPIN_COOLDOWN_MS=3000 npm start
```

