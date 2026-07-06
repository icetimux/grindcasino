(function initSlotMachineCore(global) {
  "use strict";

  const IS_DISPLAY_PAGE = !!(global.document && global.document.body && global.document.body.classList.contains("display-page"));
  const H = IS_DISPLAY_PAGE ? 360 : 120;
  const BASE_SPEED = 90;
  // Scale px/ms by H/120 so the visual symbol-scroll rate and stop timing
  // are identical on the display page (H=360) and admin page (H=120).
  const SPIN_PX_PER_MS = (BASE_SPEED / (1000 / 60)) * (H / 120);

  // ──────────────────────────────────────────────────────────────────────────
  // REEL SETUPS (data-driven)
  //
  // Reel content is loaded from a named setup so you can define several in
  // client/public/reels.json and switch which one loads (see loadSetup /
  // configureReels below). Symbols are emoji/text now and can be swapped for
  // PNG images later via the "image" field — no code changes needed.
  //
  // A setup looks like:
  //   {
  //     "name": "classic",
  //     "symbols": [
  //       { "id": 1, "label": "Cherry", "glyph": "🍒", "image": null },
  //       ... exactly 6 symbols, ids 1..6 ...
  //     ],
  //     "strip": [1, 2, 1, 3, ...]   // symbol ids in reel order
  //   }
  //
  // ── CRITERIA every setup MUST meet (enforced by validateSetup) so the
  //    animation and game logic keep working correctly: ──────────────────────
  //   1. symbols: EXACTLY 6 entries, each with a UNIQUE integer id in 1..6.
  //        The admin Force inputs + legend and the server force/result values
  //        are all keyed to ids 1-6. Changing the count means also updating
  //        admin.html (legend + inputs) and the server.
  //   2. Each symbol needs a "glyph" (text/emoji) OR an "image" (PNG url).
  //        If "image" is set it renders as <img class="symbol-img"> (sized to
  //        the 120px cell); otherwise the "glyph" text is shown. If an image
  //        fails to load, it falls back to the glyph.
  //   3. strip: a non-empty array of symbol ids; every id must exist in symbols.
  //   4. Every symbol id 1..6 MUST appear at least once in the strip, so a
  //      forced or random result can always land on it.
  //   5. Strip length should be >= 12 so the scroll looks right; 30 is default.
  //      If you change the length, set STRIP_COUNT in the server to the SAME
  //      value (server/src/index.js and server/src/serial.js) so server-random
  //      results stay uniform across the whole strip.
  //   6. The JS symbol height (H) MUST match .symbol height in slot-machine.css
  //      for the current page (display: 360, admin: 120).
  //
  //   Optional: "winRules" maps a final result (the 3 landed symbol ids) to a
  //   win-sound key. Shape:
  //     "winRules": {
  //       "default": "lose",
  //       "rules": [ { "sound": "jackpot", "symbols": [6, 6, 6] }, ... ]
  //     }
  //   Rules match order-independently (as a multiset); the first match wins,
  //   otherwise "default" is used. Sound keys map to /public/sounds/<key>.wav
  //   on the client and are played when all reels have fully stopped.
  // ──────────────────────────────────────────────────────────────────────────

  const DEFAULT_SETUP = {
    name: "classic",
    symbols: [
      { id: 1, label: "Cherry", glyph: "🍒", image: null },
      { id: 2, label: "Bell", glyph: "🔔", image: null },
      { id: 3, label: "Star", glyph: "⭐", image: null },
      { id: 4, label: "Diamond", glyph: "💎", image: null },
      { id: 5, label: "Bonus", glyph: "🟡", image: null },
      { id: 6, label: "Jackpot", glyph: "🔴", image: null },
    ],
    strip: [
      1, 2, 1, 3, 1, 2, 1, 4, 1, 3,
      1, 2, 1, 5, 1, 3, 2, 4, 1, 5,
      1, 3, 2, 1, 4, 5, 2, 1, 3, 6,
    ],
  };

  // Active reel state (mutable — updated by configureReels()).
  let activeSetup = null;      // raw setup object in use
  let REEL_STRIP = [];         // array of symbol ids, in reel order
  let SYMBOL_BY_ID = {};       // id -> symbol descriptor { id, label, glyph, image }
  let COUNT = 0;
  let LOOP_HEIGHT = 0;
  let symbolOccurrences = {};  // id -> [indices in REEL_STRIP]

  function buildSymbolOccurrences() {
    const occurrences = {};
    REEL_STRIP.forEach((id, index) => {
      if (!occurrences[id]) {
        occurrences[id] = [];
      }
      occurrences[id].push(index);
    });
    return occurrences;
  }

  // Returns an array of human-readable problems; empty array means the setup is valid.
  function validateSetup(setup) {
    const problems = [];

    if (!setup || typeof setup !== "object") {
      return ["setup is not an object"];
    }

    const symbols = Array.isArray(setup.symbols) ? setup.symbols : [];
    if (symbols.length !== 6) {
      problems.push("symbols must have exactly 6 entries (ids 1..6)");
    }

    const ids = symbols.map((symbol) => symbol && symbol.id);
    for (let id = 1; id <= 6; id++) {
      if (!ids.includes(id)) {
        problems.push("missing symbol id " + id);
      }
    }

    symbols.forEach((symbol) => {
      if (symbol && !symbol.glyph && !symbol.image) {
        problems.push("symbol id " + (symbol.id) + " needs a glyph or image");
      }
    });

    const strip = Array.isArray(setup.strip) ? setup.strip : [];
    if (strip.length === 0) {
      problems.push("strip must be a non-empty array");
    }

    const idSet = new Set(ids);
    strip.forEach((id, i) => {
      if (!idSet.has(id)) {
        problems.push("strip[" + i + "] references unknown symbol id " + id);
      }
    });

    for (let id = 1; id <= 6; id++) {
      if (idSet.has(id) && !strip.includes(id)) {
        problems.push("symbol id " + id + " never appears in the strip");
      }
    }

    return problems;
  }

  // Applies a setup as the active reel configuration. Falls back to the default
  // (and warns) if the setup fails validation. Call BEFORE createMachine(), or
  // call machine.rebuild() afterwards to redraw with the new setup.
  function configureReels(setup) {
    const problems = validateSetup(setup);
    const chosen = problems.length === 0 ? setup : DEFAULT_SETUP;

    if (problems.length > 0) {
      console.warn("[Reels] invalid setup, using default:\n - " + problems.join("\n - "));
    }

    activeSetup = chosen;
    REEL_STRIP = chosen.strip.slice();
    SYMBOL_BY_ID = {};
    chosen.symbols.forEach((symbol) => {
      SYMBOL_BY_ID[symbol.id] = symbol;
    });
    COUNT = REEL_STRIP.length;
    LOOP_HEIGHT = COUNT * H;
    symbolOccurrences = buildSymbolOccurrences();

    return problems.length === 0;
  }

  // Apply the built-in default immediately so createMachine() works even before
  // (or without) an external setup being loaded.
  configureReels(DEFAULT_SETUP);

  function getQueryParam(name) {
    try {
      return new URLSearchParams(global.location.search).get(name);
    } catch (error) {
      return null;
    }
  }

  // Fetches reels.json and configures the chosen setup. Selection priority:
  // explicit options.name > ?setup= query param > json.activeSetup.
  // Always resolves (keeps the default on any failure). Await it before
  // createMachine(), or follow with machine.rebuild().
  function loadSetup(options) {
    const opts = options || {};
    const url = opts.url || "/public/reels.json";

    return fetch(url)
      .then((response) => response.json())
      .then((data) => {
        const setupName = opts.name || getQueryParam("setup") || data.activeSetup;
        const setups = data.setups || {};
        const setup = setups[setupName];

        if (!setup) {
          console.warn("[Reels] setup '" + setupName + "' not found, using default");
          return false;
        }

        return configureReels(setup);
      })
      .catch((error) => {
        console.warn("[Reels] failed to load setups, using default:", error.message);
        return false;
      });
  }

  function symbolNumToIndex(n) {
    const id = Math.max(1, Math.min(6, n || 1));
    const occurrences = symbolOccurrences[id];
    return occurrences && occurrences.length > 0 ? occurrences[0] : 0;
  }

  // Maps a final result (3 landed symbol ids) to a win-sound key using the
  // active setup's optional winRules. Returns the matching rule's sound, else
  // the configured default, else null.
  function resolveWinSound(symbolIds) {
    const winRules = activeSetup && activeSetup.winRules ? activeSetup.winRules : null;
    if (!winRules) {
      return null;
    }

    const target = symbolIds.slice().sort((a, b) => a - b).join(",");
    const rules = Array.isArray(winRules.rules) ? winRules.rules : [];

    for (const rule of rules) {
      if (Array.isArray(rule.symbols) && rule.symbols.slice().sort((a, b) => a - b).join(",") === target) {
        return rule.sound || null;
      }
    }

    return winRules.default || null;
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
    // Target stop duration in ms — every reel will stop in approximately this time.
    const TARGET_STOP_DURATION_MS = 900;
    const onSpinStart = typeof config.onSpinStart === "function" ? config.onSpinStart : null;
    const onReelStopped = typeof config.onReelStopped === "function" ? config.onReelStopped : null;
    const onResult = typeof config.onResult === "function" ? config.onResult : null;

    let pendingResult = null;
    let usedStopContextsBySymbol = {};
    let stopQueue = [];
    let rafId = null;
    let rafPrevNow = 0;
    const reels = [createReel(), createReel(), createReel()];

    function resetStopContextUsage() {
      usedStopContextsBySymbol = {};
    }

    function contextKeyAt(index) {
      const current = ((index % COUNT) + COUNT) % COUNT;
      const prev = (current - 1 + COUNT) % COUNT;
      const next = (current + 1) % COUNT;
      return [REEL_STRIP[prev], REEL_STRIP[current], REEL_STRIP[next]].join(",");
    }

    function build() {
      reelIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) {
          return;
        }

        el.innerHTML = "";
        for (let repeat = 0; repeat < 3; repeat++) {
          for (let index = 0; index < COUNT; index++) {
            const cell = document.createElement("div");
            cell.className = "symbol";

            const descriptor = SYMBOL_BY_ID[REEL_STRIP[index]];

            if (descriptor && descriptor.image) {
              const img = document.createElement("img");
              img.className = "symbol-img";
              img.src = descriptor.image;
              img.alt = descriptor.label || "";
              // Fall back to the glyph if the image fails to load.
              img.addEventListener("error", () => {
                cell.textContent = descriptor.glyph || "";
              });
              cell.appendChild(img);
            } else {
              cell.innerText = descriptor ? descriptor.glyph : "";
            }

            el.appendChild(cell);
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
      resetStopContextUsage();
      stopQueue = [];

      const now = performance.now();
      reels.forEach((reel) => {
        reel.phase = "spinning";
        reel.spinStart = now;
        reel.stopRequested = false;
      });

      if (onSpinStart) {
        onSpinStart();
      }

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
      resetStopContextUsage();
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

            const vStart = easeInOutQuad(Math.min(1, (currentNow - reel.spinStart) / 500)) * SPIN_PX_PER_MS;
            // Ideal forward travel to hit exactly TARGET_STOP_DURATION_MS.
            const targetFwd = vStart * TARGET_STOP_DURATION_MS / 2;

            // Pick the occurrence of the target symbol whose forward distance
            // is closest to targetFwd (checking base distance and +1 loop),
            // so every reel decelerates over the same wall-clock time.
            const symbolId = REEL_STRIP[reel.targetIndex];
            const occurrences = symbolOccurrences[symbolId];
            const usedContexts = usedStopContextsBySymbol[symbolId] || new Set();

            const candidates = [];

            for (const occurrenceIndex of occurrences) {
              const centreY = (((occurrenceIndex - 1) * H) % LOOP_HEIGHT + LOOP_HEIGHT) % LOOP_HEIGHT;
              let fwd = (centreY - reel.y + LOOP_HEIGHT) % LOOP_HEIGHT;
              if (fwd < minForward) {
                fwd += LOOP_HEIGHT;
              }
              // Consider this distance and one extra loop to bracket targetFwd.
              for (let extra = 0; extra <= 1; extra++) {
                const candidate = fwd + extra * LOOP_HEIGHT;
                const diff = Math.abs(candidate - targetFwd);
                candidates.push({
                  fwd: candidate,
                  diff,
                  contextKey: contextKeyAt(occurrenceIndex),
                });
              }
            }

            // Prefer a context (prev,current,next symbols) not yet used by
            // another reel for the same forced symbol in this spin.
            const freshCandidates = candidates.filter((candidate) => !usedContexts.has(candidate.contextKey));
            const pool = freshCandidates.length > 0 ? freshCandidates : candidates;
            pool.sort((a, b) => a.diff - b.diff);

            const chosen = pool[0] || { fwd: minForward, contextKey: "" };
            const bestFwd = chosen.fwd;

            if (!usedStopContextsBySymbol[symbolId]) {
              usedStopContextsBySymbol[symbolId] = new Set();
            }
            usedStopContextsBySymbol[symbolId].add(chosen.contextKey);

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

            if (onReelStopped) {
              onReelStopped(index, stopQueue.length === 0);
            }

            // Last reel fully stopped: report the final result + win sound.
            if (stopQueue.length === 0 && onResult) {
              const resultSymbols = reels.map((r) => REEL_STRIP[r.targetIndex]);
              onResult(resultSymbols, resolveWinSound(resultSymbols));
            }

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
      // Redraw the reels using the current active setup (call after loadSetup).
      rebuild() {
        build();
        renderInitialState();
      },
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
    configureReels,
    loadSetup,
    validateSetup,
    getActiveSetup() {
      return activeSetup;
    },
    constants: {
      AUTO_STOP_MS: 4000,
    },
  };
})(window);
