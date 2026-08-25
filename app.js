(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const widthInput = $("#widthInput");
  const heightInput = $("#heightInput");
  const diameterInput = $("#diameterInput");
  const blockGrid = $("#blockGrid");
  const axisLayout = $("#axisLayout");
  const axisX = $("#axisX");
  const axisZ = $("#axisZ");
  const viewport = $("#gridViewport");
  const calculateBtn = $("#calculateBtn");

  const MUD_COLORS = ["#5f5b52", "#6d685e", "#49473f"];

  const state = {
    shape: "rectangle",
    width: 8,
    height: 8,
    diameter: 16,
    active: [],
    water: [],
    exact: true,
    cellSize: 38,
    timer: null
  };

  const popcount = (value) => {
    let count = 0;
    while (value) {
      value &= value - 1;
      count++;
    }
    return count;
  };

  function clampInput(input) {
    const value = Number.parseInt(input.value, 10) || 1;
    input.value = Math.max(1, Math.min(32, value));
    return Number(input.value);
  }

  // Exact minimum dominating-set solver for narrow rectangular grids.
  // Water is the dominating set; every other block is therefore plantable.
  function solveExact(originalWidth, originalHeight, active) {
    const transposed = originalWidth > originalHeight;
    const width = Math.min(originalWidth, originalHeight);
    const height = Math.max(originalWidth, originalHeight);
    const all = (1 << width) - 1;
    const allowedRows = new Array(height).fill(0);

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const x = transposed ? row : col;
        const z = transposed ? col : row;
        if (active[z * originalWidth + x]) allowedRows[row] |= 1 << col;
      }
    }

    let layer = new Map();
    layer.set(0, { water: 0, need: 0, cost: 0, parent: null, rowMask: 0 });

    for (let row = 0; row < height; row++) {
      const next = new Map();
      const allowed = allowedRows[row];
      for (const previous of layer.values()) {
        if ((previous.need & ~allowed) !== 0) continue;
        const free = allowed & ~previous.need;
        for (let extra = free; ; extra = (extra - 1) & free) {
          const current = previous.need | extra;
          const horizontal = ((current << 1) | (current >> 1)) & all;
          const needBelow = allowed & ~(current | horizontal | previous.water);
          const cost = previous.cost + popcount(current);
          const key = current * (all + 1) + needBelow;
          const existing = next.get(key);
          if (!existing || cost < existing.cost) {
            next.set(key, { water: current, need: needBelow, cost, parent: previous, rowMask: current });
          }
          if (extra === 0) break;
        }
      }
      layer = next;
    }

    let best = null;
    for (const candidate of layer.values()) {
      if (candidate.need === 0 && (!best || candidate.cost < best.cost)) best = candidate;
    }

    const masks = new Array(height);
    let node = best;
    for (let row = height - 1; row >= 0; row--) {
      masks[row] = node.rowMask;
      node = node.parent;
    }

    const result = new Array(originalWidth * originalHeight).fill(false);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        if ((masks[row] & (1 << col)) === 0) continue;
        const x = transposed ? row : col;
        const z = transposed ? col : row;
        result[z * originalWidth + x] = true;
      }
    }
    return result;
  }

  function neighbors(index, width, height, includeSelf = false) {
    const x = index % width;
    const z = Math.floor(index / width);
    const result = includeSelf ? [index] : [];
    if (x > 0) result.push(index - 1);
    if (x + 1 < width) result.push(index + 1);
    if (z > 0) result.push(index - width);
    if (z + 1 < height) result.push(index + width);
    return result;
  }

  function validLayout(water, width, height, active) {
    for (let index = 0; index < water.length; index++) {
      if (!active[index] || water[index]) continue;
      if (!neighbors(index, width, height).some((neighbor) => water[neighbor])) return false;
    }
    return true;
  }

  function completeAndPrune(seed, width, height, active) {
    const total = width * height;
    const water = seed.slice();

    while (!validLayout(water, width, height, active)) {
      const uncovered = new Set();
      for (let index = 0; index < total; index++) {
        if (active[index] && !water[index] && !neighbors(index, width, height).some((n) => water[n])) uncovered.add(index);
      }

      let bestIndex = 0;
      let bestScore = -1;
      for (let candidate = 0; candidate < total; candidate++) {
        if (!active[candidate] || water[candidate]) continue;
        let score = 0;
        for (const covered of neighbors(candidate, width, height, true)) {
          if (uncovered.has(covered)) score++;
        }
        // Prefer edges on ties to repair finite-grid boundaries cleanly.
        const x = candidate % width;
        const z = Math.floor(candidate / width);
        const edgeBonus = (x === 0 || x === width - 1 || z === 0 || z === height - 1) ? 0.01 : 0;
        if (score + edgeBonus > bestScore) {
          bestScore = score + edgeBonus;
          bestIndex = candidate;
        }
      }
      water[bestIndex] = true;
    }

    const selected = water.map((isWater, index) => isWater ? index : -1).filter((index) => index >= 0);
    for (let pass = 0; pass < 2; pass++) {
      const order = pass === 0 ? selected : selected.slice().reverse();
      for (const index of order) {
        if (!water[index]) continue;
        water[index] = false;
        if (!validLayout(water, width, height, active)) water[index] = true;
      }
    }
    return water;
  }

  // Radius-one perfect-code patterns are optimal on an infinite square grid.
  // Five phases and both orientations are tested, then boundary gaps are repaired.
  function solveLarge(width, height, active) {
    const total = width * height;
    const candidates = [completeAndPrune(new Array(total).fill(false), width, height, active)];
    for (let orientation = 0; orientation < 2; orientation++) {
      for (let phase = 0; phase < 5; phase++) {
        const seed = new Array(total).fill(false);
        for (let z = 0; z < height; z++) {
          for (let x = 0; x < width; x++) {
            const code = orientation === 0 ? (2 * x + z) : (x + 2 * z);
            if (active[z * width + x] && (code + phase) % 5 === 0) seed[z * width + x] = true;
          }
        }
        candidates.push(completeAndPrune(seed, width, height, active));
      }
    }
    candidates.sort((a, b) => a.filter(Boolean).length - b.filter(Boolean).length);
    return candidates[0];
  }

  function circleMask(diameter) {
    const center = diameter / 2;
    const radius = diameter / 2;
    return Array.from({ length: diameter * diameter }, (_, index) => {
      const blockX = index % diameter;
      const blockZ = Math.floor(index / diameter);
      const normalizedX = (blockX + 0.5 - center) / radius;
      const normalizedZ = (blockZ + 0.5 - center) / radius;
      return normalizedX ** 2 + normalizedZ ** 2 <= 1;
    });
  }

  function normalizeDiameter() {
    const value = Math.max(1, Math.min(32, Number.parseInt(diameterInput.value, 10) || 1));
    diameterInput.value = value;
    return value;
  }

  function calculate() {
    if (state.shape === "circle") {
      state.diameter = normalizeDiameter();
      state.width = state.diameter;
      state.height = state.diameter;
      state.active = circleMask(state.diameter);
    } else {
      state.width = clampInput(widthInput);
      state.height = clampInput(heightInput);
      state.active = new Array(state.width * state.height).fill(true);
    }
    state.exact = Math.min(state.width, state.height) <= 9;
    state.water = state.exact
      ? solveExact(state.width, state.height, state.active)
      : solveLarge(state.width, state.height, state.active);
    render();
  }

  function render() {
    const total = state.active.filter(Boolean).length;
    const waterCount = state.water.filter(Boolean).length;
    const caneCount = total - waterCount;
    const efficiency = total ? (caneCount / total * 100) : 0;

    blockGrid.innerHTML = "";
    axisX.innerHTML = "";
    axisZ.innerHTML = "";
    axisLayout.style.setProperty("--cols", state.width);
    axisLayout.style.setProperty("--rows", state.height);
    axisLayout.style.setProperty("--ground-1", MUD_COLORS[0]);
    axisLayout.style.setProperty("--ground-2", MUD_COLORS[1]);
    axisLayout.style.setProperty("--ground-3", MUD_COLORS[2]);
    blockGrid.className = `block-grid${state.shape === "circle" ? " circle-grid" : ""}`;
    blockGrid.setAttribute("aria-label", `${state.shape === "circle" ? "圆形" : "矩形"}甘蔗布局，${caneCount} 个种植位，${waterCount} 个水源`);

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < state.width * state.height; index++) {
      const x = index % state.width;
      const z = Math.floor(index / state.width);
      const cell = document.createElement("div");
      if (!state.active[index]) {
        cell.className = "block void";
      } else {
        const isWater = state.water[index];
        const coordinate = displayCoordinate(x, z);
        cell.className = `block ${isWater ? "water" : "cane"}`;
        cell.title = `${isWater ? "水源" : "甘蔗"} · X ${coordinate.x}, Z ${coordinate.z}`;
      }
      fragment.appendChild(cell);
    }
    blockGrid.appendChild(fragment);
    for (let x = 0; x < state.width; x++) {
      const value = axisValue(x);
      const isOrigin = value === (state.shape === "circle" ? 0 : 1);
      axisX.insertAdjacentHTML("beforeend", `<span${isOrigin ? ' class="origin"' : ""}>${value}</span>`);
    }
    for (let z = 0; z < state.height; z++) {
      const value = axisValue(z);
      const isOrigin = value === (state.shape === "circle" ? 0 : 1);
      axisZ.insertAdjacentHTML("beforeend", `<span${isOrigin ? ' class="origin"' : ""}>${value}</span>`);
    }

    $("#caneCount").textContent = caneCount;
    $("#waterCount").innerHTML = `${waterCount}<em>格</em>`;
    $("#efficiency").innerHTML = `${efficiency.toFixed(1)}<em>%</em>`;
    $("#efficiencyBar").style.width = `${efficiency}%`;
    $("#dimensionLabel").textContent = state.shape === "circle" ? `⌀ ${state.diameter} · CENTER 0,0` : `${state.width} W × ${state.height} L`;
    window.requestAnimationFrame(() => {
      updateViewportSize();
      fitGrid();
    });
  }

  function axisValue(index) {
    if (state.shape !== "circle") return index + 1;
    const originIndex = state.diameter % 2 === 0 ? state.diameter / 2 : (state.diameter - 1) / 2;
    return index - originIndex;
  }

  function displayCoordinate(x, z) {
    return { x: axisValue(x), z: axisValue(z) };
  }

  function setCellSize(size) {
    state.cellSize = Math.max(8, Math.min(1024, Math.round(size)));
    axisLayout.style.setProperty("--cell", `${state.cellSize}px`);
  }

  function updateViewportSize() {
    const panel = viewport.closest(".result-panel");
    const panelStyle = window.getComputedStyle(panel);
    const toolbar = viewport.previousElementSibling;
    const verticalPadding = Number.parseFloat(panelStyle.paddingTop) + Number.parseFloat(panelStyle.paddingBottom);
    const availableWidth = panel.clientWidth;
    const availableHeight = Math.max(80, panel.clientHeight - verticalPadding - toolbar.offsetHeight);

    viewport.style.width = `${availableWidth}px`;
    viewport.style.height = `${availableHeight}px`;
    toolbar.style.width = `${availableWidth}px`;
  }

  function centerGraphic() {
    const viewportRect = viewport.getBoundingClientRect();
    const graphicRect = blockGrid.getBoundingClientRect();
    viewport.scrollLeft += graphicRect.left + graphicRect.width / 2 - (viewportRect.left + viewportRect.width / 2);
    viewport.scrollTop += graphicRect.top + graphicRect.height / 2 - (viewportRect.top + viewportRect.height / 2);
  }

  function fitGrid() {
    const safety = 10;
    const horizontalAxisReserve = 42 * 2;
    const verticalAxisReserve = 32 * 2;
    const fitWidth = (viewport.clientWidth - 56 - horizontalAxisReserve - 12 - (state.width - 1) * 2 - safety) / state.width;
    const fitHeight = (viewport.clientHeight - 56 - verticalAxisReserve - 12 - (state.height - 1) * 2 - safety) / state.height;
    setCellSize(Math.floor(Math.min(1024, fitWidth, fitHeight)));
    window.requestAnimationFrame(centerGraphic);
  }

  function zoomWithWheel(event) {
    event.preventDefault();
    const previousSize = state.cellSize;
    const step = Math.max(2, Math.round(previousSize * 0.08));
    const nextSize = previousSize + (event.deltaY < 0 ? step : -step);
    const graphicRect = blockGrid.getBoundingClientRect();
    const anchorX = Math.max(0, Math.min(1, (event.clientX - graphicRect.left) / graphicRect.width));
    const anchorY = Math.max(0, Math.min(1, (event.clientY - graphicRect.top) / graphicRect.height));
    setCellSize(nextSize);
    if (state.cellSize === previousSize) return;

    window.requestAnimationFrame(() => {
      const nextRect = blockGrid.getBoundingClientRect();
      const anchoredX = nextRect.left + nextRect.width * anchorX;
      const anchoredY = nextRect.top + nextRect.height * anchorY;
      viewport.scrollLeft += anchoredX - event.clientX;
      viewport.scrollTop += anchoredY - event.clientY;
    });
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function exportPng() {
    const cell = Math.max(28, Math.min(52, Math.floor(1000 / state.width)));
    const gap = 2;
    const gridPadding = 6;
    const horizontalAxisReserve = 42;
    const verticalAxisReserve = 32;
    const outerPadding = 34;
    const header = 92;
    const cellsWidth = state.width * cell + (state.width - 1) * gap;
    const cellsHeight = state.height * cell + (state.height - 1) * gap;
    const gridBoxWidth = cellsWidth + gridPadding * 2;
    const gridBoxHeight = cellsHeight + gridPadding * 2;
    const axisLineX = outerPadding + horizontalAxisReserve;
    const axisLineY = header + outerPadding + verticalAxisReserve;
    const gridX = axisLineX + gridPadding;
    const gridY = axisLineY + gridPadding;
    const canvas = document.createElement("canvas");
    canvas.width = outerPadding * 2 + horizontalAxisReserve * 2 + gridBoxWidth;
    canvas.height = header + outerPadding * 2 + verticalAxisReserve * 2 + gridBoxHeight;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#181818";
    for (let y = 0; y < canvas.height; y += 16) {
      for (let x = 0; x < canvas.width; x += 16) {
        if ((x / 16 + y / 16) % 2 === 0) ctx.fillRect(x, y, 16, 16);
      }
    }

    ctx.fillStyle = "#f4f4f4";
    ctx.font = '24px "Mojangles", "GNU Unifont", monospace';
    ctx.fillText("Minecraft CaneSolver 甘蔗摆放图", outerPadding, 34);
    const waterCount = state.water.filter(Boolean).length;
    const activeCount = state.active.filter(Boolean).length;
    const shapeLabel = state.shape === "circle" ? `圆形 ⌀${state.diameter}` : `${state.width} × ${state.height}`;
    ctx.fillStyle = "#9aa096";
    ctx.font = '13px "Mojangles", "GNU Unifont", monospace';
    ctx.fillText(`${shapeLabel}  /  甘蔗 ${activeCount - waterCount}  /  水源 ${waterCount}  /  泥巴`, outerPadding, 61);

    if (state.shape === "rectangle") {
      ctx.fillStyle = "#0a0d0a";
      ctx.fillRect(axisLineX, axisLineY, gridBoxWidth, gridBoxHeight);
    }

    ctx.strokeStyle = "#697064";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(axisLineX, axisLineY - 1);
    ctx.lineTo(axisLineX + gridBoxWidth, axisLineY - 1);
    ctx.moveTo(axisLineX - 1, axisLineY);
    ctx.lineTo(axisLineX - 1, axisLineY + gridBoxHeight);
    ctx.stroke();
    ctx.font = '11px "Mojangles", "GNU Unifont", monospace';
    ctx.textAlign = "center";
    for (let x = 0; x < state.width; x++) {
      const centerX = gridX + x * (cell + gap) + cell / 2;
      const value = axisValue(x);
      const isOrigin = value === (state.shape === "circle" ? 0 : 1);
      if (isOrigin) {
        ctx.fillStyle = "#3c8527";
        ctx.fillRect(centerX - 11, axisLineY - 27, 22, 22);
      }
      ctx.fillStyle = isOrigin ? "#fff" : "#a9afa5";
      ctx.fillText(String(value), centerX, axisLineY - 11);
      ctx.fillStyle = "#697064";
      ctx.fillRect(centerX, axisLineY - 5, 1, 5);
    }
    ctx.textAlign = "center";
    for (let z = 0; z < state.height; z++) {
      const centerY = gridY + z * (cell + gap) + cell / 2;
      const labelX = axisLineX - 22;
      const value = axisValue(z);
      const isOrigin = value === (state.shape === "circle" ? 0 : 1);
      if (isOrigin) {
        ctx.fillStyle = "#3c8527";
        ctx.fillRect(labelX - 11, centerY - 11, 22, 22);
      }
      ctx.fillStyle = isOrigin ? "#fff" : "#a9afa5";
      ctx.fillText(String(value), labelX, centerY + 4);
      ctx.fillStyle = "#697064";
      ctx.fillRect(axisLineX - 5, centerY, 5, 1);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#74bd56";
    ctx.fillText("X +", axisLineX + gridBoxWidth + 21, axisLineY - 11);
    ctx.fillText("Z +", axisLineX - 22, axisLineY + gridBoxHeight + 20);
    ctx.textAlign = "left";

    for (let index = 0; index < state.water.length; index++) {
      if (!state.active[index]) continue;
      const x = index % state.width;
      const z = Math.floor(index / state.width);
      const px = gridX + x * (cell + gap);
      const py = gridY + z * (cell + gap);
      if (state.water[index]) {
        ctx.fillStyle = "#287ca8";
        ctx.fillRect(px, py, cell, cell);
        ctx.fillStyle = "#62b9de";
        ctx.fillRect(px + 3, py + 3, cell - 8, 3);
        ctx.fillStyle = "#175b82";
        ctx.fillRect(px + cell - 5, py + 4, 3, cell - 8);
      } else {
        ctx.fillStyle = MUD_COLORS[0];
        ctx.fillRect(px, py, cell, cell);
        ctx.fillStyle = MUD_COLORS[1];
        ctx.fillRect(px + 3, py + 3, Math.max(3, cell * .22), Math.max(3, cell * .16));
        ctx.fillStyle = MUD_COLORS[2];
        ctx.fillRect(px + cell - 6, py + 2, 5, cell - 4);
        const stalkWidth = Math.max(4, cell * .13);
        ctx.fillStyle = "#75a82d";
        ctx.fillRect(px + cell * .27, py + cell * .32, stalkWidth, cell * .48);
        ctx.fillStyle = "#91c43b";
        ctx.fillRect(px + cell * .44, py + cell * .18, stalkWidth, cell * .62);
        ctx.fillStyle = "#a9d84b";
        ctx.fillRect(px + cell * .61, py + cell * .29, stalkWidth, cell * .51);
        ctx.fillStyle = "#c7e969";
        ctx.fillRect(px + cell * .44, py + cell * .18, stalkWidth, 3);
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `minecraft-canesolver-${state.shape === "circle" ? `circle-${state.diameter}` : `${state.width}x${state.height}`}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast("布局图片已导出");
    }, "image/png");
  }

  $$('[data-step]').forEach((button) => button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.step);
    const min = Number(input.min) || 1;
    const max = Number(input.max) || 32;
    input.value = Math.max(min, Math.min(max, (Number(input.value) || min) + Number(button.dataset.delta)));
  }));
  $$('[data-shape]').forEach((button) => button.addEventListener("click", () => {
    state.shape = button.dataset.shape;
    $$('[data-shape]').forEach((item) => item.classList.toggle("active", item === button));
    $("#rectangleFields").hidden = state.shape !== "rectangle";
    $("#circleFields").hidden = state.shape !== "circle";
    calculate();
  }));
  calculateBtn.addEventListener("click", () => {
    calculateBtn.classList.add("loading");
    calculateBtn.querySelector("small").textContent = "SOLVING GRID...";
    window.setTimeout(() => {
      calculate();
      calculateBtn.classList.remove("loading");
      calculateBtn.querySelector("small").textContent = "CALCULATE LAYOUT";
    }, 30);
  });
  viewport.addEventListener("wheel", zoomWithWheel, { passive: false });
  $("#fitBtn").addEventListener("click", fitGrid);
  $("#exportBtn").addEventListener("click", exportPng);
  window.addEventListener("resize", () => window.requestAnimationFrame(() => {
    updateViewportSize();
    fitGrid();
  }));

  calculate();
})();
