(function initSlotMachineCore(global) {
  "use strict";

  const REEL_STRIP = [
    "🍒", "🔔", "🍒", "⭐", "🍒", "🔔", "🍒", "💎", "🍒", "⭐",
    "🍒", "🔔", "🍒", "🟡", "🍒", "⭐", "🔔", "💎", "🍒", "🟡",
    "🍒", "⭐", "🔔", "🍒", "💎", "🟡", "🔔", "🍒", "⭐", "🔴"
  ];

  const SYMBOL_MAP = { 1: "🍒", 2: "🔔", 3: "⭐", 4: "💎", 5: "🟡", 6: "🔴" };

  const COUNT = REEL_STRIP.length;
  const H = 120;
  const LOOP_HEIGHT = COUNT * H;
  const BASE_SPEED = 90;
  const SPIN_PX_PER_MS = BASE_SPEED / (1000 / 60);

  function buildSymbolOccurrences() {
    const symbolOccurrences = {};
    REEL_STRIP.forEach((symbol, index) => {
      if (!symbolOccurrences[symbol]) {
        symbolOccurrences[symbol] = [];
      }
      symbolOccurrences[symbol].push(index);
    });
    return symbolOccurrences;
  }

  const symbolOccurrences = buildSymbolOccurrences();

  function symbolNumToIndex(n) {
    const emoji = SYMBOL_MAP[Math.max(1, Math.min(6, n || 1))];
    return symbolOccurrences[emoji][0];
  }

  function createReel() {
    return {
      y: 0,
      phase: "idle",
      spinStart: 0,
      stopRequested: false,
      targetIndex: 0,
      stopStartY: 0,
      stopBestFwd: 0,
      stopStartTime: 0,
      stopDuration: 0,
    };
  }

  function createMachine(options) {
    const config = options || {};
    const reelIds = config.reelIds || ["r0", "r1", "r2"];
    const minForward = typeof config.minForward === "number" ? config.minForward : H * 6;
    const stopGapMs = typeof config.stopGapMs === "number" ? config.stopGapMs : 350;

    let pendingResult = null;
    let stopQueue = [];
    let rafId = null;
    let rafPrevNow = 0;
    const reels = [createReel(), createReel(), createReel()];

    function build() {
      reelIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) {
          return;
        }

        el.innerHTML = "";
        for (let repeat = 0; repeat < 3; repeat++) {
          for (let index = 0; index < COUNT; index++) {
            const symbol = document.createElement("div");
            symbol.className = "symbol";
            symbol.innerText = REEL_STRIP[index];
            el.appendChild(symbol);
          }
        }
      });
    }

    function renderInitialState() {
      reels.forEach((reel, index) => {
        reel.y = Math.floor(Math.random() * COUNT) * H;
        global.gsap.set("#" + reelIds[index], { y: -reel.y });
      });
    }

    function requestStopFor(index) {
      const reel = reels[index];
      if (!reel || reel.phase !== "spinning") {
        return;
      }

      reel.targetIndex = pendingResult[index] % COUNT;
      reel.stopRequested = true;
    }

    function startSpin() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      rafPrevNow = 0;
      pendingResult = null;
      stopQueue = [];

      const now = performance.now();
      reels.forEach((reel) => {
        reel.phase = "spinning";
        reel.spinStart = now;
        reel.stopRequested = false;
      });

      rafId = requestAnimationFrame(loop);
    }

    function scheduleStopsFromIndices(result) {
      if (!Array.isArray(result) || result.length < 3) {
        return;
      }

      pendingResult = [
        Number(result[0]) || 0,
        Number(result[1]) || 0,
        Number(result[2]) || 0,
      ];
      stopQueue = [1, 2];
      requestStopFor(0);
    }

    function scheduleStopsFromSymbolNums(symbolNums) {
      const result = (symbolNums || []).map((value) => symbolNumToIndex(value));
      scheduleStopsFromIndices(result);
    }

    function loop(now) {
      const currentNow = now || performance.now();
      const dt = rafPrevNow > 0 ? Math.min(currentNow - rafPrevNow, 50) : 1000 / 60;
      rafPrevNow = currentNow;

      for (let index = 0; index < 3; index++) {
        const reel = reels[index];

        if (reel.phase === "spinning") {
          const rampT = Math.min(1, (currentNow - reel.spinStart) / 500);
          reel.y += easeInOutQuad(rampT) * SPIN_PX_PER_MS * dt;
          reel.y = ((reel.y % LOOP_HEIGHT) + LOOP_HEIGHT) % LOOP_HEIGHT;
          global.gsap.set("#" + reelIds[index], { y: -reel.y });

          if (reel.stopRequested) {
            reel.stopRequested = false;

            const occurrences = symbolOccurrences[REEL_STRIP[reel.targetIndex]];
            let bestFwd = Infinity;

            for (const occurrenceIndex of occurrences) {
              const centreY = (((occurrenceIndex - 1) * H) % LOOP_HEIGHT + LOOP_HEIGHT) % LOOP_HEIGHT;
              let fwd = (centreY - reel.y + LOOP_HEIGHT) % LOOP_HEIGHT;
              if (fwd < minForward) {
                fwd += LOOP_HEIGHT;
              }
              if (fwd < bestFwd) {
                bestFwd = fwd;
              }
            }

            const vStart = easeInOutQuad(Math.min(1, (currentNow - reel.spinStart) / 500)) * SPIN_PX_PER_MS;
            reel.phase = "stopping";
            reel.stopStartY = reel.y;
            reel.stopBestFwd = bestFwd;
            reel.stopStartTime = currentNow;
            reel.stopDuration = 2 * bestFwd / vStart;
          }
        } else if (reel.phase === "stopping") {
          const elapsed = currentNow - reel.stopStartTime;
          const progress = Math.min(1, elapsed / reel.stopDuration);
          const eased = progress * (2 - progress);
          const value = reel.stopStartY + reel.stopBestFwd * eased;
          global.gsap.set("#" + reelIds[index], { y: -value });

          if (progress >= 1) {
            reel.y = ((value % LOOP_HEIGHT) + LOOP_HEIGHT) % LOOP_HEIGHT;
            global.gsap.set("#" + reelIds[index], { y: -reel.y });
            reel.phase = "stopped";

            if (stopQueue.length > 0) {
              const nextIndex = stopQueue.shift();
              setTimeout(() => requestStopFor(nextIndex), stopGapMs);
            }
          }
        }
      }

      rafId = requestAnimationFrame(loop);
    }

    build();
    renderInitialState();

    return {
      startSpin,
      scheduleStopsFromIndices,
      scheduleStopsFromSymbolNums,
      symbolNumToIndex,
      randomResult() {
        return [randIndex(), randIndex(), randIndex()];
      },
      isSpinning() {
        return reels.some((reel) => reel.phase === "spinning");
      },
      hasPendingResult() {
        return pendingResult !== null;
      },
      clearPendingResult() {
        pendingResult = null;
      },
    };
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function randIndex() {
    return Math.floor(Math.random() * COUNT);
  }

  function connectWebSocket(options) {
    const config = options || {};
    const reconnectMs = typeof config.reconnectMs === "number" ? config.reconnectMs : 2000;
    const onMessage = typeof config.onMessage === "function" ? config.onMessage : function noop() {};
    const onInvalidMessage = typeof config.onInvalidMessage === "function" ? config.onInvalidMessage : function noop() {};
    const statusEl = resolveElement(config.statusElement);

    let socket = null;
    let shouldReconnect = true;

    function connect() {
      socket = new WebSocket("ws://" + location.host);

      socket.onopen = function onOpen() {
        if (statusEl) {
          statusEl.textContent = "🟢 WS";
        }
      };

      socket.onclose = function onClose() {
        if (statusEl) {
          statusEl.textContent = "🔴 WS";
        }
        if (shouldReconnect) {
          setTimeout(connect, reconnectMs);
        }
      };

      socket.onerror = function onError() {};

      socket.onmessage = function onWsMessage(event) {
        try {
          const message = JSON.parse(event.data);
          onMessage(message);
        } catch (error) {
          onInvalidMessage(error);
        }
      };
    }

    connect();

    return {
      send(data) {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(data));
        }
      },
      isOpen() {
        return Boolean(socket && socket.readyState === WebSocket.OPEN);
      },
      close() {
        shouldReconnect = false;
        if (socket) {
          socket.close();
        }
      },
    };
  }

  function resolveElement(value) {
    if (!value) {
      return null;
    }

    if (typeof value === "string") {
      return document.getElementById(value);
    }

    return value;
  }

  global.SlotMachineCore = {
    createMachine,
    connectWebSocket,
    constants: {
      AUTO_STOP_MS: 4000,
    },
  };
})(window);
