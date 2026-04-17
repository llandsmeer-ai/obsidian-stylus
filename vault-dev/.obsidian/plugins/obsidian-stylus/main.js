var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => StylusPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  defaultWidth: 800,
  defaultHeight: 600,
  defaultPenColor: "#000000",
  defaultPenWidth: 2,
  smoothing: 0.5,
  savePath: "stylus",
  barrelButtonAction: "cycle-color"
};
var PEN_COLORS = [
  "#000000",
  // black
  "#e03131",
  // red
  "#1971c2",
  // blue
  "#2f9e44",
  // green
  "#e8590c",
  // orange
  "#9c36b5"
  // purple
];
var PEN_WIDTHS = [
  { label: "Fine", value: 1 },
  { label: "Medium", value: 2 },
  { label: "Thick", value: 4 },
  { label: "Marker", value: 8 }
];
function blankSvg(w, h) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `  <g data-stylus="strokes"></g>`,
    `</svg>`
  ].join("\n");
}
function ensureStylusGroup(svgText) {
  if (svgText.includes('data-stylus="strokes"'))
    return svgText;
  return svgText.replace(
    "</svg>",
    '  <g data-stylus="strokes"></g>\n</svg>'
  );
}
function buildPathD(points, smoothing) {
  if (points.length === 0)
    return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  if (points.length === 2 || smoothing === 0) {
    let d2 = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      d2 += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
    }
    return d2;
  }
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const midX = curr.x + (next.x - curr.x) * 0.5;
    const midY = curr.y + (next.y - curr.y) * 0.5;
    const cpX = prev.x + (curr.x - prev.x) * (0.5 + smoothing * 0.5);
    const cpY = prev.y + (curr.y - prev.y) * (0.5 + smoothing * 0.5);
    d += ` Q ${cpX.toFixed(2)} ${cpY.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  const secondLast = points[points.length - 2];
  d += ` Q ${secondLast.x.toFixed(2)} ${secondLast.y.toFixed(2)} ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}
var stylusIdCounter = 0;
function nextStylusId() {
  return `s${Date.now()}-${stylusIdCounter++}`;
}
var ResizeModal = class extends import_obsidian.Modal {
  constructor(app, currentW, currentH, onSubmit) {
    super(app);
    this.width = currentW;
    this.height = currentH;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Resize SVG Canvas" });
    new import_obsidian.Setting(contentEl).setName("Width (px)").addText(
      (text) => text.setValue(String(this.width)).onChange((v) => {
        this.width = parseInt(v, 10) || this.width;
      })
    );
    new import_obsidian.Setting(contentEl).setName("Height (px)").addText(
      (text) => text.setValue(String(this.height)).onChange((v) => {
        this.height = parseInt(v, 10) || this.height;
      })
    );
    new import_obsidian.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Apply").setCta().onClick(() => {
        this.onSubmit(this.width, this.height);
        this.close();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
var CreateSvgModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.filename = "drawing";
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Create New SVG Drawing" });
    new import_obsidian.Setting(contentEl).setName("Filename").addText(
      (text) => text.setPlaceholder("drawing").setValue(this.filename).onChange((v) => {
        this.filename = v.trim() || "drawing";
      })
    );
    new import_obsidian.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Create").setCta().onClick(() => {
        this.onSubmit(this.filename);
        this.close();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
var StylusCanvas = class {
  constructor(app, file, settings, container, svgContent) {
    // Drawing state
    this.svgEl = null;
    this.strokesGroup = null;
    this.currentTool = "pen";
    this.isDrawing = false;
    this.currentPoints = [];
    this.currentPath = null;
    // Undo/redo stacks store SVG path element outerHTML
    this.undoStack = [];
    this.redoStack = [];
    // Save debounce
    this.saveTimeout = null;
    // Toolbar references for active state
    this.toolButtons = /* @__PURE__ */ new Map();
    this.colorButtons = /* @__PURE__ */ new Map();
    this.widthButtons = /* @__PURE__ */ new Map();
    this.onPointerDown = (e) => {
      if (!this.svgEl || !this.strokesGroup)
        return;
      if (e.button === 2 && e.pointerType === "pen") {
        e.preventDefault();
        e.stopPropagation();
        this.handleBarrelButton();
        return;
      }
      const isEraserTip = e.button === 5 || (e.buttons & 32) !== 0;
      if (isEraserTip) {
        this.eraseAtPoint(e);
        return;
      }
      if (e.button !== 0)
        return;
      e.preventDefault();
      this.svgEl.setPointerCapture(e.pointerId);
      if (this.currentTool === "eraser") {
        this.eraseAtPoint(e);
        return;
      }
      this.isDrawing = true;
      this.currentPoints = [this.getSvgPoint(e)];
      this.redoStack = [];
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("stroke", this.currentColor);
      path.setAttribute("stroke-width", String(this.currentWidth));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("data-stylus-id", nextStylusId());
      this.strokesGroup.appendChild(path);
      this.currentPath = path;
    };
    this.onPointerMove = (e) => {
      if (!this.svgEl)
        return;
      const isEraserTip = (e.buttons & 32) !== 0;
      if (isEraserTip) {
        this.eraseAtPoint(e);
        return;
      }
      if (this.currentTool === "eraser" && (e.buttons & 1) !== 0) {
        this.eraseAtPoint(e);
        return;
      }
      if (!this.isDrawing || !this.currentPath)
        return;
      e.preventDefault();
      const pt = this.getSvgPoint(e);
      this.currentPoints.push(pt);
      const d = buildPathD(this.currentPoints, this.settings.smoothing);
      this.currentPath.setAttribute("d", d);
    };
    this.onPointerUp = (e) => {
      if (!this.isDrawing || !this.currentPath) {
        this.isDrawing = false;
        return;
      }
      this.isDrawing = false;
      if (this.currentPoints.length > 0) {
        const d = buildPathD(this.currentPoints, this.settings.smoothing);
        this.currentPath.setAttribute("d", d);
        this.undoStack.push(this.currentPath.outerHTML);
      } else {
        this.currentPath.remove();
      }
      this.currentPath = null;
      this.currentPoints = [];
      this.scheduleSave();
    };
    this.onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        this.redo();
      } else if (mod && e.key === "y") {
        e.preventDefault();
        this.redo();
      }
    };
    this.app = app;
    this.file = file;
    this.settings = settings;
    this.container = container;
    this.currentColor = settings.defaultPenColor;
    this.currentWidth = settings.defaultPenWidth;
    this.render(svgContent);
  }
  render(svgContent) {
    this.container.empty();
    this.container.addClass("stylus-canvas-wrapper");
    const toolbar = this.container.createDiv({ cls: "stylus-toolbar" });
    this.buildToolbar(toolbar);
    const svgContainer = this.container.createDiv({ cls: "stylus-svg-container" });
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const svgRoot = doc.querySelector("svg");
    if (!svgRoot) {
      svgContainer.createEl("p", { text: "Failed to parse SVG." });
      return;
    }
    const liveSvg = svgContainer.createSvg("svg");
    for (const attr of Array.from(svgRoot.attributes)) {
      liveSvg.setAttribute(attr.name, attr.value);
    }
    liveSvg.innerHTML = svgRoot.innerHTML;
    liveSvg.addClass("stylus-svg");
    this.svgEl = liveSvg;
    let strokesG = liveSvg.querySelector('g[data-stylus="strokes"]');
    if (!strokesG) {
      strokesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      strokesG.setAttribute("data-stylus", "strokes");
      liveSvg.appendChild(strokesG);
    }
    this.strokesGroup = strokesG;
    this.undoStack = [];
    this.redoStack = [];
    liveSvg.addEventListener("pointerdown", this.onPointerDown);
    liveSvg.addEventListener("pointermove", this.onPointerMove);
    liveSvg.addEventListener("pointerup", this.onPointerUp);
    liveSvg.addEventListener("pointerleave", this.onPointerUp);
    liveSvg.style.touchAction = "none";
    this.container.setAttribute("tabindex", "0");
    this.container.addEventListener("keydown", this.onKeyDown);
  }
  buildToolbar(toolbar) {
    const toolGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });
    const penBtn = toolGroup.createEl("button", {
      cls: "stylus-btn stylus-btn-active",
      attr: { "aria-label": "Pen" }
    });
    penBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>`;
    penBtn.addEventListener("click", () => this.setTool("pen"));
    this.toolButtons.set("pen", penBtn);
    const eraserBtn = toolGroup.createEl("button", {
      cls: "stylus-btn",
      attr: { "aria-label": "Eraser" }
    });
    eraserBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`;
    eraserBtn.addEventListener("click", () => this.setTool("eraser"));
    this.toolButtons.set("eraser", eraserBtn);
    toolbar.createDiv({ cls: "stylus-toolbar-sep" });
    const colorGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });
    for (const color of PEN_COLORS) {
      const btn = colorGroup.createEl("button", {
        cls: "stylus-color-btn" + (color === this.currentColor ? " stylus-btn-active" : ""),
        attr: { "aria-label": `Color ${color}` }
      });
      btn.style.setProperty("--swatch-color", color);
      btn.createDiv({ cls: "stylus-color-swatch" });
      btn.addEventListener("click", () => this.setColor(color));
      this.colorButtons.set(color, btn);
    }
    toolbar.createDiv({ cls: "stylus-toolbar-sep" });
    const widthGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });
    for (const pw of PEN_WIDTHS) {
      const btn = widthGroup.createEl("button", {
        cls: "stylus-width-btn" + (pw.value === this.currentWidth ? " stylus-btn-active" : ""),
        attr: { "aria-label": pw.label }
      });
      const line = btn.createDiv({ cls: "stylus-width-indicator" });
      line.style.height = `${Math.max(pw.value, 1)}px`;
      btn.addEventListener("click", () => this.setWidth(pw.value));
      this.widthButtons.set(pw.value, btn);
    }
    toolbar.createDiv({ cls: "stylus-toolbar-sep" });
    const histGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });
    const undoBtn = histGroup.createEl("button", {
      cls: "stylus-btn",
      attr: { "aria-label": "Undo" }
    });
    undoBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;
    undoBtn.addEventListener("click", () => this.undo());
    const redoBtn = histGroup.createEl("button", {
      cls: "stylus-btn",
      attr: { "aria-label": "Redo" }
    });
    redoBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>`;
    redoBtn.addEventListener("click", () => this.redo());
    toolbar.createDiv({ cls: "stylus-toolbar-sep" });
    const resizeGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });
    const resizeBtn = resizeGroup.createEl("button", {
      cls: "stylus-btn",
      attr: { "aria-label": "Resize canvas" }
    });
    resizeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/></svg>`;
    resizeBtn.addEventListener("click", () => this.openResize());
  }
  // ── Tool switching ───────────────────────────────────────────────────────
  setTool(tool) {
    this.currentTool = tool;
    this.toolButtons.forEach((btn, key) => {
      btn.toggleClass("stylus-btn-active", key === tool);
    });
    if (this.svgEl) {
      this.svgEl.style.cursor = tool === "eraser" ? "crosshair" : "default";
    }
  }
  setColor(color) {
    this.currentColor = color;
    this.colorButtons.forEach((btn, key) => {
      btn.toggleClass("stylus-btn-active", key === color);
    });
    if (this.currentTool !== "pen")
      this.setTool("pen");
  }
  setWidth(width) {
    this.currentWidth = width;
    this.widthButtons.forEach((btn, key) => {
      btn.toggleClass("stylus-btn-active", key === width);
    });
  }
  cycleColor() {
    const idx = PEN_COLORS.indexOf(this.currentColor);
    const next = PEN_COLORS[(idx + 1) % PEN_COLORS.length];
    this.setColor(next);
  }
  // ── Barrel button handling ───────────────────────────────────────────────
  handleBarrelButton() {
    switch (this.settings.barrelButtonAction) {
      case "cycle-color":
        this.cycleColor();
        break;
      case "toggle-tool":
        this.setTool(this.currentTool === "pen" ? "eraser" : "pen");
        break;
      case "undo":
        this.undo();
        break;
    }
  }
  // ── Pointer event handlers ───────────────────────────────────────────────
  getSvgPoint(e) {
    const svg = this.svgEl;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX + viewBox.x,
      y: (e.clientY - rect.top) * scaleY + viewBox.y,
      pressure: e.pressure
    };
  }
  // ── Eraser ───────────────────────────────────────────────────────────────
  eraseAtPoint(e) {
    if (!this.svgEl || !this.strokesGroup)
      return;
    const target = e.target;
    if (target instanceof SVGPathElement && target.closest('g[data-stylus="strokes"]') === this.strokesGroup) {
      const outerHTML = target.outerHTML;
      target.remove();
      this.undoStack.push("ERASE:" + outerHTML);
      this.redoStack = [];
      this.scheduleSave();
    }
  }
  // ── Undo / Redo ─────────────────────────────────────────────────────────
  undo() {
    if (!this.strokesGroup || this.undoStack.length === 0)
      return;
    const action = this.undoStack.pop();
    this.redoStack.push(action);
    if (action.startsWith("ERASE:")) {
      const html = action.slice(6);
      const temp = document.createElementNS("http://www.w3.org/2000/svg", "g");
      temp.innerHTML = html;
      const path = temp.firstElementChild;
      if (path)
        this.strokesGroup.appendChild(path);
    } else {
      const temp = document.createElementNS("http://www.w3.org/2000/svg", "g");
      temp.innerHTML = action;
      const ref = temp.firstElementChild;
      const id = ref == null ? void 0 : ref.getAttribute("data-stylus-id");
      if (id) {
        const existing = this.strokesGroup.querySelector(`[data-stylus-id="${id}"]`);
        if (existing)
          existing.remove();
      } else {
        const lastPath = this.strokesGroup.lastElementChild;
        if (lastPath)
          lastPath.remove();
      }
    }
    this.scheduleSave();
  }
  redo() {
    if (!this.strokesGroup || this.redoStack.length === 0)
      return;
    const action = this.redoStack.pop();
    this.undoStack.push(action);
    if (action.startsWith("ERASE:")) {
      const html = action.slice(6);
      const temp = document.createElementNS("http://www.w3.org/2000/svg", "g");
      temp.innerHTML = html;
      const ref = temp.firstElementChild;
      const id = ref == null ? void 0 : ref.getAttribute("data-stylus-id");
      if (id) {
        const existing = this.strokesGroup.querySelector(`[data-stylus-id="${id}"]`);
        if (existing)
          existing.remove();
      }
    } else {
      const temp = document.createElementNS("http://www.w3.org/2000/svg", "g");
      temp.innerHTML = action;
      const path = temp.firstElementChild;
      if (path)
        this.strokesGroup.appendChild(path);
    }
    this.scheduleSave();
  }
  // ── Resize ───────────────────────────────────────────────────────────────
  openResize() {
    if (!this.svgEl)
      return;
    const vb = this.svgEl.viewBox.baseVal;
    const curW = vb.width || parseInt(this.svgEl.getAttribute("width") || "800");
    const curH = vb.height || parseInt(this.svgEl.getAttribute("height") || "600");
    new ResizeModal(this.app, curW, curH, (w, h) => {
      if (!this.svgEl)
        return;
      this.svgEl.setAttribute("width", String(w));
      this.svgEl.setAttribute("height", String(h));
      this.svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
      this.scheduleSave();
    }).open();
  }
  // ── Persistence ──────────────────────────────────────────────────────────
  scheduleSave() {
    if (this.saveTimeout)
      clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.save(), 2e3);
  }
  async save() {
    if (!this.svgEl)
      return;
    try {
      const serializer = new XMLSerializer();
      let svgText = serializer.serializeToString(this.svgEl);
      svgText = svgText.replace(/ xmlns=""/g, "");
      svgText = svgText.replace(/<\?xml[^?]*\?>\s*/, "");
      await this.app.vault.modify(this.file, svgText);
    } catch (err) {
      console.error("Stylus: failed to save", err);
    }
  }
  destroy() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.save();
    }
    if (this.svgEl) {
      this.svgEl.removeEventListener("pointerdown", this.onPointerDown);
      this.svgEl.removeEventListener("pointermove", this.onPointerMove);
      this.svgEl.removeEventListener("pointerup", this.onPointerUp);
      this.svgEl.removeEventListener("pointerleave", this.onPointerUp);
    }
    this.container.removeEventListener("keydown", this.onKeyDown);
  }
};
var StylusSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Stylus Settings" });
    new import_obsidian.Setting(containerEl).setName("Save path").setDesc("Default folder for new/imported SVGs (relative to vault root)").addText(
      (text) => text.setPlaceholder("stylus").setValue(this.plugin.settings.savePath).onChange(async (v) => {
        this.plugin.settings.savePath = v.trim() || "stylus";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Default canvas width").addText(
      (text) => text.setValue(String(this.plugin.settings.defaultWidth)).onChange(async (v) => {
        this.plugin.settings.defaultWidth = parseInt(v, 10) || 800;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Default canvas height").addText(
      (text) => text.setValue(String(this.plugin.settings.defaultHeight)).onChange(async (v) => {
        this.plugin.settings.defaultHeight = parseInt(v, 10) || 600;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Default pen color").addDropdown((dd) => {
      for (const c of PEN_COLORS) {
        dd.addOption(c, c);
      }
      dd.setValue(this.plugin.settings.defaultPenColor);
      dd.onChange(async (v) => {
        this.plugin.settings.defaultPenColor = v;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Default pen width").addDropdown((dd) => {
      for (const pw of PEN_WIDTHS) {
        dd.addOption(String(pw.value), pw.label);
      }
      dd.setValue(String(this.plugin.settings.defaultPenWidth));
      dd.onChange(async (v) => {
        this.plugin.settings.defaultPenWidth = parseInt(v, 10) || 2;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Stroke smoothing").setDesc("Amount of curve smoothing applied to freehand strokes").addDropdown((dd) => {
      dd.addOption("0", "None");
      dd.addOption("0.3", "Low");
      dd.addOption("0.5", "Medium");
      dd.addOption("0.8", "High");
      dd.setValue(String(this.plugin.settings.smoothing));
      dd.onChange(async (v) => {
        this.plugin.settings.smoothing = parseFloat(v);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Stylus barrel button action").setDesc("Action when the stylus side button is pressed").addDropdown((dd) => {
      dd.addOption("cycle-color", "Cycle pen color");
      dd.addOption("toggle-tool", "Toggle pen / eraser");
      dd.addOption("undo", "Undo last stroke");
      dd.setValue(this.plugin.settings.barrelButtonAction);
      dd.onChange(async (v) => {
        this.plugin.settings.barrelButtonAction = v;
        await this.plugin.saveSettings();
      });
    });
  }
};
var StylusPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.canvases = [];
  }
  async onload() {
    await this.loadSettings();
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      const embeds = el.querySelectorAll(".internal-embed");
      for (const embed of Array.from(embeds)) {
        const src = embed.getAttribute("src");
        if (!src)
          continue;
        const alt = embed.getAttribute("alt");
        if (!src.toLowerCase().endsWith(".svg") || alt !== "stylus")
          continue;
        const file = this.app.metadataCache.getFirstLinkpathDest(
          src,
          ctx.sourcePath
        );
        if (!file || !(file instanceof import_obsidian.TFile))
          continue;
        let svgContent = await this.app.vault.read(file);
        svgContent = ensureStylusGroup(svgContent);
        const wrapper = createDiv();
        embed.replaceChildren(wrapper);
        embed.addClass("stylus-embed");
        embed.removeAttribute("width");
        embed.removeAttribute("height");
        const canvas = new StylusCanvas(
          this.app,
          file,
          this.settings,
          wrapper,
          svgContent
        );
        this.canvases.push(canvas);
        this.register(() => canvas.destroy());
      }
    });
    this.addCommand({
      id: "create-svg",
      name: "Create new SVG drawing",
      callback: () => {
        new CreateSvgModal(this.app, async (filename) => {
          await this.createSvgFile(filename);
        }).open();
      }
    });
    this.addCommand({
      id: "import-svg",
      name: "Import SVG as stylus drawing",
      callback: () => {
        this.importSvg();
      }
    });
    this.addRibbonIcon("pencil", "New stylus drawing", () => {
      new CreateSvgModal(this.app, async (filename) => {
        await this.createSvgFile(filename);
      }).open();
    });
    this.addSettingTab(new StylusSettingTab(this.app, this));
    this.registerDomEvent(document, "contextmenu", (e) => {
      const target = e.target;
      if (target.closest(".stylus-svg")) {
        e.preventDefault();
      }
    });
  }
  onunload() {
    for (const c of this.canvases) {
      c.destroy();
    }
    this.canvases = [];
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async ensureSavePath() {
    const folder = (0, import_obsidian.normalizePath)(this.settings.savePath);
    if (!await this.app.vault.adapter.exists(folder)) {
      await this.app.vault.createFolder(folder);
    }
    return folder;
  }
  async createSvgFile(filename) {
    try {
      const folder = await this.ensureSavePath();
      const safeName = filename.replace(/\.svg$/i, "");
      let path = (0, import_obsidian.normalizePath)(`${folder}/${safeName}.svg`);
      let counter = 1;
      while (await this.app.vault.adapter.exists(path)) {
        path = (0, import_obsidian.normalizePath)(`${folder}/${safeName}-${counter}.svg`);
        counter++;
      }
      const content = blankSvg(this.settings.defaultWidth, this.settings.defaultHeight);
      await this.app.vault.create(path, content);
      const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (view) {
        const editor = view.editor;
        const basename = path.replace(/^.*\//, "");
        editor.replaceSelection(`![[${basename}|stylus]]
`);
      }
      new import_obsidian.Notice(`Created ${path}`);
    } catch (err) {
      new import_obsidian.Notice(`Failed to create SVG: ${err}`);
    }
  }
  async importSvg() {
    const svgFiles = this.app.vault.getFiles().filter(
      (f) => f.extension.toLowerCase() === "svg"
    );
    if (svgFiles.length === 0) {
      new import_obsidian.Notice("No SVG files found in vault.");
      return;
    }
    class SvgPickerModal extends import_obsidian.FuzzySuggestModal {
      constructor(app, files, onChoose) {
        super(app);
        this.onChoose = onChoose;
      }
      getItems() {
        return svgFiles;
      }
      getItemText(item) {
        return item.path;
      }
      onChooseItem(item) {
        this.onChoose(item);
      }
    }
    new SvgPickerModal(this.app, svgFiles, async (file) => {
      var _a;
      try {
        const folder = await this.ensureSavePath();
        const destPath = (0, import_obsidian.normalizePath)(`${folder}/${file.name}`);
        let insertName = file.name;
        if ((0, import_obsidian.normalizePath)(((_a = file.parent) == null ? void 0 : _a.path) || "") === folder) {
          let content = await this.app.vault.read(file);
          content = ensureStylusGroup(content);
          await this.app.vault.modify(file, content);
        } else {
          let content = await this.app.vault.read(file);
          content = ensureStylusGroup(content);
          let finalPath = destPath;
          let counter = 1;
          while (await this.app.vault.adapter.exists(finalPath)) {
            const base = file.name.replace(/\.svg$/i, "");
            finalPath = (0, import_obsidian.normalizePath)(`${folder}/${base}-${counter}.svg`);
            counter++;
          }
          await this.app.vault.create(finalPath, content);
          insertName = finalPath.replace(/^.*\//, "");
        }
        const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (view) {
          const editor = view.editor;
          editor.replaceSelection(`![[${insertName}|stylus]]
`);
        }
        new import_obsidian.Notice(`Imported ${file.name} for stylus editing`);
      } catch (err) {
        new import_obsidian.Notice(`Failed to import SVG: ${err}`);
      }
    }).open();
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG5cdEFwcCxcblx0UGx1Z2luLFxuXHRQbHVnaW5TZXR0aW5nVGFiLFxuXHRTZXR0aW5nLFxuXHRNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LFxuXHRURmlsZSxcblx0TW9kYWwsXG5cdE5vdGljZSxcblx0bm9ybWFsaXplUGF0aCxcblx0TWFya2Rvd25WaWV3LFxuXHRGdXp6eVN1Z2dlc3RNb2RhbCxcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBTZXR0aW5ncyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuaW50ZXJmYWNlIFN0eWx1c1NldHRpbmdzIHtcblx0ZGVmYXVsdFdpZHRoOiBudW1iZXI7XG5cdGRlZmF1bHRIZWlnaHQ6IG51bWJlcjtcblx0ZGVmYXVsdFBlbkNvbG9yOiBzdHJpbmc7XG5cdGRlZmF1bHRQZW5XaWR0aDogbnVtYmVyO1xuXHRzbW9vdGhpbmc6IG51bWJlcjsgLy8gMCA9IG5vbmUsIDAuMyA9IGxvdywgMC41ID0gbWVkaXVtLCAwLjggPSBoaWdoXG5cdHNhdmVQYXRoOiBzdHJpbmc7XG5cdGJhcnJlbEJ1dHRvbkFjdGlvbjogXCJjeWNsZS1jb2xvclwiIHwgXCJ0b2dnbGUtdG9vbFwiIHwgXCJ1bmRvXCI7XG59XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFN0eWx1c1NldHRpbmdzID0ge1xuXHRkZWZhdWx0V2lkdGg6IDgwMCxcblx0ZGVmYXVsdEhlaWdodDogNjAwLFxuXHRkZWZhdWx0UGVuQ29sb3I6IFwiIzAwMDAwMFwiLFxuXHRkZWZhdWx0UGVuV2lkdGg6IDIsXG5cdHNtb290aGluZzogMC41LFxuXHRzYXZlUGF0aDogXCJzdHlsdXNcIixcblx0YmFycmVsQnV0dG9uQWN0aW9uOiBcImN5Y2xlLWNvbG9yXCIsXG59O1xuXG5jb25zdCBQRU5fQ09MT1JTID0gW1xuXHRcIiMwMDAwMDBcIiwgLy8gYmxhY2tcblx0XCIjZTAzMTMxXCIsIC8vIHJlZFxuXHRcIiMxOTcxYzJcIiwgLy8gYmx1ZVxuXHRcIiMyZjllNDRcIiwgLy8gZ3JlZW5cblx0XCIjZTg1OTBjXCIsIC8vIG9yYW5nZVxuXHRcIiM5YzM2YjVcIiwgLy8gcHVycGxlXG5dO1xuXG5jb25zdCBQRU5fV0lEVEhTID0gW1xuXHR7IGxhYmVsOiBcIkZpbmVcIiwgdmFsdWU6IDEgfSxcblx0eyBsYWJlbDogXCJNZWRpdW1cIiwgdmFsdWU6IDIgfSxcblx0eyBsYWJlbDogXCJUaGlja1wiLCB2YWx1ZTogNCB9LFxuXHR7IGxhYmVsOiBcIk1hcmtlclwiLCB2YWx1ZTogOCB9LFxuXTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEhlbHBlcnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmZ1bmN0aW9uIGJsYW5rU3ZnKHc6IG51bWJlciwgaDogbnVtYmVyKTogc3RyaW5nIHtcblx0cmV0dXJuIFtcblx0XHRgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCIke3d9XCIgaGVpZ2h0PVwiJHtofVwiIHZpZXdCb3g9XCIwIDAgJHt3fSAke2h9XCI+YCxcblx0XHRgICA8ZyBkYXRhLXN0eWx1cz1cInN0cm9rZXNcIj48L2c+YCxcblx0XHRgPC9zdmc+YCxcblx0XS5qb2luKFwiXFxuXCIpO1xufVxuXG4vKiogRW5zdXJlIHRoZSBTVkcgaGFzIGEgc3R5bHVzIHN0cm9rZXMgZ3JvdXA7IHJldHVybiB0aGUgKHBvc3NpYmx5IG1vZGlmaWVkKSBzdHJpbmcuICovXG5mdW5jdGlvbiBlbnN1cmVTdHlsdXNHcm91cChzdmdUZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoc3ZnVGV4dC5pbmNsdWRlcygnZGF0YS1zdHlsdXM9XCJzdHJva2VzXCInKSkgcmV0dXJuIHN2Z1RleHQ7XG5cdC8vIEluc2VydCBiZWZvcmUgY2xvc2luZyA8L3N2Zz5cblx0cmV0dXJuIHN2Z1RleHQucmVwbGFjZShcblx0XHRcIjwvc3ZnPlwiLFxuXHRcdCcgIDxnIGRhdGEtc3R5bHVzPVwic3Ryb2tlc1wiPjwvZz5cXG48L3N2Zz4nXG5cdCk7XG59XG5cbmludGVyZmFjZSBQb2ludCB7XG5cdHg6IG51bWJlcjtcblx0eTogbnVtYmVyO1xuXHRwcmVzc3VyZT86IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gYnVpbGRQYXRoRChwb2ludHM6IFBvaW50W10sIHNtb290aGluZzogbnVtYmVyKTogc3RyaW5nIHtcblx0aWYgKHBvaW50cy5sZW5ndGggPT09IDApIHJldHVybiBcIlwiO1xuXHRpZiAocG9pbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdGNvbnN0IHAgPSBwb2ludHNbMF07XG5cdFx0cmV0dXJuIGBNICR7cC54LnRvRml4ZWQoMil9ICR7cC55LnRvRml4ZWQoMil9IEwgJHtwLngudG9GaXhlZCgyKX0gJHtwLnkudG9GaXhlZCgyKX1gO1xuXHR9XG5cdGlmIChwb2ludHMubGVuZ3RoID09PSAyIHx8IHNtb290aGluZyA9PT0gMCkge1xuXHRcdGxldCBkID0gYE0gJHtwb2ludHNbMF0ueC50b0ZpeGVkKDIpfSAke3BvaW50c1swXS55LnRvRml4ZWQoMil9YDtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHBvaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0ZCArPSBgIEwgJHtwb2ludHNbaV0ueC50b0ZpeGVkKDIpfSAke3BvaW50c1tpXS55LnRvRml4ZWQoMil9YDtcblx0XHR9XG5cdFx0cmV0dXJuIGQ7XG5cdH1cblxuXHQvLyBRdWFkcmF0aWMgYmV6aWVyIHNtb290aGluZyB0aHJvdWdoIG1pZHBvaW50c1xuXHRsZXQgZCA9IGBNICR7cG9pbnRzWzBdLngudG9GaXhlZCgyKX0gJHtwb2ludHNbMF0ueS50b0ZpeGVkKDIpfWA7XG5cblx0Zm9yIChsZXQgaSA9IDE7IGkgPCBwb2ludHMubGVuZ3RoIC0gMTsgaSsrKSB7XG5cdFx0Y29uc3QgcHJldiA9IHBvaW50c1tpIC0gMV07XG5cdFx0Y29uc3QgY3VyciA9IHBvaW50c1tpXTtcblx0XHRjb25zdCBuZXh0ID0gcG9pbnRzW2kgKyAxXTtcblxuXHRcdC8vIENvbnRyb2wgcG9pbnQgaXMgdGhlIGN1cnJlbnQgcG9pbnRcblx0XHQvLyBFbmQgcG9pbnQgaXMgdGhlIG1pZHBvaW50IGJldHdlZW4gY3VycmVudCBhbmQgbmV4dCwgYmxlbmRlZCB3aXRoIHNtb290aGluZ1xuXHRcdGNvbnN0IG1pZFggPSBjdXJyLnggKyAobmV4dC54IC0gY3Vyci54KSAqIDAuNTtcblx0XHRjb25zdCBtaWRZID0gY3Vyci55ICsgKG5leHQueSAtIGN1cnIueSkgKiAwLjU7XG5cblx0XHRjb25zdCBjcFggPSBwcmV2LnggKyAoY3Vyci54IC0gcHJldi54KSAqICgwLjUgKyBzbW9vdGhpbmcgKiAwLjUpO1xuXHRcdGNvbnN0IGNwWSA9IHByZXYueSArIChjdXJyLnkgLSBwcmV2LnkpICogKDAuNSArIHNtb290aGluZyAqIDAuNSk7XG5cblx0XHRkICs9IGAgUSAke2NwWC50b0ZpeGVkKDIpfSAke2NwWS50b0ZpeGVkKDIpfSAke21pZFgudG9GaXhlZCgyKX0gJHttaWRZLnRvRml4ZWQoMil9YDtcblx0fVxuXG5cdC8vIExhc3Qgc2VnbWVudFxuXHRjb25zdCBsYXN0ID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcblx0Y29uc3Qgc2Vjb25kTGFzdCA9IHBvaW50c1twb2ludHMubGVuZ3RoIC0gMl07XG5cdGQgKz0gYCBRICR7c2Vjb25kTGFzdC54LnRvRml4ZWQoMil9ICR7c2Vjb25kTGFzdC55LnRvRml4ZWQoMil9ICR7bGFzdC54LnRvRml4ZWQoMil9ICR7bGFzdC55LnRvRml4ZWQoMil9YDtcblxuXHRyZXR1cm4gZDtcbn1cblxubGV0IHN0eWx1c0lkQ291bnRlciA9IDA7XG5mdW5jdGlvbiBuZXh0U3R5bHVzSWQoKTogc3RyaW5nIHtcblx0cmV0dXJuIGBzJHtEYXRlLm5vdygpfS0ke3N0eWx1c0lkQ291bnRlcisrfWA7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBSZXNpemUgTW9kYWwgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNsYXNzIFJlc2l6ZU1vZGFsIGV4dGVuZHMgTW9kYWwge1xuXHR3aWR0aDogbnVtYmVyO1xuXHRoZWlnaHQ6IG51bWJlcjtcblx0b25TdWJtaXQ6ICh3OiBudW1iZXIsIGg6IG51bWJlcikgPT4gdm9pZDtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgY3VycmVudFc6IG51bWJlciwgY3VycmVudEg6IG51bWJlciwgb25TdWJtaXQ6ICh3OiBudW1iZXIsIGg6IG51bWJlcikgPT4gdm9pZCkge1xuXHRcdHN1cGVyKGFwcCk7XG5cdFx0dGhpcy53aWR0aCA9IGN1cnJlbnRXO1xuXHRcdHRoaXMuaGVpZ2h0ID0gY3VycmVudEg7XG5cdFx0dGhpcy5vblN1Ym1pdCA9IG9uU3VibWl0O1xuXHR9XG5cblx0b25PcGVuKCkge1xuXHRcdGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuXHRcdGNvbnRlbnRFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogXCJSZXNpemUgU1ZHIENhbnZhc1wiIH0pO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGVudEVsKS5zZXROYW1lKFwiV2lkdGggKHB4KVwiKS5hZGRUZXh0KCh0ZXh0KSA9PlxuXHRcdFx0dGV4dC5zZXRWYWx1ZShTdHJpbmcodGhpcy53aWR0aCkpLm9uQ2hhbmdlKCh2KSA9PiB7XG5cdFx0XHRcdHRoaXMud2lkdGggPSBwYXJzZUludCh2LCAxMCkgfHwgdGhpcy53aWR0aDtcblx0XHRcdH0pXG5cdFx0KTtcblx0XHRuZXcgU2V0dGluZyhjb250ZW50RWwpLnNldE5hbWUoXCJIZWlnaHQgKHB4KVwiKS5hZGRUZXh0KCh0ZXh0KSA9PlxuXHRcdFx0dGV4dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5oZWlnaHQpKS5vbkNoYW5nZSgodikgPT4ge1xuXHRcdFx0XHR0aGlzLmhlaWdodCA9IHBhcnNlSW50KHYsIDEwKSB8fCB0aGlzLmhlaWdodDtcblx0XHRcdH0pXG5cdFx0KTtcblx0XHRuZXcgU2V0dGluZyhjb250ZW50RWwpLmFkZEJ1dHRvbigoYnRuKSA9PlxuXHRcdFx0YnRuLnNldEJ1dHRvblRleHQoXCJBcHBseVwiKS5zZXRDdGEoKS5vbkNsaWNrKCgpID0+IHtcblx0XHRcdFx0dGhpcy5vblN1Ym1pdCh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG5cdFx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHRcdH0pXG5cdFx0KTtcblx0fVxuXG5cdG9uQ2xvc2UoKSB7XG5cdFx0dGhpcy5jb250ZW50RWwuZW1wdHkoKTtcblx0fVxufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQ3JlYXRlIFNWRyBNb2RhbCAoZmlsZW5hbWUgcHJvbXB0KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY2xhc3MgQ3JlYXRlU3ZnTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG5cdGZpbGVuYW1lOiBzdHJpbmcgPSBcImRyYXdpbmdcIjtcblx0b25TdWJtaXQ6IChuYW1lOiBzdHJpbmcpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIG9uU3VibWl0OiAobmFtZTogc3RyaW5nKSA9PiB2b2lkKSB7XG5cdFx0c3VwZXIoYXBwKTtcblx0XHR0aGlzLm9uU3VibWl0ID0gb25TdWJtaXQ7XG5cdH1cblxuXHRvbk9wZW4oKSB7XG5cdFx0Y29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG5cdFx0Y29udGVudEVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiBcIkNyZWF0ZSBOZXcgU1ZHIERyYXdpbmdcIiB9KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRlbnRFbCkuc2V0TmFtZShcIkZpbGVuYW1lXCIpLmFkZFRleHQoKHRleHQpID0+XG5cdFx0XHR0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcImRyYXdpbmdcIilcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMuZmlsZW5hbWUpXG5cdFx0XHRcdC5vbkNoYW5nZSgodikgPT4ge1xuXHRcdFx0XHRcdHRoaXMuZmlsZW5hbWUgPSB2LnRyaW0oKSB8fCBcImRyYXdpbmdcIjtcblx0XHRcdFx0fSlcblx0XHQpO1xuXHRcdG5ldyBTZXR0aW5nKGNvbnRlbnRFbCkuYWRkQnV0dG9uKChidG4pID0+XG5cdFx0XHRidG4uc2V0QnV0dG9uVGV4dChcIkNyZWF0ZVwiKS5zZXRDdGEoKS5vbkNsaWNrKCgpID0+IHtcblx0XHRcdFx0dGhpcy5vblN1Ym1pdCh0aGlzLmZpbGVuYW1lKTtcblx0XHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdFx0fSlcblx0XHQpO1xuXHR9XG5cblx0b25DbG9zZSgpIHtcblx0XHR0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuXHR9XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBEcmF3aW5nIENhbnZhcyBDb250cm9sbGVyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5jbGFzcyBTdHlsdXNDYW52YXMge1xuXHRwcml2YXRlIGFwcDogQXBwO1xuXHRwcml2YXRlIGZpbGU6IFRGaWxlO1xuXHRwcml2YXRlIHNldHRpbmdzOiBTdHlsdXNTZXR0aW5ncztcblx0cHJpdmF0ZSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdC8vIERyYXdpbmcgc3RhdGVcblx0cHJpdmF0ZSBzdmdFbDogU1ZHU1ZHRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHN0cm9rZXNHcm91cDogU1ZHR0VsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBjdXJyZW50VG9vbDogXCJwZW5cIiB8IFwiZXJhc2VyXCIgPSBcInBlblwiO1xuXHRwcml2YXRlIGN1cnJlbnRDb2xvcjogc3RyaW5nO1xuXHRwcml2YXRlIGN1cnJlbnRXaWR0aDogbnVtYmVyO1xuXHRwcml2YXRlIGlzRHJhd2luZyA9IGZhbHNlO1xuXHRwcml2YXRlIGN1cnJlbnRQb2ludHM6IFBvaW50W10gPSBbXTtcblx0cHJpdmF0ZSBjdXJyZW50UGF0aDogU1ZHUGF0aEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuXHQvLyBVbmRvL3JlZG8gc3RhY2tzIHN0b3JlIFNWRyBwYXRoIGVsZW1lbnQgb3V0ZXJIVE1MXG5cdHByaXZhdGUgdW5kb1N0YWNrOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHJlZG9TdGFjazogc3RyaW5nW10gPSBbXTtcblxuXHQvLyBTYXZlIGRlYm91bmNlXG5cdHByaXZhdGUgc2F2ZVRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cblx0Ly8gVG9vbGJhciByZWZlcmVuY2VzIGZvciBhY3RpdmUgc3RhdGVcblx0cHJpdmF0ZSB0b29sQnV0dG9uczogTWFwPHN0cmluZywgSFRNTEVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIGNvbG9yQnV0dG9uczogTWFwPHN0cmluZywgSFRNTEVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHdpZHRoQnV0dG9uczogTWFwPG51bWJlciwgSFRNTEVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFwcDogQXBwLFxuXHRcdGZpbGU6IFRGaWxlLFxuXHRcdHNldHRpbmdzOiBTdHlsdXNTZXR0aW5ncyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHN2Z0NvbnRlbnQ6IHN0cmluZ1xuXHQpIHtcblx0XHR0aGlzLmFwcCA9IGFwcDtcblx0XHR0aGlzLmZpbGUgPSBmaWxlO1xuXHRcdHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcblx0XHR0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLmN1cnJlbnRDb2xvciA9IHNldHRpbmdzLmRlZmF1bHRQZW5Db2xvcjtcblx0XHR0aGlzLmN1cnJlbnRXaWR0aCA9IHNldHRpbmdzLmRlZmF1bHRQZW5XaWR0aDtcblxuXHRcdHRoaXMucmVuZGVyKHN2Z0NvbnRlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoc3ZnQ29udGVudDogc3RyaW5nKSB7XG5cdFx0dGhpcy5jb250YWluZXIuZW1wdHkoKTtcblx0XHR0aGlzLmNvbnRhaW5lci5hZGRDbGFzcyhcInN0eWx1cy1jYW52YXMtd3JhcHBlclwiKTtcblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBUb29sYmFyIFx1MjUwMFx1MjUwMFxuXHRcdGNvbnN0IHRvb2xiYXIgPSB0aGlzLmNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwic3R5bHVzLXRvb2xiYXJcIiB9KTtcblx0XHR0aGlzLmJ1aWxkVG9vbGJhcih0b29sYmFyKTtcblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBTVkcgY29udGFpbmVyIFx1MjUwMFx1MjUwMFxuXHRcdGNvbnN0IHN2Z0NvbnRhaW5lciA9IHRoaXMuY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJzdHlsdXMtc3ZnLWNvbnRhaW5lclwiIH0pO1xuXG5cdFx0Ly8gUGFyc2UgdGhlIFNWRyBjb250ZW50XG5cdFx0Y29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuXHRcdGNvbnN0IGRvYyA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoc3ZnQ29udGVudCwgXCJpbWFnZS9zdmcreG1sXCIpO1xuXHRcdGNvbnN0IHN2Z1Jvb3QgPSBkb2MucXVlcnlTZWxlY3RvcihcInN2Z1wiKTtcblx0XHRpZiAoIXN2Z1Jvb3QpIHtcblx0XHRcdHN2Z0NvbnRhaW5lci5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIkZhaWxlZCB0byBwYXJzZSBTVkcuXCIgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvbmUgaW50byBsaXZlIERPTVxuXHRcdGNvbnN0IGxpdmVTdmcgPSBzdmdDb250YWluZXIuY3JlYXRlU3ZnKFwic3ZnXCIpO1xuXHRcdC8vIENvcHkgYXR0cmlidXRlc1xuXHRcdGZvciAoY29uc3QgYXR0ciBvZiBBcnJheS5mcm9tKHN2Z1Jvb3QuYXR0cmlidXRlcykpIHtcblx0XHRcdGxpdmVTdmcuc2V0QXR0cmlidXRlKGF0dHIubmFtZSwgYXR0ci52YWx1ZSk7XG5cdFx0fVxuXHRcdGxpdmVTdmcuaW5uZXJIVE1MID0gc3ZnUm9vdC5pbm5lckhUTUw7XG5cdFx0bGl2ZVN2Zy5hZGRDbGFzcyhcInN0eWx1cy1zdmdcIik7XG5cblx0XHR0aGlzLnN2Z0VsID0gbGl2ZVN2ZztcblxuXHRcdC8vIEVuc3VyZSBzdHJva2VzIGdyb3VwIGV4aXN0c1xuXHRcdGxldCBzdHJva2VzRyA9IGxpdmVTdmcucXVlcnlTZWxlY3RvcignZ1tkYXRhLXN0eWx1cz1cInN0cm9rZXNcIl0nKSBhcyBTVkdHRWxlbWVudCB8IG51bGw7XG5cdFx0aWYgKCFzdHJva2VzRykge1xuXHRcdFx0c3Ryb2tlc0cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLCBcImdcIik7XG5cdFx0XHRzdHJva2VzRy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXN0eWx1c1wiLCBcInN0cm9rZXNcIik7XG5cdFx0XHRsaXZlU3ZnLmFwcGVuZENoaWxkKHN0cm9rZXNHKTtcblx0XHR9XG5cdFx0dGhpcy5zdHJva2VzR3JvdXAgPSBzdHJva2VzRztcblxuXHRcdC8vIEJ1aWxkIHVuZG8gc3RhY2sgZnJvbSBleGlzdGluZyBzdHJva2VzXG5cdFx0dGhpcy51bmRvU3RhY2sgPSBbXTtcblx0XHR0aGlzLnJlZG9TdGFjayA9IFtdO1xuXG5cdFx0Ly8gUG9pbnRlciBldmVudHNcblx0XHRsaXZlU3ZnLmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCB0aGlzLm9uUG9pbnRlckRvd24pO1xuXHRcdGxpdmVTdmcuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJtb3ZlXCIsIHRoaXMub25Qb2ludGVyTW92ZSk7XG5cdFx0bGl2ZVN2Zy5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIHRoaXMub25Qb2ludGVyVXApO1xuXHRcdGxpdmVTdmcuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJsZWF2ZVwiLCB0aGlzLm9uUG9pbnRlclVwKTtcblxuXHRcdC8vIFByZXZlbnQgZGVmYXVsdCB0b3VjaCBhY3Rpb25zIGZvciBkcmF3aW5nXG5cdFx0bGl2ZVN2Zy5zdHlsZS50b3VjaEFjdGlvbiA9IFwibm9uZVwiO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgc2hvcnRjdXRzIG9uIHRoZSB3cmFwcGVyXG5cdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKFwidGFiaW5kZXhcIiwgXCIwXCIpO1xuXHRcdHRoaXMuY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIHRoaXMub25LZXlEb3duKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRUb29sYmFyKHRvb2xiYXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFRvb2wgYnV0dG9ucyBcdTI1MDBcdTI1MDBcblx0XHRjb25zdCB0b29sR3JvdXAgPSB0b29sYmFyLmNyZWF0ZURpdih7IGNsczogXCJzdHlsdXMtdG9vbGJhci1ncm91cFwiIH0pO1xuXG5cdFx0Y29uc3QgcGVuQnRuID0gdG9vbEdyb3VwLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdGNsczogXCJzdHlsdXMtYnRuIHN0eWx1cy1idG4tYWN0aXZlXCIsXG5cdFx0XHRhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlBlblwiIH0sXG5cdFx0fSk7XG5cdFx0cGVuQnRuLmlubmVySFRNTCA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0yMS4xNzQgNi44MTJhMSAxIDAgMCAwLTMuOTg2LTMuOTg3TDMuODQyIDE2LjE3NGEyIDIgMCAwIDAtLjUuODNsLTEuMzIxIDQuMzUyYS41LjUgMCAwIDAgLjYyMy42MjJsNC4zNTMtMS4zMmEyIDIgMCAwIDAgLjgzLS40OTd6XCIvPjwvc3ZnPmA7XG5cdFx0cGVuQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLnNldFRvb2woXCJwZW5cIikpO1xuXHRcdHRoaXMudG9vbEJ1dHRvbnMuc2V0KFwicGVuXCIsIHBlbkJ0bik7XG5cblx0XHRjb25zdCBlcmFzZXJCdG4gPSB0b29sR3JvdXAuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuXHRcdFx0Y2xzOiBcInN0eWx1cy1idG5cIixcblx0XHRcdGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiRXJhc2VyXCIgfSxcblx0XHR9KTtcblx0XHRlcmFzZXJCdG4uaW5uZXJIVE1MID0gYDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwibTcgMjEtNC4zLTQuM2MtMS0xLTEtMi41IDAtMy40bDkuNi05LjZjMS0xIDIuNS0xIDMuNCAwbDUuNiA1LjZjMSAxIDEgMi41IDAgMy40TDEzIDIxXCIvPjxwYXRoIGQ9XCJNMjIgMjFIN1wiLz48cGF0aCBkPVwibTUgMTEgOSA5XCIvPjwvc3ZnPmA7XG5cdFx0ZXJhc2VyQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLnNldFRvb2woXCJlcmFzZXJcIikpO1xuXHRcdHRoaXMudG9vbEJ1dHRvbnMuc2V0KFwiZXJhc2VyXCIsIGVyYXNlckJ0bik7XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgU2VwYXJhdG9yIFx1MjUwMFx1MjUwMFxuXHRcdHRvb2xiYXIuY3JlYXRlRGl2KHsgY2xzOiBcInN0eWx1cy10b29sYmFyLXNlcFwiIH0pO1xuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIENvbG9yIGJ1dHRvbnMgXHUyNTAwXHUyNTAwXG5cdFx0Y29uc3QgY29sb3JHcm91cCA9IHRvb2xiYXIuY3JlYXRlRGl2KHsgY2xzOiBcInN0eWx1cy10b29sYmFyLWdyb3VwXCIgfSk7XG5cdFx0Zm9yIChjb25zdCBjb2xvciBvZiBQRU5fQ09MT1JTKSB7XG5cdFx0XHRjb25zdCBidG4gPSBjb2xvckdyb3VwLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdFx0Y2xzOiBcInN0eWx1cy1jb2xvci1idG5cIiArIChjb2xvciA9PT0gdGhpcy5jdXJyZW50Q29sb3IgPyBcIiBzdHlsdXMtYnRuLWFjdGl2ZVwiIDogXCJcIiksXG5cdFx0XHRcdGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IGBDb2xvciAke2NvbG9yfWAgfSxcblx0XHRcdH0pO1xuXHRcdFx0YnRuLnN0eWxlLnNldFByb3BlcnR5KFwiLS1zd2F0Y2gtY29sb3JcIiwgY29sb3IpO1xuXHRcdFx0YnRuLmNyZWF0ZURpdih7IGNsczogXCJzdHlsdXMtY29sb3Itc3dhdGNoXCIgfSk7XG5cdFx0XHRidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuc2V0Q29sb3IoY29sb3IpKTtcblx0XHRcdHRoaXMuY29sb3JCdXR0b25zLnNldChjb2xvciwgYnRuKTtcblx0XHR9XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgU2VwYXJhdG9yIFx1MjUwMFx1MjUwMFxuXHRcdHRvb2xiYXIuY3JlYXRlRGl2KHsgY2xzOiBcInN0eWx1cy10b29sYmFyLXNlcFwiIH0pO1xuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFdpZHRoIGJ1dHRvbnMgXHUyNTAwXHUyNTAwXG5cdFx0Y29uc3Qgd2lkdGhHcm91cCA9IHRvb2xiYXIuY3JlYXRlRGl2KHsgY2xzOiBcInN0eWx1cy10b29sYmFyLWdyb3VwXCIgfSk7XG5cdFx0Zm9yIChjb25zdCBwdyBvZiBQRU5fV0lEVEhTKSB7XG5cdFx0XHRjb25zdCBidG4gPSB3aWR0aEdyb3VwLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdFx0Y2xzOiBcInN0eWx1cy13aWR0aC1idG5cIiArIChwdy52YWx1ZSA9PT0gdGhpcy5jdXJyZW50V2lkdGggPyBcIiBzdHlsdXMtYnRuLWFjdGl2ZVwiIDogXCJcIiksXG5cdFx0XHRcdGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IHB3LmxhYmVsIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGxpbmUgPSBidG4uY3JlYXRlRGl2KHsgY2xzOiBcInN0eWx1cy13aWR0aC1pbmRpY2F0b3JcIiB9KTtcblx0XHRcdGxpbmUuc3R5bGUuaGVpZ2h0ID0gYCR7TWF0aC5tYXgocHcudmFsdWUsIDEpfXB4YDtcblx0XHRcdGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5zZXRXaWR0aChwdy52YWx1ZSkpO1xuXHRcdFx0dGhpcy53aWR0aEJ1dHRvbnMuc2V0KHB3LnZhbHVlLCBidG4pO1xuXHRcdH1cblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBTZXBhcmF0b3IgXHUyNTAwXHUyNTAwXG5cdFx0dG9vbGJhci5jcmVhdGVEaXYoeyBjbHM6IFwic3R5bHVzLXRvb2xiYXItc2VwXCIgfSk7XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgVW5kbyAvIFJlZG8gXHUyNTAwXHUyNTAwXG5cdFx0Y29uc3QgaGlzdEdyb3VwID0gdG9vbGJhci5jcmVhdGVEaXYoeyBjbHM6IFwic3R5bHVzLXRvb2xiYXItZ3JvdXBcIiB9KTtcblx0XHRjb25zdCB1bmRvQnRuID0gaGlzdEdyb3VwLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdGNsczogXCJzdHlsdXMtYnRuXCIsXG5cdFx0XHRhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlVuZG9cIiB9LFxuXHRcdH0pO1xuXHRcdHVuZG9CdG4uaW5uZXJIVE1MID0gYDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTMgN3Y2aDZcIi8+PHBhdGggZD1cIk0yMSAxN2E5IDkgMCAwIDAtOS05IDkgOSAwIDAgMC02IDIuM0wzIDEzXCIvPjwvc3ZnPmA7XG5cdFx0dW5kb0J0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy51bmRvKCkpO1xuXG5cdFx0Y29uc3QgcmVkb0J0biA9IGhpc3RHcm91cC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHRjbHM6IFwic3R5bHVzLWJ0blwiLFxuXHRcdFx0YXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJSZWRvXCIgfSxcblx0XHR9KTtcblx0XHRyZWRvQnRuLmlubmVySFRNTCA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0yMSA3djZoLTZcIi8+PHBhdGggZD1cIk0zIDE3YTkgOSAwIDAgMSA5LTkgOSA5IDAgMCAxIDYgMi4zTDIxIDEzXCIvPjwvc3ZnPmA7XG5cdFx0cmVkb0J0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5yZWRvKCkpO1xuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFNlcGFyYXRvciBcdTI1MDBcdTI1MDBcblx0XHR0b29sYmFyLmNyZWF0ZURpdih7IGNsczogXCJzdHlsdXMtdG9vbGJhci1zZXBcIiB9KTtcblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBSZXNpemUgXHUyNTAwXHUyNTAwXG5cdFx0Y29uc3QgcmVzaXplR3JvdXAgPSB0b29sYmFyLmNyZWF0ZURpdih7IGNsczogXCJzdHlsdXMtdG9vbGJhci1ncm91cFwiIH0pO1xuXHRcdGNvbnN0IHJlc2l6ZUJ0biA9IHJlc2l6ZUdyb3VwLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdGNsczogXCJzdHlsdXMtYnRuXCIsXG5cdFx0XHRhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlJlc2l6ZSBjYW52YXNcIiB9LFxuXHRcdH0pO1xuXHRcdHJlc2l6ZUJ0bi5pbm5lckhUTUwgPSBgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTUgM2g2djZcIi8+PHBhdGggZD1cIk05IDIxSDN2LTZcIi8+PHBhdGggZD1cIm0yMSAzLTcgN1wiLz48cGF0aCBkPVwibTMgMjEgNy03XCIvPjwvc3ZnPmA7XG5cdFx0cmVzaXplQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLm9wZW5SZXNpemUoKSk7XG5cdH1cblxuXHQvLyBcdTI1MDBcdTI1MDAgVG9vbCBzd2l0Y2hpbmcgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0cHJpdmF0ZSBzZXRUb29sKHRvb2w6IFwicGVuXCIgfCBcImVyYXNlclwiKSB7XG5cdFx0dGhpcy5jdXJyZW50VG9vbCA9IHRvb2w7XG5cdFx0dGhpcy50b29sQnV0dG9ucy5mb3JFYWNoKChidG4sIGtleSkgPT4ge1xuXHRcdFx0YnRuLnRvZ2dsZUNsYXNzKFwic3R5bHVzLWJ0bi1hY3RpdmVcIiwga2V5ID09PSB0b29sKTtcblx0XHR9KTtcblx0XHRpZiAodGhpcy5zdmdFbCkge1xuXHRcdFx0dGhpcy5zdmdFbC5zdHlsZS5jdXJzb3IgPSB0b29sID09PSBcImVyYXNlclwiID8gXCJjcm9zc2hhaXJcIiA6IFwiZGVmYXVsdFwiO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0Q29sb3IoY29sb3I6IHN0cmluZykge1xuXHRcdHRoaXMuY3VycmVudENvbG9yID0gY29sb3I7XG5cdFx0dGhpcy5jb2xvckJ1dHRvbnMuZm9yRWFjaCgoYnRuLCBrZXkpID0+IHtcblx0XHRcdGJ0bi50b2dnbGVDbGFzcyhcInN0eWx1cy1idG4tYWN0aXZlXCIsIGtleSA9PT0gY29sb3IpO1xuXHRcdH0pO1xuXHRcdC8vIFN3aXRjaCB0byBwZW4gd2hlbiBwaWNraW5nIGEgY29sb3Jcblx0XHRpZiAodGhpcy5jdXJyZW50VG9vbCAhPT0gXCJwZW5cIikgdGhpcy5zZXRUb29sKFwicGVuXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRXaWR0aCh3aWR0aDogbnVtYmVyKSB7XG5cdFx0dGhpcy5jdXJyZW50V2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLndpZHRoQnV0dG9ucy5mb3JFYWNoKChidG4sIGtleSkgPT4ge1xuXHRcdFx0YnRuLnRvZ2dsZUNsYXNzKFwic3R5bHVzLWJ0bi1hY3RpdmVcIiwga2V5ID09PSB3aWR0aCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGN5Y2xlQ29sb3IoKSB7XG5cdFx0Y29uc3QgaWR4ID0gUEVOX0NPTE9SUy5pbmRleE9mKHRoaXMuY3VycmVudENvbG9yKTtcblx0XHRjb25zdCBuZXh0ID0gUEVOX0NPTE9SU1soaWR4ICsgMSkgJSBQRU5fQ09MT1JTLmxlbmd0aF07XG5cdFx0dGhpcy5zZXRDb2xvcihuZXh0KTtcblx0fVxuXG5cdC8vIFx1MjUwMFx1MjUwMCBCYXJyZWwgYnV0dG9uIGhhbmRsaW5nIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdHByaXZhdGUgaGFuZGxlQmFycmVsQnV0dG9uKCkge1xuXHRcdHN3aXRjaCAodGhpcy5zZXR0aW5ncy5iYXJyZWxCdXR0b25BY3Rpb24pIHtcblx0XHRcdGNhc2UgXCJjeWNsZS1jb2xvclwiOlxuXHRcdFx0XHR0aGlzLmN5Y2xlQ29sb3IoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwidG9nZ2xlLXRvb2xcIjpcblx0XHRcdFx0dGhpcy5zZXRUb29sKHRoaXMuY3VycmVudFRvb2wgPT09IFwicGVuXCIgPyBcImVyYXNlclwiIDogXCJwZW5cIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcInVuZG9cIjpcblx0XHRcdFx0dGhpcy51bmRvKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdC8vIFx1MjUwMFx1MjUwMCBQb2ludGVyIGV2ZW50IGhhbmRsZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdHByaXZhdGUgZ2V0U3ZnUG9pbnQoZTogUG9pbnRlckV2ZW50KTogUG9pbnQge1xuXHRcdGNvbnN0IHN2ZyA9IHRoaXMuc3ZnRWwhO1xuXHRcdGNvbnN0IHJlY3QgPSBzdmcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3Qgdmlld0JveCA9IHN2Zy52aWV3Qm94LmJhc2VWYWw7XG5cblx0XHRjb25zdCBzY2FsZVggPSB2aWV3Qm94LndpZHRoIC8gcmVjdC53aWR0aDtcblx0XHRjb25zdCBzY2FsZVkgPSB2aWV3Qm94LmhlaWdodCAvIHJlY3QuaGVpZ2h0O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHg6IChlLmNsaWVudFggLSByZWN0LmxlZnQpICogc2NhbGVYICsgdmlld0JveC54LFxuXHRcdFx0eTogKGUuY2xpZW50WSAtIHJlY3QudG9wKSAqIHNjYWxlWSArIHZpZXdCb3gueSxcblx0XHRcdHByZXNzdXJlOiBlLnByZXNzdXJlLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIG9uUG9pbnRlckRvd24gPSAoZTogUG9pbnRlckV2ZW50KSA9PiB7XG5cdFx0aWYgKCF0aGlzLnN2Z0VsIHx8ICF0aGlzLnN0cm9rZXNHcm91cCkgcmV0dXJuO1xuXG5cdFx0Ly8gQmFycmVsIGJ1dHRvbiAoYnV0dG9uIDIgb24gc3R5bHVzKSBcdTIwMTQgaGFuZGxlIGFjdGlvbiwgZG9uJ3QgZHJhd1xuXHRcdGlmIChlLmJ1dHRvbiA9PT0gMiAmJiBlLnBvaW50ZXJUeXBlID09PSBcInBlblwiKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5oYW5kbGVCYXJyZWxCdXR0b24oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBFcmFzZXIgdGlwIChidXR0b24gNSAvIGJ1dHRvbnMgMzIpXG5cdFx0Y29uc3QgaXNFcmFzZXJUaXAgPSBlLmJ1dHRvbiA9PT0gNSB8fCAoZS5idXR0b25zICYgMzIpICE9PSAwO1xuXHRcdGlmIChpc0VyYXNlclRpcCkge1xuXHRcdFx0dGhpcy5lcmFzZUF0UG9pbnQoZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBwcmltYXJ5IGJ1dHRvbiBmb3IgZHJhd2luZ1xuXHRcdGlmIChlLmJ1dHRvbiAhPT0gMCkgcmV0dXJuO1xuXG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdHRoaXMuc3ZnRWwuc2V0UG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuXG5cdFx0aWYgKHRoaXMuY3VycmVudFRvb2wgPT09IFwiZXJhc2VyXCIpIHtcblx0XHRcdHRoaXMuZXJhc2VBdFBvaW50KGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFN0YXJ0IHBlbiBzdHJva2Vcblx0XHR0aGlzLmlzRHJhd2luZyA9IHRydWU7XG5cdFx0dGhpcy5jdXJyZW50UG9pbnRzID0gW3RoaXMuZ2V0U3ZnUG9pbnQoZSldO1xuXHRcdHRoaXMucmVkb1N0YWNrID0gW107XG5cblx0XHQvLyBDcmVhdGUgYSBsaXZlIHBhdGggZm9yIHZpc3VhbCBmZWVkYmFja1xuXHRcdGNvbnN0IHBhdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLCBcInBhdGhcIik7XG5cdFx0cGF0aC5zZXRBdHRyaWJ1dGUoXCJzdHJva2VcIiwgdGhpcy5jdXJyZW50Q29sb3IpO1xuXHRcdHBhdGguc2V0QXR0cmlidXRlKFwic3Ryb2tlLXdpZHRoXCIsIFN0cmluZyh0aGlzLmN1cnJlbnRXaWR0aCkpO1xuXHRcdHBhdGguc2V0QXR0cmlidXRlKFwiZmlsbFwiLCBcIm5vbmVcIik7XG5cdFx0cGF0aC5zZXRBdHRyaWJ1dGUoXCJzdHJva2UtbGluZWNhcFwiLCBcInJvdW5kXCIpO1xuXHRcdHBhdGguc2V0QXR0cmlidXRlKFwic3Ryb2tlLWxpbmVqb2luXCIsIFwicm91bmRcIik7XG5cdFx0cGF0aC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXN0eWx1cy1pZFwiLCBuZXh0U3R5bHVzSWQoKSk7XG5cdFx0dGhpcy5zdHJva2VzR3JvdXAuYXBwZW5kQ2hpbGQocGF0aCk7XG5cdFx0dGhpcy5jdXJyZW50UGF0aCA9IHBhdGg7XG5cdH07XG5cblx0cHJpdmF0ZSBvblBvaW50ZXJNb3ZlID0gKGU6IFBvaW50ZXJFdmVudCkgPT4ge1xuXHRcdGlmICghdGhpcy5zdmdFbCkgcmV0dXJuO1xuXG5cdFx0Ly8gSGFuZGxlIG9uZ29pbmcgZXJhc2VyIHRpcCBcdTIwMTQgYWx3YXlzIGVyYXNlcyByZWdhcmRsZXNzIG9mIGN1cnJlbnQgdG9vbFxuXHRcdGNvbnN0IGlzRXJhc2VyVGlwID0gKGUuYnV0dG9ucyAmIDMyKSAhPT0gMDtcblx0XHRpZiAoaXNFcmFzZXJUaXApIHtcblx0XHRcdHRoaXMuZXJhc2VBdFBvaW50KGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmN1cnJlbnRUb29sID09PSBcImVyYXNlclwiICYmIChlLmJ1dHRvbnMgJiAxKSAhPT0gMCkge1xuXHRcdFx0dGhpcy5lcmFzZUF0UG9pbnQoZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmlzRHJhd2luZyB8fCAhdGhpcy5jdXJyZW50UGF0aCkgcmV0dXJuO1xuXG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGNvbnN0IHB0ID0gdGhpcy5nZXRTdmdQb2ludChlKTtcblx0XHR0aGlzLmN1cnJlbnRQb2ludHMucHVzaChwdCk7XG5cblx0XHQvLyBVcGRhdGUgbGl2ZSBwYXRoIHdpdGggbWluaW1hbCBzbW9vdGhpbmcgZm9yIHJlc3BvbnNpdmVuZXNzXG5cdFx0Y29uc3QgZCA9IGJ1aWxkUGF0aEQodGhpcy5jdXJyZW50UG9pbnRzLCB0aGlzLnNldHRpbmdzLnNtb290aGluZyk7XG5cdFx0dGhpcy5jdXJyZW50UGF0aC5zZXRBdHRyaWJ1dGUoXCJkXCIsIGQpO1xuXHR9O1xuXG5cdHByaXZhdGUgb25Qb2ludGVyVXAgPSAoZTogUG9pbnRlckV2ZW50KSA9PiB7XG5cdFx0aWYgKCF0aGlzLmlzRHJhd2luZyB8fCAhdGhpcy5jdXJyZW50UGF0aCkge1xuXHRcdFx0dGhpcy5pc0RyYXdpbmcgPSBmYWxzZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmlzRHJhd2luZyA9IGZhbHNlO1xuXG5cdFx0Ly8gRmluYWxpemUgcGF0aCB3aXRoIGZ1bGwgc21vb3RoaW5nXG5cdFx0aWYgKHRoaXMuY3VycmVudFBvaW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBkID0gYnVpbGRQYXRoRCh0aGlzLmN1cnJlbnRQb2ludHMsIHRoaXMuc2V0dGluZ3Muc21vb3RoaW5nKTtcblx0XHRcdHRoaXMuY3VycmVudFBhdGguc2V0QXR0cmlidXRlKFwiZFwiLCBkKTtcblx0XHRcdHRoaXMudW5kb1N0YWNrLnB1c2godGhpcy5jdXJyZW50UGF0aC5vdXRlckhUTUwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBFbXB0eSBzdHJva2UgXHUyMDE0IHJlbW92ZVxuXHRcdFx0dGhpcy5jdXJyZW50UGF0aC5yZW1vdmUoKTtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRQYXRoID0gbnVsbDtcblx0XHR0aGlzLmN1cnJlbnRQb2ludHMgPSBbXTtcblx0XHR0aGlzLnNjaGVkdWxlU2F2ZSgpO1xuXHR9O1xuXG5cdHByaXZhdGUgb25LZXlEb3duID0gKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRjb25zdCBtb2QgPSBlLm1ldGFLZXkgfHwgZS5jdHJsS2V5O1xuXHRcdGlmIChtb2QgJiYgZS5rZXkgPT09IFwielwiICYmICFlLnNoaWZ0S2V5KSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLnVuZG8oKTtcblx0XHR9IGVsc2UgaWYgKG1vZCAmJiBlLmtleSA9PT0gXCJ6XCIgJiYgZS5zaGlmdEtleSkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5yZWRvKCk7XG5cdFx0fSBlbHNlIGlmIChtb2QgJiYgZS5rZXkgPT09IFwieVwiKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLnJlZG8oKTtcblx0XHR9XG5cdH07XG5cblx0Ly8gXHUyNTAwXHUyNTAwIEVyYXNlciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXHRwcml2YXRlIGVyYXNlQXRQb2ludChlOiBQb2ludGVyRXZlbnQpIHtcblx0XHRpZiAoIXRoaXMuc3ZnRWwgfHwgIXRoaXMuc3Ryb2tlc0dyb3VwKSByZXR1cm47XG5cblx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBFbGVtZW50O1xuXHRcdC8vIENoZWNrIGlmIHRoZSB0YXJnZXQgaXMgYSBzdHJva2UgcGF0aCBpbnNpZGUgb3VyIGdyb3VwXG5cdFx0aWYgKFxuXHRcdFx0dGFyZ2V0IGluc3RhbmNlb2YgU1ZHUGF0aEVsZW1lbnQgJiZcblx0XHRcdHRhcmdldC5jbG9zZXN0KCdnW2RhdGEtc3R5bHVzPVwic3Ryb2tlc1wiXScpID09PSB0aGlzLnN0cm9rZXNHcm91cFxuXHRcdCkge1xuXHRcdFx0Y29uc3Qgb3V0ZXJIVE1MID0gdGFyZ2V0Lm91dGVySFRNTDtcblx0XHRcdHRhcmdldC5yZW1vdmUoKTtcblx0XHRcdHRoaXMudW5kb1N0YWNrLnB1c2goXCJFUkFTRTpcIiArIG91dGVySFRNTCk7XG5cdFx0XHR0aGlzLnJlZG9TdGFjayA9IFtdO1xuXHRcdFx0dGhpcy5zY2hlZHVsZVNhdmUoKTtcblx0XHR9XG5cdH1cblxuXHQvLyBcdTI1MDBcdTI1MDAgVW5kbyAvIFJlZG8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0cHJpdmF0ZSB1bmRvKCkge1xuXHRcdGlmICghdGhpcy5zdHJva2VzR3JvdXAgfHwgdGhpcy51bmRvU3RhY2subGVuZ3RoID09PSAwKSByZXR1cm47XG5cblx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLnVuZG9TdGFjay5wb3AoKSE7XG5cdFx0dGhpcy5yZWRvU3RhY2sucHVzaChhY3Rpb24pO1xuXG5cdFx0aWYgKGFjdGlvbi5zdGFydHNXaXRoKFwiRVJBU0U6XCIpKSB7XG5cdFx0XHQvLyBSZS1hZGQgdGhlIGVyYXNlZCBwYXRoXG5cdFx0XHRjb25zdCBodG1sID0gYWN0aW9uLnNsaWNlKDYpO1xuXHRcdFx0Y29uc3QgdGVtcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsIFwiZ1wiKTtcblx0XHRcdHRlbXAuaW5uZXJIVE1MID0gaHRtbDtcblx0XHRcdGNvbnN0IHBhdGggPSB0ZW1wLmZpcnN0RWxlbWVudENoaWxkO1xuXHRcdFx0aWYgKHBhdGgpIHRoaXMuc3Ryb2tlc0dyb3VwLmFwcGVuZENoaWxkKHBhdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBSZW1vdmUgdGhlIGRyYXduIHBhdGggYnkgaXRzIGRhdGEtc3R5bHVzLWlkXG5cdFx0XHRjb25zdCB0ZW1wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgXCJnXCIpO1xuXHRcdFx0dGVtcC5pbm5lckhUTUwgPSBhY3Rpb247XG5cdFx0XHRjb25zdCByZWYgPSB0ZW1wLmZpcnN0RWxlbWVudENoaWxkO1xuXHRcdFx0Y29uc3QgaWQgPSByZWY/LmdldEF0dHJpYnV0ZShcImRhdGEtc3R5bHVzLWlkXCIpO1xuXHRcdFx0aWYgKGlkKSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zdHJva2VzR3JvdXAucXVlcnlTZWxlY3RvcihgW2RhdGEtc3R5bHVzLWlkPVwiJHtpZH1cIl1gKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEZhbGxiYWNrOiByZW1vdmUgbGFzdCBjaGlsZFxuXHRcdFx0XHRjb25zdCBsYXN0UGF0aCA9IHRoaXMuc3Ryb2tlc0dyb3VwLmxhc3RFbGVtZW50Q2hpbGQ7XG5cdFx0XHRcdGlmIChsYXN0UGF0aCkgbGFzdFBhdGgucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuc2NoZWR1bGVTYXZlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZG8oKSB7XG5cdFx0aWYgKCF0aGlzLnN0cm9rZXNHcm91cCB8fCB0aGlzLnJlZG9TdGFjay5sZW5ndGggPT09IDApIHJldHVybjtcblxuXHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMucmVkb1N0YWNrLnBvcCgpITtcblx0XHR0aGlzLnVuZG9TdGFjay5wdXNoKGFjdGlvbik7XG5cblx0XHRpZiAoYWN0aW9uLnN0YXJ0c1dpdGgoXCJFUkFTRTpcIikpIHtcblx0XHRcdC8vIFJlLWVyYXNlOiByZW1vdmUgdGhlIHBhdGhcblx0XHRcdGNvbnN0IGh0bWwgPSBhY3Rpb24uc2xpY2UoNik7XG5cdFx0XHQvLyBGaW5kIHRoZSBtYXRjaGluZyBwYXRoIGJ5IGRhdGEtc3R5bHVzLWlkXG5cdFx0XHRjb25zdCB0ZW1wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgXCJnXCIpO1xuXHRcdFx0dGVtcC5pbm5lckhUTUwgPSBodG1sO1xuXHRcdFx0Y29uc3QgcmVmID0gdGVtcC5maXJzdEVsZW1lbnRDaGlsZDtcblx0XHRcdGNvbnN0IGlkID0gcmVmPy5nZXRBdHRyaWJ1dGUoXCJkYXRhLXN0eWx1cy1pZFwiKTtcblx0XHRcdGlmIChpZCkge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuc3Ryb2tlc0dyb3VwLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLXN0eWx1cy1pZD1cIiR7aWR9XCJdYCk7XG5cdFx0XHRcdGlmIChleGlzdGluZykgZXhpc3RpbmcucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFJlLWFkZCB0aGUgZHJhd24gcGF0aFxuXHRcdFx0Y29uc3QgdGVtcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsIFwiZ1wiKTtcblx0XHRcdHRlbXAuaW5uZXJIVE1MID0gYWN0aW9uO1xuXHRcdFx0Y29uc3QgcGF0aCA9IHRlbXAuZmlyc3RFbGVtZW50Q2hpbGQ7XG5cdFx0XHRpZiAocGF0aCkgdGhpcy5zdHJva2VzR3JvdXAuYXBwZW5kQ2hpbGQocGF0aCk7XG5cdFx0fVxuXHRcdHRoaXMuc2NoZWR1bGVTYXZlKCk7XG5cdH1cblxuXHQvLyBcdTI1MDBcdTI1MDAgUmVzaXplIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdHByaXZhdGUgb3BlblJlc2l6ZSgpIHtcblx0XHRpZiAoIXRoaXMuc3ZnRWwpIHJldHVybjtcblx0XHRjb25zdCB2YiA9IHRoaXMuc3ZnRWwudmlld0JveC5iYXNlVmFsO1xuXHRcdGNvbnN0IGN1clcgPSB2Yi53aWR0aCB8fCBwYXJzZUludCh0aGlzLnN2Z0VsLmdldEF0dHJpYnV0ZShcIndpZHRoXCIpIHx8IFwiODAwXCIpO1xuXHRcdGNvbnN0IGN1ckggPSB2Yi5oZWlnaHQgfHwgcGFyc2VJbnQodGhpcy5zdmdFbC5nZXRBdHRyaWJ1dGUoXCJoZWlnaHRcIikgfHwgXCI2MDBcIik7XG5cblx0XHRuZXcgUmVzaXplTW9kYWwodGhpcy5hcHAsIGN1clcsIGN1ckgsICh3LCBoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuc3ZnRWwpIHJldHVybjtcblx0XHRcdHRoaXMuc3ZnRWwuc2V0QXR0cmlidXRlKFwid2lkdGhcIiwgU3RyaW5nKHcpKTtcblx0XHRcdHRoaXMuc3ZnRWwuc2V0QXR0cmlidXRlKFwiaGVpZ2h0XCIsIFN0cmluZyhoKSk7XG5cdFx0XHR0aGlzLnN2Z0VsLnNldEF0dHJpYnV0ZShcInZpZXdCb3hcIiwgYDAgMCAke3d9ICR7aH1gKTtcblx0XHRcdHRoaXMuc2NoZWR1bGVTYXZlKCk7XG5cdFx0fSkub3BlbigpO1xuXHR9XG5cblx0Ly8gXHUyNTAwXHUyNTAwIFBlcnNpc3RlbmNlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdHByaXZhdGUgc2NoZWR1bGVTYXZlKCkge1xuXHRcdGlmICh0aGlzLnNhdmVUaW1lb3V0KSBjbGVhclRpbWVvdXQodGhpcy5zYXZlVGltZW91dCk7XG5cdFx0dGhpcy5zYXZlVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5zYXZlKCksIDIwMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzYXZlKCkge1xuXHRcdGlmICghdGhpcy5zdmdFbCkgcmV0dXJuO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBTZXJpYWxpemUgdGhlIFNWRyBiYWNrIHRvIHRleHRcblx0XHRcdGNvbnN0IHNlcmlhbGl6ZXIgPSBuZXcgWE1MU2VyaWFsaXplcigpO1xuXHRcdFx0bGV0IHN2Z1RleHQgPSBzZXJpYWxpemVyLnNlcmlhbGl6ZVRvU3RyaW5nKHRoaXMuc3ZnRWwpO1xuXG5cdFx0XHQvLyBDbGVhbiB1cCBhbnkgbmFtZXNwYWNlIGNsdXR0ZXIgdGhlIHNlcmlhbGl6ZXIgbWlnaHQgYWRkXG5cdFx0XHRzdmdUZXh0ID0gc3ZnVGV4dC5yZXBsYWNlKC8geG1sbnM9XCJcIi9nLCBcIlwiKTtcblxuXHRcdFx0Ly8gUHJldHR5LXByaW50IGEgYml0OiBlbnN1cmUgdGhlIFhNTCBkZWNsYXJhdGlvbiBpcyBhYnNlbnQgKGtlZXAgaXQgY2xlYW4pXG5cdFx0XHRzdmdUZXh0ID0gc3ZnVGV4dC5yZXBsYWNlKC88XFw/eG1sW14/XSpcXD8+XFxzKi8sIFwiXCIpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkodGhpcy5maWxlLCBzdmdUZXh0KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoXCJTdHlsdXM6IGZhaWxlZCB0byBzYXZlXCIsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0ZGVzdHJveSgpIHtcblx0XHRpZiAodGhpcy5zYXZlVGltZW91dCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuc2F2ZVRpbWVvdXQpO1xuXHRcdFx0Ly8gRm9yY2UgYSBmaW5hbCBzYXZlXG5cdFx0XHR0aGlzLnNhdmUoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc3ZnRWwpIHtcblx0XHRcdHRoaXMuc3ZnRWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJkb3duXCIsIHRoaXMub25Qb2ludGVyRG93bik7XG5cdFx0XHR0aGlzLnN2Z0VsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJwb2ludGVybW92ZVwiLCB0aGlzLm9uUG9pbnRlck1vdmUpO1xuXHRcdFx0dGhpcy5zdmdFbC5yZW1vdmVFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIHRoaXMub25Qb2ludGVyVXApO1xuXHRcdFx0dGhpcy5zdmdFbC5yZW1vdmVFdmVudExpc3RlbmVyKFwicG9pbnRlcmxlYXZlXCIsIHRoaXMub25Qb2ludGVyVXApO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRhaW5lci5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCB0aGlzLm9uS2V5RG93bik7XG5cdH1cbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFNldHRpbmdzIFRhYiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY2xhc3MgU3R5bHVzU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuXHRwbHVnaW46IFN0eWx1c1BsdWdpbjtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBTdHlsdXNQbHVnaW4pIHtcblx0XHRzdXBlcihhcHAsIHBsdWdpbik7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRkaXNwbGF5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKTtcblxuXHRcdGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlN0eWx1cyBTZXR0aW5nc1wiIH0pO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIlNhdmUgcGF0aFwiKVxuXHRcdFx0LnNldERlc2MoXCJEZWZhdWx0IGZvbGRlciBmb3IgbmV3L2ltcG9ydGVkIFNWR3MgKHJlbGF0aXZlIHRvIHZhdWx0IHJvb3QpXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCkgPT5cblx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcInN0eWx1c1wiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zYXZlUGF0aClcblx0XHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHYpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNhdmVQYXRoID0gdi50cmltKCkgfHwgXCJzdHlsdXNcIjtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHQpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkRlZmF1bHQgY2FudmFzIHdpZHRoXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCkgPT5cblx0XHRcdFx0dGV4dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGVmYXVsdFdpZHRoKSkub25DaGFuZ2UoYXN5bmMgKHYpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0V2lkdGggPSBwYXJzZUludCh2LCAxMCkgfHwgODAwO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJEZWZhdWx0IGNhbnZhcyBoZWlnaHRcIilcblx0XHRcdC5hZGRUZXh0KCh0ZXh0KSA9PlxuXHRcdFx0XHR0ZXh0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0SGVpZ2h0KSkub25DaGFuZ2UoYXN5bmMgKHYpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0SGVpZ2h0ID0gcGFyc2VJbnQodiwgMTApIHx8IDYwMDtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSlcblx0XHRcdCk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRGVmYXVsdCBwZW4gY29sb3JcIilcblx0XHRcdC5hZGREcm9wZG93bigoZGQpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBjIG9mIFBFTl9DT0xPUlMpIHtcblx0XHRcdFx0XHRkZC5hZGRPcHRpb24oYywgYyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGVmYXVsdFBlbkNvbG9yKTtcblx0XHRcdFx0ZGQub25DaGFuZ2UoYXN5bmMgKHYpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0UGVuQ29sb3IgPSB2O1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkRlZmF1bHQgcGVuIHdpZHRoXCIpXG5cdFx0XHQuYWRkRHJvcGRvd24oKGRkKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgcHcgb2YgUEVOX1dJRFRIUykge1xuXHRcdFx0XHRcdGRkLmFkZE9wdGlvbihTdHJpbmcocHcudmFsdWUpLCBwdy5sYWJlbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRQZW5XaWR0aCkpO1xuXHRcdFx0XHRkZC5vbkNoYW5nZShhc3luYyAodikgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRQZW5XaWR0aCA9IHBhcnNlSW50KHYsIDEwKSB8fCAyO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIlN0cm9rZSBzbW9vdGhpbmdcIilcblx0XHRcdC5zZXREZXNjKFwiQW1vdW50IG9mIGN1cnZlIHNtb290aGluZyBhcHBsaWVkIHRvIGZyZWVoYW5kIHN0cm9rZXNcIilcblx0XHRcdC5hZGREcm9wZG93bigoZGQpID0+IHtcblx0XHRcdFx0ZGQuYWRkT3B0aW9uKFwiMFwiLCBcIk5vbmVcIik7XG5cdFx0XHRcdGRkLmFkZE9wdGlvbihcIjAuM1wiLCBcIkxvd1wiKTtcblx0XHRcdFx0ZGQuYWRkT3B0aW9uKFwiMC41XCIsIFwiTWVkaXVtXCIpO1xuXHRcdFx0XHRkZC5hZGRPcHRpb24oXCIwLjhcIiwgXCJIaWdoXCIpO1xuXHRcdFx0XHRkZC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3Muc21vb3RoaW5nKSk7XG5cdFx0XHRcdGRkLm9uQ2hhbmdlKGFzeW5jICh2KSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc21vb3RoaW5nID0gcGFyc2VGbG9hdCh2KTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJTdHlsdXMgYmFycmVsIGJ1dHRvbiBhY3Rpb25cIilcblx0XHRcdC5zZXREZXNjKFwiQWN0aW9uIHdoZW4gdGhlIHN0eWx1cyBzaWRlIGJ1dHRvbiBpcyBwcmVzc2VkXCIpXG5cdFx0XHQuYWRkRHJvcGRvd24oKGRkKSA9PiB7XG5cdFx0XHRcdGRkLmFkZE9wdGlvbihcImN5Y2xlLWNvbG9yXCIsIFwiQ3ljbGUgcGVuIGNvbG9yXCIpO1xuXHRcdFx0XHRkZC5hZGRPcHRpb24oXCJ0b2dnbGUtdG9vbFwiLCBcIlRvZ2dsZSBwZW4gLyBlcmFzZXJcIik7XG5cdFx0XHRcdGRkLmFkZE9wdGlvbihcInVuZG9cIiwgXCJVbmRvIGxhc3Qgc3Ryb2tlXCIpO1xuXHRcdFx0XHRkZC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5iYXJyZWxCdXR0b25BY3Rpb24pO1xuXHRcdFx0XHRkZC5vbkNoYW5nZShhc3luYyAodikgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmJhcnJlbEJ1dHRvbkFjdGlvbiA9IHYgYXMgU3R5bHVzU2V0dGluZ3NbXCJiYXJyZWxCdXR0b25BY3Rpb25cIl07XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdH1cbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1haW4gUGx1Z2luIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTdHlsdXNQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuXHRzZXR0aW5nczogU3R5bHVzU2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuXHRwcml2YXRlIGNhbnZhc2VzOiBTdHlsdXNDYW52YXNbXSA9IFtdO1xuXG5cdGFzeW5jIG9ubG9hZCgpIHtcblx0XHRhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFBvc3QgcHJvY2Vzc29yOiBpbnRlcmNlcHQgIVtbZmlsZS5zdmd8c3R5bHVzXV0gXHUyNTAwXHUyNTAwXG5cdFx0dGhpcy5yZWdpc3Rlck1hcmtkb3duUG9zdFByb2Nlc3Nvcihhc3luYyAoZWwsIGN0eCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1iZWRzID0gZWwucXVlcnlTZWxlY3RvckFsbChcIi5pbnRlcm5hbC1lbWJlZFwiKTtcblxuXHRcdFx0Zm9yIChjb25zdCBlbWJlZCBvZiBBcnJheS5mcm9tKGVtYmVkcykpIHtcblx0XHRcdFx0Y29uc3Qgc3JjID0gZW1iZWQuZ2V0QXR0cmlidXRlKFwic3JjXCIpO1xuXHRcdFx0XHRpZiAoIXNyYykgY29udGludWU7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhbiBTVkcgd2l0aCB0aGUgfHN0eWx1cyBhbHQgdGV4dFxuXHRcdFx0XHRjb25zdCBhbHQgPSBlbWJlZC5nZXRBdHRyaWJ1dGUoXCJhbHRcIik7XG5cdFx0XHRcdGlmICghc3JjLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIuc3ZnXCIpIHx8IGFsdCAhPT0gXCJzdHlsdXNcIikgY29udGludWU7XG5cblx0XHRcdFx0Ly8gUmVzb2x2ZSB0aGUgZmlsZVxuXHRcdFx0XHRjb25zdCBmaWxlID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaXJzdExpbmtwYXRoRGVzdChcblx0XHRcdFx0XHRzcmMsXG5cdFx0XHRcdFx0Y3R4LnNvdXJjZVBhdGhcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKCFmaWxlIHx8ICEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkgY29udGludWU7XG5cblx0XHRcdFx0Ly8gUmVhZCBTVkcgY29udGVudFxuXHRcdFx0XHRsZXQgc3ZnQ29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG5cdFx0XHRcdHN2Z0NvbnRlbnQgPSBlbnN1cmVTdHlsdXNHcm91cChzdmdDb250ZW50KTtcblxuXHRcdFx0XHQvLyBSZXBsYWNlIHRoZSBlbWJlZCBjb250ZW50IHdpdGggb3VyIGNhbnZhc1xuXHRcdFx0XHRjb25zdCB3cmFwcGVyID0gY3JlYXRlRGl2KCk7XG5cdFx0XHRcdGVtYmVkLnJlcGxhY2VDaGlsZHJlbih3cmFwcGVyKTtcblx0XHRcdFx0ZW1iZWQuYWRkQ2xhc3MoXCJzdHlsdXMtZW1iZWRcIik7XG5cdFx0XHRcdC8vIFJlbW92ZSBkZWZhdWx0IGVtYmVkIHNpemluZ1xuXHRcdFx0XHRlbWJlZC5yZW1vdmVBdHRyaWJ1dGUoXCJ3aWR0aFwiKTtcblx0XHRcdFx0ZW1iZWQucmVtb3ZlQXR0cmlidXRlKFwiaGVpZ2h0XCIpO1xuXG5cdFx0XHRcdGNvbnN0IGNhbnZhcyA9IG5ldyBTdHlsdXNDYW52YXMoXG5cdFx0XHRcdFx0dGhpcy5hcHAsXG5cdFx0XHRcdFx0ZmlsZSxcblx0XHRcdFx0XHR0aGlzLnNldHRpbmdzLFxuXHRcdFx0XHRcdHdyYXBwZXIsXG5cdFx0XHRcdFx0c3ZnQ29udGVudFxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aGlzLmNhbnZhc2VzLnB1c2goY2FudmFzKTtcblxuXHRcdFx0XHQvLyBDbGVhbiB1cCB3aGVuIHRoZSBlbWJlZCBpcyByZW1vdmVkIGZyb20gRE9NXG5cdFx0XHRcdHRoaXMucmVnaXN0ZXIoKCkgPT4gY2FudmFzLmRlc3Ryb3koKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgQ29tbWFuZDogQ3JlYXRlIG5ldyBTVkcgXHUyNTAwXHUyNTAwXG5cdFx0dGhpcy5hZGRDb21tYW5kKHtcblx0XHRcdGlkOiBcImNyZWF0ZS1zdmdcIixcblx0XHRcdG5hbWU6IFwiQ3JlYXRlIG5ldyBTVkcgZHJhd2luZ1wiLFxuXHRcdFx0Y2FsbGJhY2s6ICgpID0+IHtcblx0XHRcdFx0bmV3IENyZWF0ZVN2Z01vZGFsKHRoaXMuYXBwLCBhc3luYyAoZmlsZW5hbWUpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZVN2Z0ZpbGUoZmlsZW5hbWUpO1xuXHRcdFx0XHR9KS5vcGVuKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIENvbW1hbmQ6IEltcG9ydCBTVkcgXHUyNTAwXHUyNTAwXG5cdFx0dGhpcy5hZGRDb21tYW5kKHtcblx0XHRcdGlkOiBcImltcG9ydC1zdmdcIixcblx0XHRcdG5hbWU6IFwiSW1wb3J0IFNWRyBhcyBzdHlsdXMgZHJhd2luZ1wiLFxuXHRcdFx0Y2FsbGJhY2s6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5pbXBvcnRTdmcoKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgUmliYm9uIGljb24gXHUyNTAwXHUyNTAwXG5cdFx0dGhpcy5hZGRSaWJib25JY29uKFwicGVuY2lsXCIsIFwiTmV3IHN0eWx1cyBkcmF3aW5nXCIsICgpID0+IHtcblx0XHRcdG5ldyBDcmVhdGVTdmdNb2RhbCh0aGlzLmFwcCwgYXN5bmMgKGZpbGVuYW1lKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY3JlYXRlU3ZnRmlsZShmaWxlbmFtZSk7XG5cdFx0XHR9KS5vcGVuKCk7XG5cdFx0fSk7XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgU2V0dGluZ3MgdGFiIFx1MjUwMFx1MjUwMFxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgU3R5bHVzU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIENvbnRleHQgbWVudSB0byBwcmV2ZW50IGJyb3dzZXIgY29udGV4dCBtZW51IG9uIGJhcnJlbCBidXR0b24gXHUyNTAwXHUyNTAwXG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCBcImNvbnRleHRtZW51XCIsIChlKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGlmICh0YXJnZXQuY2xvc2VzdChcIi5zdHlsdXMtc3ZnXCIpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG9udW5sb2FkKCkge1xuXHRcdGZvciAoY29uc3QgYyBvZiB0aGlzLmNhbnZhc2VzKSB7XG5cdFx0XHRjLmRlc3Ryb3koKTtcblx0XHR9XG5cdFx0dGhpcy5jYW52YXNlcyA9IFtdO1xuXHR9XG5cblx0YXN5bmMgbG9hZFNldHRpbmdzKCkge1xuXHRcdHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuXHR9XG5cblx0YXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuXHRcdGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVuc3VyZVNhdmVQYXRoKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gbm9ybWFsaXplUGF0aCh0aGlzLnNldHRpbmdzLnNhdmVQYXRoKTtcblx0XHRpZiAoIShhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyhmb2xkZXIpKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKGZvbGRlcik7XG5cdFx0fVxuXHRcdHJldHVybiBmb2xkZXI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZVN2Z0ZpbGUoZmlsZW5hbWU6IHN0cmluZykge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCB0aGlzLmVuc3VyZVNhdmVQYXRoKCk7XG5cdFx0XHRjb25zdCBzYWZlTmFtZSA9IGZpbGVuYW1lLnJlcGxhY2UoL1xcLnN2ZyQvaSwgXCJcIik7XG5cdFx0XHRsZXQgcGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7Zm9sZGVyfS8ke3NhZmVOYW1lfS5zdmdgKTtcblxuXHRcdFx0Ly8gQXZvaWQgb3ZlcndyaXRpbmdcblx0XHRcdGxldCBjb3VudGVyID0gMTtcblx0XHRcdHdoaWxlIChhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyhwYXRoKSkge1xuXHRcdFx0XHRwYXRoID0gbm9ybWFsaXplUGF0aChgJHtmb2xkZXJ9LyR7c2FmZU5hbWV9LSR7Y291bnRlcn0uc3ZnYCk7XG5cdFx0XHRcdGNvdW50ZXIrKztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udGVudCA9IGJsYW5rU3ZnKHRoaXMuc2V0dGluZ3MuZGVmYXVsdFdpZHRoLCB0aGlzLnNldHRpbmdzLmRlZmF1bHRIZWlnaHQpO1xuXHRcdFx0YXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHBhdGgsIGNvbnRlbnQpO1xuXG5cdFx0XHQvLyBJbnNlcnQgZW1iZWQgYXQgY3Vyc29yIGluIGFjdGl2ZSBlZGl0b3Jcblx0XHRcdGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuXHRcdFx0aWYgKHZpZXcpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdmlldy5lZGl0b3I7XG5cdFx0XHRcdGNvbnN0IGJhc2VuYW1lID0gcGF0aC5yZXBsYWNlKC9eLipcXC8vLCBcIlwiKTtcblx0XHRcdFx0ZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24oYCFbWyR7YmFzZW5hbWV9fHN0eWx1c11dXFxuYCk7XG5cdFx0XHR9XG5cblx0XHRcdG5ldyBOb3RpY2UoYENyZWF0ZWQgJHtwYXRofWApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0bmV3IE5vdGljZShgRmFpbGVkIHRvIGNyZWF0ZSBTVkc6ICR7ZXJyfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW1wb3J0U3ZnKCkge1xuXHRcdC8vIEdldCBhbGwgU1ZHIGZpbGVzIGluIHRoZSB2YXVsdFxuXHRcdGNvbnN0IHN2Z0ZpbGVzID0gdGhpcy5hcHAudmF1bHQuZ2V0RmlsZXMoKS5maWx0ZXIoXG5cdFx0XHQoZikgPT4gZi5leHRlbnNpb24udG9Mb3dlckNhc2UoKSA9PT0gXCJzdmdcIlxuXHRcdCk7XG5cblx0XHRpZiAoc3ZnRmlsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRuZXcgTm90aWNlKFwiTm8gU1ZHIGZpbGVzIGZvdW5kIGluIHZhdWx0LlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVc2UgRnV6enlTdWdnZXN0TW9kYWwgZm9yIGZpbGUgcGlja2luZ1xuXHRcdGNsYXNzIFN2Z1BpY2tlck1vZGFsIGV4dGVuZHMgRnV6enlTdWdnZXN0TW9kYWw8VEZpbGU+IHtcblx0XHRcdHByaXZhdGUgb25DaG9vc2U6IChmaWxlOiBURmlsZSkgPT4gdm9pZDtcblxuXHRcdFx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIGZpbGVzOiBURmlsZVtdLCBvbkNob29zZTogKGZpbGU6IFRGaWxlKSA9PiB2b2lkKSB7XG5cdFx0XHRcdHN1cGVyKGFwcCk7XG5cdFx0XHRcdHRoaXMub25DaG9vc2UgPSBvbkNob29zZTtcblx0XHRcdH1cblxuXHRcdFx0Z2V0SXRlbXMoKTogVEZpbGVbXSB7XG5cdFx0XHRcdHJldHVybiBzdmdGaWxlcztcblx0XHRcdH1cblxuXHRcdFx0Z2V0SXRlbVRleHQoaXRlbTogVEZpbGUpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gaXRlbS5wYXRoO1xuXHRcdFx0fVxuXG5cdFx0XHRvbkNob29zZUl0ZW0oaXRlbTogVEZpbGUpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5vbkNob29zZShpdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRuZXcgU3ZnUGlja2VyTW9kYWwodGhpcy5hcHAsIHN2Z0ZpbGVzLCBhc3luYyAoZmlsZSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyID0gYXdhaXQgdGhpcy5lbnN1cmVTYXZlUGF0aCgpO1xuXHRcdFx0XHRjb25zdCBkZXN0UGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7Zm9sZGVyfS8ke2ZpbGUubmFtZX1gKTtcblx0XHRcdFx0bGV0IGluc2VydE5hbWUgPSBmaWxlLm5hbWU7XG5cblx0XHRcdFx0Ly8gSWYgZmlsZSBpcyBhbHJlYWR5IGluIHRoZSBzYXZlIGZvbGRlciwganVzdCBlbnN1cmUgaXQgaGFzIHRoZSBzdHJva2VzIGdyb3VwXG5cdFx0XHRcdGlmIChub3JtYWxpemVQYXRoKGZpbGUucGFyZW50Py5wYXRoIHx8IFwiXCIpID09PSBmb2xkZXIpIHtcblx0XHRcdFx0XHRsZXQgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG5cdFx0XHRcdFx0Y29udGVudCA9IGVuc3VyZVN0eWx1c0dyb3VwKGNvbnRlbnQpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBjb250ZW50KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBDb3B5IHRvIHNhdmUgZm9sZGVyXG5cdFx0XHRcdFx0bGV0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuXHRcdFx0XHRcdGNvbnRlbnQgPSBlbnN1cmVTdHlsdXNHcm91cChjb250ZW50KTtcblxuXHRcdFx0XHRcdGxldCBmaW5hbFBhdGggPSBkZXN0UGF0aDtcblx0XHRcdFx0XHRsZXQgY291bnRlciA9IDE7XG5cdFx0XHRcdFx0d2hpbGUgKGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZXhpc3RzKGZpbmFsUGF0aCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJhc2UgPSBmaWxlLm5hbWUucmVwbGFjZSgvXFwuc3ZnJC9pLCBcIlwiKTtcblx0XHRcdFx0XHRcdGZpbmFsUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7Zm9sZGVyfS8ke2Jhc2V9LSR7Y291bnRlcn0uc3ZnYCk7XG5cdFx0XHRcdFx0XHRjb3VudGVyKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShmaW5hbFBhdGgsIGNvbnRlbnQpO1xuXHRcdFx0XHRcdGluc2VydE5hbWUgPSBmaW5hbFBhdGgucmVwbGFjZSgvXi4qXFwvLywgXCJcIik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJbnNlcnQgZW1iZWQgYXQgY3Vyc29yXG5cdFx0XHRcdGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuXHRcdFx0XHRpZiAodmlldykge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IHZpZXcuZWRpdG9yO1xuXHRcdFx0XHRcdGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKGAhW1ske2luc2VydE5hbWV9fHN0eWx1c11dXFxuYCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRuZXcgTm90aWNlKGBJbXBvcnRlZCAke2ZpbGUubmFtZX0gZm9yIHN0eWx1cyBlZGl0aW5nYCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0bmV3IE5vdGljZShgRmFpbGVkIHRvIGltcG9ydCBTVkc6ICR7ZXJyfWApO1xuXHRcdFx0fVxuXHRcdH0pLm9wZW4oKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFZTztBQWNQLElBQU0sbUJBQW1DO0FBQUEsRUFDeEMsY0FBYztBQUFBLEVBQ2QsZUFBZTtBQUFBLEVBQ2YsaUJBQWlCO0FBQUEsRUFDakIsaUJBQWlCO0FBQUEsRUFDakIsV0FBVztBQUFBLEVBQ1gsVUFBVTtBQUFBLEVBQ1Ysb0JBQW9CO0FBQ3JCO0FBRUEsSUFBTSxhQUFhO0FBQUEsRUFDbEI7QUFBQTtBQUFBLEVBQ0E7QUFBQTtBQUFBLEVBQ0E7QUFBQTtBQUFBLEVBQ0E7QUFBQTtBQUFBLEVBQ0E7QUFBQTtBQUFBLEVBQ0E7QUFBQTtBQUNEO0FBRUEsSUFBTSxhQUFhO0FBQUEsRUFDbEIsRUFBRSxPQUFPLFFBQVEsT0FBTyxFQUFFO0FBQUEsRUFDMUIsRUFBRSxPQUFPLFVBQVUsT0FBTyxFQUFFO0FBQUEsRUFDNUIsRUFBRSxPQUFPLFNBQVMsT0FBTyxFQUFFO0FBQUEsRUFDM0IsRUFBRSxPQUFPLFVBQVUsT0FBTyxFQUFFO0FBQzdC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cUI7QUFDaEMsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLE1BRUEsYUFBYSxNQUFtQjtBQUMvQixhQUFLLFNBQVMsSUFBSTtBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUVBLFFBQUksZUFBZSxLQUFLLEtBQUssVUFBVSxPQUFPLFNBQVM7QUE1OUJ6RDtBQTY5QkcsVUFBSTtBQUNILGNBQU0sU0FBUyxNQUFNLEtBQUssZUFBZTtBQUN6QyxjQUFNLGVBQVcsK0JBQWMsR0FBRyxNQUFNLElBQUksS0FBSyxJQUFJLEVBQUU7QUFDdkQsWUFBSSxhQUFhLEtBQUs7QUFHdEIsZ0JBQUksaUNBQWMsVUFBSyxXQUFMLG1CQUFhLFNBQVEsRUFBRSxNQUFNLFFBQVE7QUFDdEQsY0FBSSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBQzVDLG9CQUFVLGtCQUFrQixPQUFPO0FBQ25DLGdCQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sTUFBTSxPQUFPO0FBQUEsUUFDMUMsT0FBTztBQUVOLGNBQUksVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUM1QyxvQkFBVSxrQkFBa0IsT0FBTztBQUVuQyxjQUFJLFlBQVk7QUFDaEIsY0FBSSxVQUFVO0FBQ2QsaUJBQU8sTUFBTSxLQUFLLElBQUksTUFBTSxRQUFRLE9BQU8sU0FBUyxHQUFHO0FBQ3RELGtCQUFNLE9BQU8sS0FBSyxLQUFLLFFBQVEsV0FBVyxFQUFFO0FBQzVDLDRCQUFZLCtCQUFjLEdBQUcsTUFBTSxJQUFJLElBQUksSUFBSSxPQUFPLE1BQU07QUFDNUQ7QUFBQSxVQUNEO0FBQ0EsZ0JBQU0sS0FBSyxJQUFJLE1BQU0sT0FBTyxXQUFXLE9BQU87QUFDOUMsdUJBQWEsVUFBVSxRQUFRLFNBQVMsRUFBRTtBQUFBLFFBQzNDO0FBR0EsY0FBTSxPQUFPLEtBQUssSUFBSSxVQUFVLG9CQUFvQiw0QkFBWTtBQUNoRSxZQUFJLE1BQU07QUFDVCxnQkFBTSxTQUFTLEtBQUs7QUFDcEIsaUJBQU8saUJBQWlCLE1BQU0sVUFBVTtBQUFBLENBQWE7QUFBQSxRQUN0RDtBQUVBLFlBQUksdUJBQU8sWUFBWSxLQUFLLElBQUkscUJBQXFCO0FBQUEsTUFDdEQsU0FBUyxLQUFLO0FBQ2IsWUFBSSx1QkFBTyx5QkFBeUIsR0FBRyxFQUFFO0FBQUEsTUFDMUM7QUFBQSxJQUNELENBQUMsRUFBRSxLQUFLO0FBQUEsRUFDVDtBQUNEOyIsCiAgIm5hbWVzIjogWyJkIl0KfQo=
