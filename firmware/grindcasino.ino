// GrindCasino impact sensor firmware (ESP32)
//
// This firmware is intentionally "dumb": it only senses piezo impacts and
// streams the raw readings over USB serial. The SERVER decides which readings
// are strong enough to start a spin (see IMPACT_MIN_INTENSITY / IMPACT_MAX_INTENSITY).
//
// Output format (one reading per line, parsed by server/src/serial.js):
//   IMPACT:<raw>,<sensor>
// where <raw> is the 12-bit ADC value (0-4095) and <sensor> is 1 or 2.

const int PIEZO_1 = A0;  // sensor 1 analog pin
const int PIEZO_2 = A1;  // sensor 2 analog pin

// Minimal hardware noise floor. This is NOT the accept threshold — it only
// stops the serial link from flooding with idle/near-zero readings. Tune the
// real accept range on the server, not here.
const int NOISE_FLOOR = 15;

// Sampling interval (ms). Small = fine-grained. 5ms ≈ 200 samples/sec/sensor.
const int SAMPLE_INTERVAL_MS = 5;

void setup() {
    Serial.begin(115200);
    analogReadResolution(12);  // ESP32 ADC range: 0-4095
}

void sendReading(int sensor, int value) {
    Serial.print("IMPACT:");
    Serial.print(value);
    Serial.print(",");
    Serial.println(sensor);
}

void loop() {
    int v1 = analogRead(PIEZO_1);
    int v2 = analogRead(PIEZO_2);

    if (v1 > NOISE_FLOOR) {
        sendReading(1, v1);
    }
    if (v2 > NOISE_FLOOR) {
        sendReading(2, v2);
    }

    delay(SAMPLE_INTERVAL_MS);
}
