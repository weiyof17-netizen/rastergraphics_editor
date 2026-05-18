const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 650;
const SVG_NS = "http://www.w3.org/2000/svg";

const state = {
  tool: "select",
  shapes: [],
  selectedId: null,
  history: [],
  future: [],
  drag: null,
  palette: {
    fill: "#f2b84b",
    stroke: "#143642",
    strokeWidth: 3,
    opacity: 1,
    text: "Новый текст"
  }
};

const els = {
  canvas: document.querySelector("#canvas"),
  gridLayer: document.querySelector("#gridLayer"),
  drawingLayer: document.querySelector("#drawingLayer"),
  selectionLayer: document.querySelector("#selectionLayer"),
  toolButtons: document.querySelectorAll("[data-tool]"),
  fillColor: document.querySelector("#fillColor"),
  strokeColor: document.querySelector("#strokeColor"),
  strokeWidth: document.querySelector("#strokeWidth"),
  strokeWidthValue: document.querySelector("#strokeWidthValue"),
  opacityRange: document.querySelector("#opacityRange"),
  opacityValue: document.querySelector("#opacityValue"),
  textValue: document.querySelector("#textValue"),
  gridToggle: document.querySelector("#gridToggle"),
  statusText: document.querySelector("#statusText"),
  selectionHint: document.querySelector("#selectionHint"),
  layerList: document.querySelector("#layerList"),
  propX: document.querySelector("#propX"),
  propY: document.querySelector("#propY"),
  propWidth: document.querySelector("#propWidth"),
  propHeight: document.querySelector("#propHeight"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  duplicateButton: document.querySelector("#duplicateButton"),
  deleteButton: document.querySelector("#deleteButton"),
  clearButton: document.querySelector("#clearButton"),
  frontButton: document.querySelector("#frontButton"),
  backButton: document.querySelector("#backButton"),
  exportSvgButton: document.querySelector("#exportSvgButton"),
  exportPngButton: document.querySelector("#exportPngButton"),
  saveJsonButton: document.querySelector("#saveJsonButton"),
  openJsonInput: document.querySelector("#openJsonInput")
};

function createId() {
  return `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function snapshot() {
  return JSON.stringify({
    shapes: state.shapes,
    selectedId: state.selectedId
  });
}

function restore(serialized) {
  const data = JSON.parse(serialized);
  state.shapes = data.shapes;
  state.selectedId = data.selectedId;
  state.drag = null;
  render();
}

function remember() {
  state.history.push(snapshot());
  if (state.history.length > 60) {
    state.history.shift();
  }
  state.future = [];
}

function undo() {
  if (!state.history.length) return;
  state.future.push(snapshot());
  restore(state.history.pop());
  setStatus("Действие отменено");
}

function redo() {
  if (!state.future.length) return;
  state.history.push(snapshot());
  restore(state.future.pop());
  setStatus("Действие повторено");
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function selectedShape() {
  return state.shapes.find((shape) => shape.id === state.selectedId) || null;
}

function pointerPosition(event) {
  const point = els.canvas.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(els.canvas.getScreenCTM().inverse());
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizedRect(start, current) {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y)
  };
}

function shapeName(type) {
  return {
    rect: "Прямоугольник",
    ellipse: "Эллипс",
    line: "Линия",
    path: "Свободная линия",
    text: "Текст"
  }[type] || "Объект";
}

function baseStyle() {
  return {
    fill: state.palette.fill,
    stroke: state.palette.stroke,
    strokeWidth: Number(state.palette.strokeWidth),
    opacity: Number(state.palette.opacity)
  };
}

function createShape(type, start, current = start) {
  const common = {
    id: createId(),
    type,
    ...baseStyle()
  };

  if (type === "rect") {
    return { ...common, ...normalizedRect(start, current) };
  }

  if (type === "ellipse") {
    const box = normalizedRect(start, current);
    return {
      ...common,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height
    };
  }

  if (type === "line") {
    return {
      ...common,
      fill: "none",
      x1: start.x,
      y1: start.y,
      x2: current.x,
      y2: current.y
    };
  }

  if (type === "path") {
    return {
      ...common,
      fill: "none",
      points: [start]
    };
  }

  return {
    ...common,
    x: start.x,
    y: start.y,
    width: 180,
    height: 42,
    fontSize: 28,
    text: state.palette.text || "Новый текст",
    stroke: "none"
  };
}

function updateDraftShape(shape, start, current) {
  if (shape.type === "rect") {
    Object.assign(shape, normalizedRect(start, current));
  }

  if (shape.type === "ellipse") {
    const box = normalizedRect(start, current);
    Object.assign(shape, box);
  }

  if (shape.type === "line") {
    shape.x2 = current.x;
    shape.y2 = current.y;
  }

  if (shape.type === "path") {
    const last = shape.points[shape.points.length - 1];
    const distance = Math.hypot(current.x - last.x, current.y - last.y);
    if (distance > 2) {
      shape.points.push(current);
    }
  }
}

function pathData(points) {
  if (!points.length) return "";
  const [first, ...rest] = points;
  return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ")}`;
}

function createSvgElement(shape) {
  let node;

  if (shape.type === "rect") {
    node = document.createElementNS(SVG_NS, "rect");
    node.setAttribute("x", shape.x);
    node.setAttribute("y", shape.y);
    node.setAttribute("width", Math.max(1, shape.width));
    node.setAttribute("height", Math.max(1, shape.height));
    node.setAttribute("rx", 8);
  }

  if (shape.type === "ellipse") {
    node = document.createElementNS(SVG_NS, "ellipse");
    node.setAttribute("cx", shape.x + shape.width / 2);
    node.setAttribute("cy", shape.y + shape.height / 2);
    node.setAttribute("rx", Math.max(1, shape.width / 2));
    node.setAttribute("ry", Math.max(1, shape.height / 2));
  }

  if (shape.type === "line") {
    node = document.createElementNS(SVG_NS, "line");
    node.setAttribute("x1", shape.x1);
    node.setAttribute("y1", shape.y1);
    node.setAttribute("x2", shape.x2);
    node.setAttribute("y2", shape.y2);
    node.setAttribute("stroke-linecap", "round");
  }

  if (shape.type === "path") {
    node = document.createElementNS(SVG_NS, "path");
    node.setAttribute("d", pathData(shape.points));
    node.setAttribute("stroke-linecap", "round");
    node.setAttribute("stroke-linejoin", "round");
  }

  if (shape.type === "text") {
    node = document.createElementNS(SVG_NS, "text");
    node.setAttribute("x", shape.x);
    node.setAttribute("y", shape.y + shape.fontSize);
    node.setAttribute("font-size", shape.fontSize);
    node.setAttribute("font-family", "Segoe UI, Arial, sans-serif");
    node.textContent = shape.text;
  }

  node.dataset.id = shape.id;
  node.classList.add("shape");
  node.setAttribute("fill", shape.fill);
  node.setAttribute("stroke", shape.stroke);
  node.setAttribute("stroke-width", shape.strokeWidth);
  node.setAttribute("opacity", shape.opacity);
  return node;
}

function boundsOf(shape) {
  if (!shape) return null;

  if (shape.type === "rect" || shape.type === "ellipse" || shape.type === "text") {
    return {
      x: shape.x,
      y: shape.y,
      width: Math.max(1, shape.width),
      height: Math.max(1, shape.height)
    };
  }

  if (shape.type === "line") {
    const x = Math.min(shape.x1, shape.x2);
    const y = Math.min(shape.y1, shape.y2);
    return {
      x,
      y,
      width: Math.max(1, Math.abs(shape.x2 - shape.x1)),
      height: Math.max(1, Math.abs(shape.y2 - shape.y1))
    };
  }

  const xs = shape.points.map((point) => point.x);
  const ys = shape.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y)
  };
}

function moveShape(shape, dx, dy) {
  if (shape.type === "rect" || shape.type === "ellipse" || shape.type === "text") {
    shape.x += dx;
    shape.y += dy;
  }

  if (shape.type === "line") {
    shape.x1 += dx;
    shape.y1 += dy;
    shape.x2 += dx;
    shape.y2 += dy;
  }

  if (shape.type === "path") {
    shape.points = shape.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  }
}

function applyBounds(shape, nextBounds) {
  const current = boundsOf(shape);
  if (!current) return;

  const bounds = {
    x: Number.isFinite(nextBounds.x) ? nextBounds.x : current.x,
    y: Number.isFinite(nextBounds.y) ? nextBounds.y : current.y,
    width: Math.max(1, Number.isFinite(nextBounds.width) ? nextBounds.width : current.width),
    height: Math.max(1, Number.isFinite(nextBounds.height) ? nextBounds.height : current.height)
  };

  if (shape.type === "rect" || shape.type === "ellipse" || shape.type === "text") {
    shape.x = bounds.x;
    shape.y = bounds.y;
    shape.width = bounds.width;
    shape.height = bounds.height;
  }

  if (shape.type === "line") {
    const sx = bounds.width / current.width;
    const sy = bounds.height / current.height;
    shape.x1 = bounds.x + (shape.x1 - current.x) * sx;
    shape.y1 = bounds.y + (shape.y1 - current.y) * sy;
    shape.x2 = bounds.x + (shape.x2 - current.x) * sx;
    shape.y2 = bounds.y + (shape.y2 - current.y) * sy;
  }

  if (shape.type === "path") {
    const sx = bounds.width / current.width;
    const sy = bounds.height / current.height;
    shape.points = shape.points.map((point) => ({
      x: bounds.x + (point.x - current.x) * sx,
      y: bounds.y + (point.y - current.y) * sy
    }));
  }
}

function renderSelection() {
  els.selectionLayer.innerHTML = "";
  const shape = selectedShape();
  const box = boundsOf(shape);
  if (!box) return;

  const padding = 6;
  const selection = document.createElementNS(SVG_NS, "rect");
  selection.classList.add("selection-box");
  selection.setAttribute("x", box.x - padding);
  selection.setAttribute("y", box.y - padding);
  selection.setAttribute("width", box.width + padding * 2);
  selection.setAttribute("height", box.height + padding * 2);
  els.selectionLayer.appendChild(selection);

  const handles = [
    [box.x - padding, box.y - padding],
    [box.x + box.width + padding, box.y - padding],
    [box.x + box.width + padding, box.y + box.height + padding],
    [box.x - padding, box.y + box.height + padding]
  ];

  handles.forEach(([x, y]) => {
    const handle = document.createElementNS(SVG_NS, "rect");
    handle.classList.add("selection-handle");
    handle.setAttribute("x", x - 4);
    handle.setAttribute("y", y - 4);
    handle.setAttribute("width", 8);
    handle.setAttribute("height", 8);
    handle.setAttribute("rx", 2);
    els.selectionLayer.appendChild(handle);
  });
}

function renderLayers() {
  els.layerList.innerHTML = "";
  [...state.shapes].reverse().forEach((shape, indexFromTop) => {
    const button = document.createElement("button");
    const layerNumber = state.shapes.length - indexFromTop;
    button.className = `layer-item${shape.id === state.selectedId ? " is-active" : ""}`;
    button.type = "button";
    button.innerHTML = `<span>${layerNumber}. ${shapeName(shape.type)}</span><span class="layer-type">${shape.type}</span>`;
    button.addEventListener("click", () => {
      state.selectedId = shape.id;
      render();
    });
    els.layerList.appendChild(button);
  });
}

function syncInspector() {
  const shape = selectedShape();
  const box = boundsOf(shape);
  const inputs = [els.propX, els.propY, els.propWidth, els.propHeight];

  inputs.forEach((input) => {
    input.disabled = !shape;
  });

  if (!shape || !box) {
    els.selectionHint.textContent = "Объект не выбран";
    inputs.forEach((input) => {
      input.value = "";
    });
    return;
  }

  els.selectionHint.textContent = `${shapeName(shape.type)}: ${shape.id}`;
  els.propX.value = Math.round(box.x);
  els.propY.value = Math.round(box.y);
  els.propWidth.value = Math.round(box.width);
  els.propHeight.value = Math.round(box.height);

  els.fillColor.value = normalizeColor(shape.fill, state.palette.fill);
  els.strokeColor.value = normalizeColor(shape.stroke, state.palette.stroke);
  els.strokeWidth.value = shape.strokeWidth;
  els.strokeWidthValue.textContent = shape.strokeWidth;
  els.opacityRange.value = Math.round(shape.opacity * 100);
  els.opacityValue.textContent = `${Math.round(shape.opacity * 100)}%`;
  if (shape.type === "text") {
    els.textValue.value = shape.text;
  }
}

function normalizeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function render() {
  els.drawingLayer.innerHTML = "";
  state.shapes.forEach((shape) => {
    els.drawingLayer.appendChild(createSvgElement(shape));
  });
  renderSelection();
  renderLayers();
  syncInspector();
  els.undoButton.disabled = state.history.length === 0;
  els.redoButton.disabled = state.future.length === 0;
}

function selectTool(tool) {
  state.tool = tool;
  els.toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === tool);
  });
  setStatus(tool === "select" ? "Режим выделения" : `Инструмент: ${shapeName(tool)}`);
}

function startCanvasAction(event) {
  const position = pointerPosition(event);
  const targetId = event.target.dataset.id;

  if (state.tool === "select") {
    if (targetId) {
      const shape = state.shapes.find((item) => item.id === targetId);
      state.selectedId = targetId;
      remember();
      state.drag = {
        mode: "move",
        start: position,
        last: position,
        shapeId: targetId,
        original: JSON.parse(JSON.stringify(shape))
      };
      els.canvas.setPointerCapture(event.pointerId);
      render();
      setStatus("Перемещение объекта");
      return;
    }

    state.selectedId = null;
    render();
    setStatus("Выделение снято");
    return;
  }

  remember();
  const shape = createShape(state.tool, position, position);
  state.shapes.push(shape);
  state.selectedId = shape.id;
  state.drag = {
    mode: "draw",
    start: position,
    shapeId: shape.id
  };
  els.canvas.setPointerCapture(event.pointerId);
  render();

  if (state.tool === "text") {
    finishCanvasAction(event);
  }
}

function updateCanvasAction(event) {
  if (!state.drag) return;
  const position = pointerPosition(event);
  const shape = state.shapes.find((item) => item.id === state.drag.shapeId);
  if (!shape) return;

  if (state.drag.mode === "draw") {
    updateDraftShape(shape, state.drag.start, position);
  }

  if (state.drag.mode === "move") {
    const dx = position.x - state.drag.last.x;
    const dy = position.y - state.drag.last.y;
    moveShape(shape, dx, dy);
    state.drag.last = position;
  }

  render();
}

function finishCanvasAction(event) {
  if (!state.drag) return;
  const shape = state.shapes.find((item) => item.id === state.drag.shapeId);

  if (shape && state.drag.mode === "draw") {
    const box = boundsOf(shape);
    const tooSmall = box && box.width < 4 && box.height < 4 && shape.type !== "text" && shape.type !== "path";
    if (tooSmall) {
      state.shapes = state.shapes.filter((item) => item.id !== shape.id);
      state.selectedId = null;
      setStatus("Слишком маленький объект не добавлен");
    } else {
      setStatus(`${shapeName(shape.type)} добавлен`);
    }
  }

  if (state.drag.mode === "move") {
    setStatus("Положение объекта изменено");
  }

  if (event.pointerId !== undefined && els.canvas.hasPointerCapture(event.pointerId)) {
    els.canvas.releasePointerCapture(event.pointerId);
  }

  state.drag = null;
  render();
}

function deleteSelected() {
  if (!state.selectedId) return;
  remember();
  state.shapes = state.shapes.filter((shape) => shape.id !== state.selectedId);
  state.selectedId = null;
  render();
  setStatus("Объект удален");
}

function duplicateSelected() {
  const shape = selectedShape();
  if (!shape) return;
  remember();
  const copy = JSON.parse(JSON.stringify(shape));
  copy.id = createId();
  moveShape(copy, 24, 24);
  state.shapes.push(copy);
  state.selectedId = copy.id;
  render();
  setStatus("Объект продублирован");
}

function reorderSelected(direction) {
  const index = state.shapes.findIndex((shape) => shape.id === state.selectedId);
  if (index < 0) return;
  const nextIndex = direction === "front" ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= state.shapes.length) return;
  remember();
  const [shape] = state.shapes.splice(index, 1);
  state.shapes.splice(nextIndex, 0, shape);
  render();
  setStatus(direction === "front" ? "Объект поднят выше" : "Объект опущен ниже");
}

function clearDocument() {
  if (!state.shapes.length) return;
  remember();
  state.shapes = [];
  state.selectedId = null;
  render();
  setStatus("Холст очищен");
}

function updateSelectedStyle() {
  const shape = selectedShape();
  if (!shape) return;
  remember();
  shape.fill = shape.type === "line" || shape.type === "path" ? "none" : state.palette.fill;
  shape.stroke = shape.type === "text" ? "none" : state.palette.stroke;
  shape.strokeWidth = state.palette.strokeWidth;
  shape.opacity = state.palette.opacity;
  render();
  setStatus("Стиль объекта обновлен");
}

function updateSelectedText() {
  const shape = selectedShape();
  if (!shape || shape.type !== "text") return;
  remember();
  shape.text = state.palette.text;
  shape.width = Math.max(80, shape.text.length * shape.fontSize * 0.58);
  render();
  setStatus("Текст обновлен");
}

function updateSelectedBounds() {
  const shape = selectedShape();
  if (!shape) return;
  remember();
  applyBounds(shape, {
    x: Number(els.propX.value),
    y: Number(els.propY.value),
    width: Number(els.propWidth.value),
    height: Number(els.propHeight.value)
  });
  render();
  setStatus("Размеры объекта обновлены");
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shapeMarkup(shape) {
  const style = `fill="${escapeText(shape.fill)}" stroke="${escapeText(shape.stroke)}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}"`;

  if (shape.type === "rect") {
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="8" ${style}/>`;
  }

  if (shape.type === "ellipse") {
    return `<ellipse cx="${shape.x + shape.width / 2}" cy="${shape.y + shape.height / 2}" rx="${shape.width / 2}" ry="${shape.height / 2}" ${style}/>`;
  }

  if (shape.type === "line") {
    return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${style} stroke-linecap="round"/>`;
  }

  if (shape.type === "path") {
    return `<path d="${pathData(shape.points)}" ${style} stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  return `<text x="${shape.x}" y="${shape.y + shape.fontSize}" font-size="${shape.fontSize}" font-family="Segoe UI, Arial, sans-serif" ${style}>${escapeText(shape.text)}</text>`;
}

function exportSvgString() {
  return [
    `<svg xmlns="${SVG_NS}" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">`,
    `<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="#ffffff"/>`,
    ...state.shapes.map(shapeMarkup),
    "</svg>"
  ].join("\n");
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSvg() {
  downloadFile("vector-editor-image.svg", exportSvgString(), "image/svg+xml;charset=utf-8");
  setStatus("SVG экспортирован");
}

function exportPng() {
  const svg = exportSvgString();
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = "vector-editor-image.png";
      link.click();
      URL.revokeObjectURL(pngUrl);
      setStatus("PNG экспортирован");
    });
  };

  image.src = url;
}

function saveJson() {
  const content = JSON.stringify({
    version: 1,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    shapes: state.shapes
  }, null, 2);
  downloadFile("vector-editor-document.json", content, "application/json;charset=utf-8");
  setStatus("Документ сохранен в JSON");
}

function openJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.shapes)) {
        throw new Error("Некорректная структура файла");
      }
      remember();
      state.shapes = data.shapes;
      state.selectedId = null;
      render();
      setStatus("Документ открыт");
    } catch (error) {
      setStatus(`Ошибка открытия: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function seedDocument() {
  state.shapes = [
    {
      id: createId(),
      type: "rect",
      x: 90,
      y: 90,
      width: 285,
      height: 160,
      fill: "#f2b84b",
      stroke: "#143642",
      strokeWidth: 4,
      opacity: 0.92
    },
    {
      id: createId(),
      type: "ellipse",
      x: 470,
      y: 90,
      width: 210,
      height: 160,
      fill: "#8fd0c9",
      stroke: "#14645f",
      strokeWidth: 5,
      opacity: 0.86
    },
    {
      id: createId(),
      type: "line",
      x1: 130,
      y1: 360,
      x2: 820,
      y2: 470,
      fill: "none",
      stroke: "#d95f43",
      strokeWidth: 8,
      opacity: 0.9
    },
    {
      id: createId(),
      type: "path",
      points: [
        { x: 620, y: 350 },
        { x: 665, y: 310 },
        { x: 720, y: 340 },
        { x: 755, y: 300 },
        { x: 820, y: 330 },
        { x: 860, y: 285 }
      ],
      fill: "none",
      stroke: "#143642",
      strokeWidth: 5,
      opacity: 1
    },
    {
      id: createId(),
      type: "text",
      x: 90,
      y: 285,
      width: 430,
      height: 48,
      fontSize: 34,
      text: "Векторная композиция",
      fill: "#143642",
      stroke: "none",
      strokeWidth: 0,
      opacity: 1
    }
  ];
}

els.toolButtons.forEach((button) => {
  button.addEventListener("click", () => selectTool(button.dataset.tool));
});

els.canvas.addEventListener("pointerdown", startCanvasAction);
els.canvas.addEventListener("pointermove", updateCanvasAction);
els.canvas.addEventListener("pointerup", finishCanvasAction);
els.canvas.addEventListener("pointerleave", finishCanvasAction);

els.fillColor.addEventListener("input", () => {
  state.palette.fill = els.fillColor.value;
  updateSelectedStyle();
});

els.strokeColor.addEventListener("input", () => {
  state.palette.stroke = els.strokeColor.value;
  updateSelectedStyle();
});

els.strokeWidth.addEventListener("input", () => {
  state.palette.strokeWidth = Number(els.strokeWidth.value);
  els.strokeWidthValue.textContent = els.strokeWidth.value;
  updateSelectedStyle();
});

els.opacityRange.addEventListener("input", () => {
  state.palette.opacity = Number(els.opacityRange.value) / 100;
  els.opacityValue.textContent = `${els.opacityRange.value}%`;
  updateSelectedStyle();
});

els.textValue.addEventListener("change", () => {
  state.palette.text = els.textValue.value;
  updateSelectedText();
});

els.gridToggle.addEventListener("change", () => {
  els.gridLayer.style.display = els.gridToggle.checked ? "" : "none";
});

[els.propX, els.propY, els.propWidth, els.propHeight].forEach((input) => {
  input.addEventListener("change", updateSelectedBounds);
});

els.undoButton.addEventListener("click", undo);
els.redoButton.addEventListener("click", redo);
els.duplicateButton.addEventListener("click", duplicateSelected);
els.deleteButton.addEventListener("click", deleteSelected);
els.clearButton.addEventListener("click", clearDocument);
els.frontButton.addEventListener("click", () => reorderSelected("front"));
els.backButton.addEventListener("click", () => reorderSelected("back"));
els.exportSvgButton.addEventListener("click", exportSvg);
els.exportPngButton.addEventListener("click", exportPng);
els.saveJsonButton.addEventListener("click", saveJson);
els.openJsonInput.addEventListener("change", (event) => openJson(event.target.files[0]));

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  }

  if (event.ctrlKey && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
  }

  if (event.ctrlKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelected();
  }

  if (event.key === "Delete") {
    deleteSelected();
  }

  if (event.key === "Escape") {
    state.selectedId = null;
    state.drag = null;
    render();
    setStatus("Выделение снято");
  }
});

seedDocument();
render();
