import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	Modal,
	Notice,
	normalizePath,
	MarkdownView,
	FuzzySuggestModal,
} from "obsidian";

// ─── Settings ────────────────────────────────────────────────────────────────

interface StylusSettings {
	defaultWidth: number;
	defaultHeight: number;
	defaultPenColor: string;
	defaultPenWidth: number;
	smoothing: number; // 0 = none, 0.3 = low, 0.5 = medium, 0.8 = high
	savePath: string;
	barrelButtonAction: "cycle-color" | "toggle-tool" | "undo";
	heightIncrement: number;
	transparentBackground: boolean;
}

const DEFAULT_SETTINGS: StylusSettings = {
	defaultWidth: 800,
	defaultHeight: 600,
	defaultPenColor: "#000000",
	defaultPenWidth: 2,
	smoothing: 0.5,
	savePath: "stylus",
	barrelButtonAction: "cycle-color",
	heightIncrement: 25,
	transparentBackground: false,
};

const PEN_COLORS = [
	"#000000", // black
	"#e03131", // red
	"#1971c2", // blue
	"#2f9e44", // green
	"#e8590c", // orange
	"#9c36b5", // purple
];

const PEN_WIDTHS = [
	{ label: "Fine", value: 1 },
	{ label: "Medium", value: 2 },
	{ label: "Thick", value: 4 },
	{ label: "Marker", value: 8 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function blankSvg(w: number, h: number): string {
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
		`  <g data-stylus="strokes"></g>`,
		`</svg>`,
	].join("\n");
}

/** Ensure the SVG has a stylus strokes group; return the (possibly modified) string. */
function ensureStylusGroup(svgText: string): string {
	if (svgText.includes('data-stylus="strokes"')) return svgText;
	// Insert before closing </svg>
	return svgText.replace(
		"</svg>",
		'  <g data-stylus="strokes"></g>\n</svg>'
	);
}

interface Point {
	x: number;
	y: number;
	pressure?: number;
}

function buildPathD(points: Point[], smoothing: number): string {
	if (points.length === 0) return "";
	if (points.length === 1) {
		const p = points[0];
		return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
	}
	if (points.length === 2 || smoothing === 0) {
		let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
		for (let i = 1; i < points.length; i++) {
			d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
		}
		return d;
	}

	// Quadratic bezier smoothing through midpoints
	let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

	for (let i = 1; i < points.length - 1; i++) {
		const prev = points[i - 1];
		const curr = points[i];
		const next = points[i + 1];

		// Control point is the current point
		// End point is the midpoint between current and next, blended with smoothing
		const midX = curr.x + (next.x - curr.x) * 0.5;
		const midY = curr.y + (next.y - curr.y) * 0.5;

		const cpX = prev.x + (curr.x - prev.x) * (0.5 + smoothing * 0.5);
		const cpY = prev.y + (curr.y - prev.y) * (0.5 + smoothing * 0.5);

		d += ` Q ${cpX.toFixed(2)} ${cpY.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
	}

	// Last segment
	const last = points[points.length - 1];
	const secondLast = points[points.length - 2];
	d += ` Q ${secondLast.x.toFixed(2)} ${secondLast.y.toFixed(2)} ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;

	return d;
}

let stylusIdCounter = 0;
function nextStylusId(): string {
	return `s${Date.now()}-${stylusIdCounter++}`;
}

// ─── Resize Modal ────────────────────────────────────────────────────────────

class ResizeModal extends Modal {
	width: number;
	height: number;
	onSubmit: (w: number, h: number) => void;

	constructor(app: App, currentW: number, currentH: number, onSubmit: (w: number, h: number) => void) {
		super(app);
		this.width = currentW;
		this.height = currentH;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Resize SVG Canvas" });

		new Setting(contentEl).setName("Width (px)").addText((text) =>
			text.setValue(String(this.width)).onChange((v) => {
				this.width = parseInt(v, 10) || this.width;
			})
		);
		new Setting(contentEl).setName("Height (px)").addText((text) =>
			text.setValue(String(this.height)).onChange((v) => {
				this.height = parseInt(v, 10) || this.height;
			})
		);
		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Apply").setCta().onClick(() => {
				this.onSubmit(this.width, this.height);
				this.close();
			})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ─── Create SVG Modal (filename prompt) ──────────────────────────────────────

class CreateSvgModal extends Modal {
	filename: string;
	width: number;
	height: number;
	onSubmit: (name: string, w: number, h: number) => void;

	constructor(app: App, settings: StylusSettings, defaultFilename: string, onSubmit: (name: string, w: number, h: number) => void) {
		super(app);
		this.filename = defaultFilename;
		this.width = settings.defaultWidth;
		this.height = settings.defaultHeight;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Create New SVG Drawing" });

		new Setting(contentEl).setName("Filename").addText((text) =>
			text
				.setPlaceholder("drawing")
				.setValue(this.filename)
				.onChange((v) => {
					this.filename = v.trim() || this.filename;
				})
		);
		new Setting(contentEl).setName("Width (px)").addText((text) =>
			text.setValue(String(this.width)).onChange((v) => {
				this.width = parseInt(v, 10) || this.width;
			})
		);
		new Setting(contentEl).setName("Height (px)").addText((text) =>
			text.setValue(String(this.height)).onChange((v) => {
				this.height = parseInt(v, 10) || this.height;
			})
		);
		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Create").setCta().onClick(() => {
				this.onSubmit(this.filename, this.width, this.height);
				this.close();
			})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ─── Drawing Canvas Controller ───────────────────────────────────────────────

class StylusCanvas {
	private app: App;
	private file: TFile;
	private settings: StylusSettings;
	private container: HTMLElement;

	// Drawing state
	private svgEl: SVGSVGElement | null = null;
	private strokesGroup: SVGGElement | null = null;
	private currentTool: "pen" | "eraser" = "pen";
	private currentColor: string;
	private currentWidth: number;
	private isDrawing = false;
	private currentPoints: Point[] = [];
	private currentPath: SVGPathElement | null = null;

	// Active state — inactive by default (view-only, no toolbar)
	private active = false;
	private toolbarEl: HTMLElement | null = null;
	private onClickOutside: ((e: MouseEvent) => void) | null = null;

	// Undo/redo stacks store SVG path element outerHTML
	private undoStack: string[] = [];
	private redoStack: string[] = [];

	// Save debounce
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;

	// Toolbar references for active state
	private toolButtons: Map<string, HTMLElement> = new Map();
	private colorButtons: Map<string, HTMLElement> = new Map();
	private widthButtons: Map<number, HTMLElement> = new Map();

	constructor(
		app: App,
		file: TFile,
		settings: StylusSettings,
		container: HTMLElement,
		svgContent: string
	) {
		this.app = app;
		this.file = file;
		this.settings = settings;
		this.container = container;
		this.currentColor = settings.defaultPenColor;
		this.currentWidth = settings.defaultPenWidth;

		this.render(svgContent);
	}

	private render(svgContent: string) {
		this.container.empty();
		this.container.addClass("stylus-canvas-wrapper");

		// ── Toolbar (hidden by default) ──
		const toolbar = this.container.createDiv({ cls: "stylus-toolbar stylus-toolbar-hidden" });
		this.buildToolbar(toolbar);
		this.toolbarEl = toolbar;

		// ── SVG container ──
		const svgContainer = this.container.createDiv({ cls: "stylus-svg-container" });
		if (this.settings.transparentBackground) {
			svgContainer.addClass("stylus-transparent-bg");
		}

		// Parse the SVG content
		const parser = new DOMParser();
		const doc = parser.parseFromString(svgContent, "image/svg+xml");
		const svgRoot = doc.querySelector("svg");
		if (!svgRoot) {
			svgContainer.createEl("p", { text: "Failed to parse SVG." });
			return;
		}

		// Clone into live DOM
		const liveSvg = svgContainer.createSvg("svg");
		// Copy attributes
		for (const attr of Array.from(svgRoot.attributes)) {
			liveSvg.setAttribute(attr.name, attr.value);
		}
		liveSvg.innerHTML = svgRoot.innerHTML;
		liveSvg.addClass("stylus-svg");

		this.svgEl = liveSvg;

		// Ensure strokes group exists
		let strokesG = liveSvg.querySelector('g[data-stylus="strokes"]') as SVGGElement | null;
		if (!strokesG) {
			strokesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
			strokesG.setAttribute("data-stylus", "strokes");
			liveSvg.appendChild(strokesG);
		}
		this.strokesGroup = strokesG;

		// Build undo stack from existing strokes
		this.undoStack = [];
		this.redoStack = [];

		this.updateHasContent();

		// Keyboard shortcuts on the wrapper
		this.container.setAttribute("tabindex", "0");
		this.container.addEventListener("keydown", this.onKeyDown);

		// Click to activate
		this.container.addEventListener("pointerdown", this.onActivateClick);
	}

	// ── Activate / Deactivate ───────────────────────────────────────────────

	private onActivateClick = (e: PointerEvent) => {
		if (this.active) return;
		e.stopPropagation();
		this.activate();
	};

	private activate() {
		if (this.active || !this.svgEl) return;
		this.active = true;

		this.container.addClass("stylus-active");
		this.toolbarEl?.removeClass("stylus-toolbar-hidden");

		// Attach drawing events
		this.svgEl.addEventListener("pointerdown", this.onPointerDown);
		this.svgEl.addEventListener("pointermove", this.onPointerMove);
		this.svgEl.addEventListener("pointerup", this.onPointerUp);
		this.svgEl.addEventListener("pointerleave", this.onPointerUp);
		this.svgEl.style.touchAction = "none";

		// Listen for clicks outside to deactivate
		this.onClickOutside = (e: MouseEvent) => {
			if (!this.container.contains(e.target as Node)) {
				this.deactivate();
			}
		};
		// Use setTimeout so the current click doesn't immediately deactivate
		setTimeout(() => {
			document.addEventListener("pointerdown", this.onClickOutside as EventListener, true);
		}, 0);
	}

	private deactivate() {
		if (!this.active || !this.svgEl) return;
		this.active = false;

		this.container.removeClass("stylus-active");
		this.toolbarEl?.addClass("stylus-toolbar-hidden");

		// Remove drawing events
		this.svgEl.removeEventListener("pointerdown", this.onPointerDown);
		this.svgEl.removeEventListener("pointermove", this.onPointerMove);
		this.svgEl.removeEventListener("pointerup", this.onPointerUp);
		this.svgEl.removeEventListener("pointerleave", this.onPointerUp);
		this.svgEl.style.touchAction = "";

		// Finish any in-progress stroke
		if (this.isDrawing && this.currentPath) {
			this.isDrawing = false;
			this.currentPath = null;
			this.currentPoints = [];
		}

		// Remove outside listener
		if (this.onClickOutside) {
			document.removeEventListener("pointerdown", this.onClickOutside as EventListener, true);
			this.onClickOutside = null;
		}

		// Save on deactivate
		this.scheduleSave();
	}

	private buildToolbar(toolbar: HTMLElement) {
		// ── Tool buttons ──
		const toolGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });

		const penBtn = toolGroup.createEl("button", {
			cls: "stylus-btn stylus-btn-active",
			attr: { "aria-label": "Pen" },
		});
		penBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>`;
		penBtn.addEventListener("click", () => this.setTool("pen"));
		this.toolButtons.set("pen", penBtn);

		const eraserBtn = toolGroup.createEl("button", {
			cls: "stylus-btn",
			attr: { "aria-label": "Eraser" },
		});
		eraserBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`;
		eraserBtn.addEventListener("click", () => this.setTool("eraser"));
		this.toolButtons.set("eraser", eraserBtn);

		// ── Separator ──
		toolbar.createDiv({ cls: "stylus-toolbar-sep" });

		// ── Color buttons ──
		const colorGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });
		for (const color of PEN_COLORS) {
			const btn = colorGroup.createEl("button", {
				cls: "stylus-color-btn" + (color === this.currentColor ? " stylus-btn-active" : ""),
				attr: { "aria-label": `Color ${color}` },
			});
			btn.style.setProperty("--swatch-color", color);
			btn.createDiv({ cls: "stylus-color-swatch" });
			btn.addEventListener("click", () => this.setColor(color));
			this.colorButtons.set(color, btn);
		}

		// ── Separator ──
		toolbar.createDiv({ cls: "stylus-toolbar-sep" });

		// ── Width buttons ──
		const widthGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });
		for (const pw of PEN_WIDTHS) {
			const btn = widthGroup.createEl("button", {
				cls: "stylus-width-btn" + (pw.value === this.currentWidth ? " stylus-btn-active" : ""),
				attr: { "aria-label": pw.label },
			});
			const line = btn.createDiv({ cls: "stylus-width-indicator" });
			line.style.height = `${Math.max(pw.value, 1)}px`;
			btn.addEventListener("click", () => this.setWidth(pw.value));
			this.widthButtons.set(pw.value, btn);
		}

		// ── Separator ──
		toolbar.createDiv({ cls: "stylus-toolbar-sep" });

		// ── Undo / Redo ──
		const histGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });
		const undoBtn = histGroup.createEl("button", {
			cls: "stylus-btn",
			attr: { "aria-label": "Undo" },
		});
		undoBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;
		undoBtn.addEventListener("click", () => this.undo());

		const redoBtn = histGroup.createEl("button", {
			cls: "stylus-btn",
			attr: { "aria-label": "Redo" },
		});
		redoBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>`;
		redoBtn.addEventListener("click", () => this.redo());

		// ── Separator ──
		toolbar.createDiv({ cls: "stylus-toolbar-sep" });

		// ── Resize ──
		const resizeGroup = toolbar.createDiv({ cls: "stylus-toolbar-group" });
		const resizeBtn = resizeGroup.createEl("button", {
			cls: "stylus-btn",
			attr: { "aria-label": "Resize canvas" },
		});
		resizeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/></svg>`;
		resizeBtn.addEventListener("click", () => this.openResize());

		// ── Extend height ──
		const extendBtn = resizeGroup.createEl("button", {
			cls: "stylus-btn",
			attr: { "aria-label": `Extend height +${this.settings.heightIncrement}px` },
		});
		extendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`;
		extendBtn.addEventListener("click", () => this.extendHeight());

		// ── Extend top ──
		const extendTopBtn = resizeGroup.createEl("button", {
			cls: "stylus-btn",
			attr: { "aria-label": `Extend top +${this.settings.heightIncrement}px` },
		});
		extendTopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`;
		extendTopBtn.addEventListener("click", () => this.extendTop());

		// ── Fit to content ──
		const fitBtn = resizeGroup.createEl("button", {
			cls: "stylus-btn",
			attr: { "aria-label": "Fit canvas to content" },
		});
		fitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V9"/><path d="M3 15V9"/><path d="m15 3-3 3-3-3"/><path d="m15 21-3-3-3 3"/><rect x="3" y="9" width="18" height="6" rx="1"/></svg>`;
		fitBtn.addEventListener("click", () => this.fitToContent());
	}

	// ── Tool switching ───────────────────────────────────────────────────────

	private setTool(tool: "pen" | "eraser") {
		this.currentTool = tool;
		this.toolButtons.forEach((btn, key) => {
			btn.toggleClass("stylus-btn-active", key === tool);
		});
		if (this.svgEl) {
			this.svgEl.style.cursor = tool === "eraser" ? "crosshair" : "default";
		}
	}

	private setColor(color: string) {
		this.currentColor = color;
		this.colorButtons.forEach((btn, key) => {
			btn.toggleClass("stylus-btn-active", key === color);
		});
		// Switch to pen when picking a color
		if (this.currentTool !== "pen") this.setTool("pen");
	}

	private setWidth(width: number) {
		this.currentWidth = width;
		this.widthButtons.forEach((btn, key) => {
			btn.toggleClass("stylus-btn-active", key === width);
		});
	}

	private cycleColor() {
		const idx = PEN_COLORS.indexOf(this.currentColor);
		const next = PEN_COLORS[(idx + 1) % PEN_COLORS.length];
		this.setColor(next);
	}

	// ── Barrel button handling ───────────────────────────────────────────────

	private handleBarrelButton() {
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

	private getSvgPoint(e: PointerEvent): Point {
		const svg = this.svgEl!;
		const rect = svg.getBoundingClientRect();
		const viewBox = svg.viewBox.baseVal;

		const scaleX = viewBox.width / rect.width;
		const scaleY = viewBox.height / rect.height;

		return {
			x: (e.clientX - rect.left) * scaleX + viewBox.x,
			y: (e.clientY - rect.top) * scaleY + viewBox.y,
			pressure: e.pressure,
		};
	}

	private onPointerDown = (e: PointerEvent) => {
		if (!this.svgEl || !this.strokesGroup) return;

		// Barrel button (button 2 on stylus) — handle action, don't draw
		if (e.button === 2 && e.pointerType === "pen") {
			e.preventDefault();
			e.stopPropagation();
			this.handleBarrelButton();
			return;
		}

		// Eraser tip (button 5 / buttons 32)
		const isEraserTip = e.button === 5 || (e.buttons & 32) !== 0;
		if (isEraserTip) {
			e.preventDefault();
			e.stopPropagation();
			this.eraseAtPoint(e);
			return;
		}

		// Only primary button for drawing
		if (e.button !== 0) return;

		e.preventDefault();
		e.stopPropagation();

		if (this.currentTool === "eraser") {
			this.eraseAtPoint(e);
			return;
		}

		this.svgEl.setPointerCapture(e.pointerId);

		// Start pen stroke
		this.isDrawing = true;
		this.currentPoints = [this.getSvgPoint(e)];
		this.redoStack = [];

		// Create a live path for visual feedback
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

	private onPointerMove = (e: PointerEvent) => {
		if (!this.svgEl) return;

		e.preventDefault();
		e.stopPropagation();

		// Handle ongoing eraser tip — always erases regardless of current tool
		const isEraserTip = (e.buttons & 32) !== 0;
		if (isEraserTip) {
			this.eraseAtPoint(e);
			return;
		}

		if (this.currentTool === "eraser" && (e.buttons & 1) !== 0) {
			this.eraseAtPoint(e);
			return;
		}

		if (!this.isDrawing || !this.currentPath) return;

		const pt = this.getSvgPoint(e);
		this.currentPoints.push(pt);

		// Update live path with minimal smoothing for responsiveness
		const d = buildPathD(this.currentPoints, this.settings.smoothing);
		this.currentPath.setAttribute("d", d);
	};

	private onPointerUp = (e: PointerEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!this.isDrawing || !this.currentPath) {
			this.isDrawing = false;
			return;
		}

		this.isDrawing = false;

		// Finalize path with full smoothing
		if (this.currentPoints.length > 0) {
			const d = buildPathD(this.currentPoints, this.settings.smoothing);
			this.currentPath.setAttribute("d", d);
			this.undoStack.push(this.currentPath.outerHTML);
		} else {
			// Empty stroke — remove
			this.currentPath.remove();
		}

		this.currentPath = null;
		this.currentPoints = [];
		this.scheduleSave();
	};

	private onKeyDown = (e: KeyboardEvent) => {
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

	// ── Eraser ───────────────────────────────────────────────────────────────

	private eraseAtPoint(e: PointerEvent) {
		if (!this.svgEl || !this.strokesGroup) return;

		const target = document.elementFromPoint(e.clientX, e.clientY);
		// Check if the element under the pointer is a stroke path inside our group
		if (
			target instanceof SVGPathElement &&
			target.closest('g[data-stylus="strokes"]') === this.strokesGroup
		) {
			const outerHTML = target.outerHTML;
			target.remove();
			this.undoStack.push("ERASE:" + outerHTML);
			this.redoStack = [];
			this.scheduleSave();
		}
	}

	// ── Undo / Redo ─────────────────────────────────────────────────────────

	private undo() {
		if (!this.strokesGroup || this.undoStack.length === 0) return;

		const action = this.undoStack.pop()!;
		this.redoStack.push(action);

		if (action.startsWith("ERASE:")) {
			// Re-add the erased path
			const html = action.slice(6);
			const temp = document.createElementNS("http://www.w3.org/2000/svg", "g");
			temp.innerHTML = html;
			const path = temp.firstElementChild;
			if (path) this.strokesGroup.appendChild(path);
		} else {
			// Remove the drawn path by its data-stylus-id
			const temp = document.createElementNS("http://www.w3.org/2000/svg", "g");
			temp.innerHTML = action;
			const ref = temp.firstElementChild;
			const id = ref?.getAttribute("data-stylus-id");
			if (id) {
				const existing = this.strokesGroup.querySelector(`[data-stylus-id="${id}"]`);
				if (existing) existing.remove();
			} else {
				// Fallback: remove last child
				const lastPath = this.strokesGroup.lastElementChild;
				if (lastPath) lastPath.remove();
			}
		}
		this.scheduleSave();
	}

	private redo() {
		if (!this.strokesGroup || this.redoStack.length === 0) return;

		const action = this.redoStack.pop()!;
		this.undoStack.push(action);

		if (action.startsWith("ERASE:")) {
			// Re-erase: remove the path
			const html = action.slice(6);
			// Find the matching path by data-stylus-id
			const temp = document.createElementNS("http://www.w3.org/2000/svg", "g");
			temp.innerHTML = html;
			const ref = temp.firstElementChild;
			const id = ref?.getAttribute("data-stylus-id");
			if (id) {
				const existing = this.strokesGroup.querySelector(`[data-stylus-id="${id}"]`);
				if (existing) existing.remove();
			}
		} else {
			// Re-add the drawn path
			const temp = document.createElementNS("http://www.w3.org/2000/svg", "g");
			temp.innerHTML = action;
			const path = temp.firstElementChild;
			if (path) this.strokesGroup.appendChild(path);
		}
		this.scheduleSave();
	}

	// ── Resize ───────────────────────────────────────────────────────────────

	private openResize() {
		if (!this.svgEl) return;
		const vb = this.svgEl.viewBox.baseVal;
		const curW = vb.width || parseInt(this.svgEl.getAttribute("width") || "800");
		const curH = vb.height || parseInt(this.svgEl.getAttribute("height") || "600");

		new ResizeModal(this.app, curW, curH, (w, h) => {
			if (!this.svgEl) return;
			this.svgEl.setAttribute("width", String(w));
			this.svgEl.setAttribute("height", String(h));
			this.svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
			this.scheduleSave();
		}).open();
	}

	private extendHeight() {
		if (!this.svgEl) return;
		const vb = this.svgEl.viewBox.baseVal;
		const curW = vb.width || parseInt(this.svgEl.getAttribute("width") || "800");
		const curH = vb.height || parseInt(this.svgEl.getAttribute("height") || "600");
		const newH = curH + this.settings.heightIncrement;

		this.svgEl.setAttribute("height", String(newH));
		this.svgEl.setAttribute("viewBox", `0 0 ${curW} ${newH}`);
		this.scheduleSave();
	}

	private extendTop() {
		if (!this.svgEl || !this.strokesGroup) return;
		const vb = this.svgEl.viewBox.baseVal;
		const curW = vb.width || parseInt(this.svgEl.getAttribute("width") || "800");
		const curH = vb.height || parseInt(this.svgEl.getAttribute("height") || "600");
		const inc = this.settings.heightIncrement;
		const newH = curH + inc;

		// Shift all strokes down by the increment
		const paths = this.strokesGroup.querySelectorAll("path");
		for (const path of Array.from(paths)) {
			const transform = path.getAttribute("transform") || "";
			// Parse existing translate if any
			const match = transform.match(/translate\(\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*\)/);
			if (match) {
				const tx = parseFloat(match[1]);
				const ty = parseFloat(match[2]) + inc;
				path.setAttribute("transform", transform.replace(/translate\([^)]+\)/, `translate(${tx}, ${ty})`));
			} else {
				path.setAttribute("transform", `translate(0, ${inc})` + (transform ? ` ${transform}` : ""));
			}
		}

		this.svgEl.setAttribute("height", String(newH));
		this.svgEl.setAttribute("viewBox", `0 0 ${curW} ${newH}`);
		this.scheduleSave();
	}

	private fitToContent() {
		if (!this.svgEl || !this.strokesGroup) return;
		if (this.strokesGroup.children.length === 0) return;

		// Get the bounding box of all strokes
		const bbox = this.strokesGroup.getBBox();
		if (bbox.width === 0 && bbox.height === 0) return;

		const padding = 4; // small padding so strokes don't touch the edge
		const vb = this.svgEl.viewBox.baseVal;
		const curW = vb.width || parseInt(this.svgEl.getAttribute("width") || "800");

		// Shift all strokes up/left to remove top/left margin
		const offsetX = 0; // keep horizontal position — only trim vertically
		const offsetY = bbox.y - padding;

		if (Math.abs(offsetY) > 0.5) {
			const paths = this.strokesGroup.querySelectorAll("path");
			for (const path of Array.from(paths)) {
				const transform = path.getAttribute("transform") || "";
				const match = transform.match(/translate\(\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*\)/);
				if (match) {
					const tx = parseFloat(match[1]);
					const ty = parseFloat(match[2]) - offsetY;
					path.setAttribute("transform", transform.replace(/translate\([^)]+\)/, `translate(${tx}, ${ty})`));
				} else {
					path.setAttribute("transform", `translate(0, ${-offsetY})` + (transform ? ` ${transform}` : ""));
				}
			}
		}

		// New height = content height + padding on both sides
		const newH = Math.ceil(bbox.height + padding * 2);

		this.svgEl.setAttribute("width", String(curW));
		this.svgEl.setAttribute("height", String(newH));
		this.svgEl.setAttribute("viewBox", `0 0 ${curW} ${newH}`);
		this.scheduleSave();
	}

	// ── Persistence ──────────────────────────────────────────────────────────

	private updateHasContent() {
		const hasContent = (this.strokesGroup?.children.length ?? 0) > 0;
		this.container.toggleClass("stylus-has-content", hasContent);
	}

	private scheduleSave() {
		this.updateHasContent();
		if (this.saveTimeout) clearTimeout(this.saveTimeout);
		this.saveTimeout = setTimeout(() => this.save(), 2000);
	}

	private async save() {
		if (!this.svgEl) return;
		try {
			// Serialize the SVG back to text
			const serializer = new XMLSerializer();
			let svgText = serializer.serializeToString(this.svgEl);

			// Clean up any namespace clutter the serializer might add
			svgText = svgText.replace(/ xmlns=""/g, "");

			// Pretty-print a bit: ensure the XML declaration is absent (keep it clean)
			svgText = svgText.replace(/<\?xml[^?]*\?>\s*/, "");

			await this.app.vault.modify(this.file, svgText);
		} catch (err) {
			console.error("Stylus: failed to save", err);
		}
	}

	destroy() {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			// Force a final save
			this.save();
		}
		this.deactivate();
		this.container.removeEventListener("pointerdown", this.onActivateClick);
		this.container.removeEventListener("keydown", this.onKeyDown);
	}
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

class StylusSettingTab extends PluginSettingTab {
	plugin: StylusPlugin;

	constructor(app: App, plugin: StylusPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Stylus Settings" });

		new Setting(containerEl)
			.setName("Save path")
			.setDesc("Default folder for new/imported SVGs (relative to vault root)")
			.addText((text) =>
				text
					.setPlaceholder("stylus")
					.setValue(this.plugin.settings.savePath)
					.onChange(async (v) => {
						this.plugin.settings.savePath = v.trim() || "stylus";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default canvas width")
			.addText((text) =>
				text.setValue(String(this.plugin.settings.defaultWidth)).onChange(async (v) => {
					this.plugin.settings.defaultWidth = parseInt(v, 10) || 800;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Default canvas height")
			.addText((text) =>
				text.setValue(String(this.plugin.settings.defaultHeight)).onChange(async (v) => {
					this.plugin.settings.defaultHeight = parseInt(v, 10) || 600;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Default pen color")
			.addDropdown((dd) => {
				for (const c of PEN_COLORS) {
					dd.addOption(c, c);
				}
				dd.setValue(this.plugin.settings.defaultPenColor);
				dd.onChange(async (v) => {
					this.plugin.settings.defaultPenColor = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default pen width")
			.addDropdown((dd) => {
				for (const pw of PEN_WIDTHS) {
					dd.addOption(String(pw.value), pw.label);
				}
				dd.setValue(String(this.plugin.settings.defaultPenWidth));
				dd.onChange(async (v) => {
					this.plugin.settings.defaultPenWidth = parseInt(v, 10) || 2;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Stroke smoothing")
			.setDesc("Amount of curve smoothing applied to freehand strokes")
			.addDropdown((dd) => {
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

		new Setting(containerEl)
			.setName("Stylus barrel button action")
			.setDesc("Action when the stylus side button is pressed")
			.addDropdown((dd) => {
				dd.addOption("cycle-color", "Cycle pen color");
				dd.addOption("toggle-tool", "Toggle pen / eraser");
				dd.addOption("undo", "Undo last stroke");
				dd.setValue(this.plugin.settings.barrelButtonAction);
				dd.onChange(async (v) => {
					this.plugin.settings.barrelButtonAction = v as StylusSettings["barrelButtonAction"];
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Height increment")
			.setDesc("Pixels added when pressing the extend-height toolbar button")
			.addText((text) =>
				text.setValue(String(this.plugin.settings.heightIncrement)).onChange(async (v) => {
					this.plugin.settings.heightIncrement = parseInt(v, 10) || 25;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Transparent background")
			.setDesc("Use Obsidian's background color instead of white")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.transparentBackground).onChange(async (v) => {
					this.plugin.settings.transparentBackground = v;
					await this.plugin.saveSettings();
				})
			);
	}
}

// ─── Main Plugin ─────────────────────────────────────────────────────────────

export default class StylusPlugin extends Plugin {
	settings: StylusSettings = DEFAULT_SETTINGS;
	private canvases: Map<HTMLElement, StylusCanvas> = new Map();
	private observer: MutationObserver | null = null;

	async onload() {
		await this.loadSettings();

		// ── DOM observer: intercept .internal-embed[alt="stylus"] in any view ──
		this.observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of Array.from(mutation.addedNodes)) {
					if (node instanceof HTMLElement) {
						this.processEmbedsIn(node);
					}
				}
			}
		});
		this.observer.observe(document.body, { childList: true, subtree: true });
		this.register(() => this.observer?.disconnect());

		// Process embeds already in the DOM and on layout changes
		this.app.workspace.onLayoutReady(() => this.processAllEmbeds());
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.processAllEmbeds())
		);

		// ── Command: Create new SVG ──
		this.addCommand({
			id: "create-svg",
			name: "Create new SVG drawing",
			callback: async () => {
				const defaultName = await this.nextDefaultFilename();
				new CreateSvgModal(this.app, this.settings, defaultName, async (filename, w, h) => {
					await this.createSvgFile(filename, w, h);
				}).open();
			},
		});

		// ── Command: Import SVG ──
		this.addCommand({
			id: "import-svg",
			name: "Import SVG as stylus drawing",
			callback: () => {
				this.importSvg();
			},
		});

		// ── Ribbon icon ──
		this.addRibbonIcon("pencil", "New stylus drawing", async () => {
			const defaultName = await this.nextDefaultFilename();
			new CreateSvgModal(this.app, this.settings, defaultName, async (filename, w, h) => {
				await this.createSvgFile(filename, w, h);
			}).open();
		});

		// ── Settings tab ──
		this.addSettingTab(new StylusSettingTab(this.app, this));

		// ── Context menu to prevent browser context menu on barrel button ──
		this.registerDomEvent(document, "contextmenu", (e) => {
			const target = e.target as HTMLElement;
			if (target.closest(".stylus-svg")) {
				e.preventDefault();
			}
		});
	}

	onunload() {
		this.observer?.disconnect();
		for (const canvas of this.canvases.values()) {
			canvas.destroy();
		}
		this.canvases.clear();
	}

	// ── Embed processing ─────────────────────────────────────────────────────

	private processAllEmbeds() {
		const embeds = document.querySelectorAll(
			'.internal-embed[alt="stylus"]'
		);
		for (const embed of Array.from(embeds)) {
			this.processEmbed(embed as HTMLElement);
		}
	}

	private processEmbedsIn(el: HTMLElement) {
		// Check the element itself
		if (
			el.matches?.('.internal-embed[alt="stylus"]')
		) {
			this.processEmbed(el);
		}
		// Check descendants
		const embeds = el.querySelectorAll?.(
			'.internal-embed[alt="stylus"]'
		);
		if (embeds) {
			for (const embed of Array.from(embeds)) {
				this.processEmbed(embed as HTMLElement);
			}
		}
	}

	private async processEmbed(embed: HTMLElement) {
		// Skip if already processed and canvas is still alive
		if (this.canvases.has(embed)) return;

		const src = embed.getAttribute("src");
		if (!src || !src.toLowerCase().endsWith(".svg")) return;

		// Resolve the file — try vault-wide first, then relative to active file
		let file = this.app.metadataCache.getFirstLinkpathDest(src, "");
		if (!file) {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				file = this.app.metadataCache.getFirstLinkpathDest(
					src,
					activeFile.path
				);
			}
		}
		if (!file || !(file instanceof TFile)) return;

		// Read SVG content
		let svgContent = await this.app.vault.read(file);
		svgContent = ensureStylusGroup(svgContent);

		// Replace the embed content with our canvas
		const wrapper = createDiv();
		embed.replaceChildren(wrapper);
		embed.addClass("stylus-embed");

		const canvas = new StylusCanvas(
			this.app,
			file,
			this.settings,
			wrapper,
			svgContent
		);
		this.canvases.set(embed, canvas);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async ensureSavePath(): Promise<string> {
		const folder = normalizePath(this.settings.savePath);
		if (!(await this.app.vault.adapter.exists(folder))) {
			await this.app.vault.createFolder(folder);
		}
		return folder;
	}

	private async nextDefaultFilename(): Promise<string> {
		const folder = normalizePath(this.settings.savePath);
		const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
		const base = `${date}-drawing`;
		let name = base;
		let counter = 1;
		while (await this.app.vault.adapter.exists(normalizePath(`${folder}/${name}.svg`))) {
			name = `${base}-${counter}`;
			counter++;
		}
		return name;
	}

	private async createSvgFile(filename: string, width: number, height: number) {
		try {
			const folder = await this.ensureSavePath();
			const safeName = filename.replace(/\.svg$/i, "");
			let path = normalizePath(`${folder}/${safeName}.svg`);

			// Avoid overwriting
			let counter = 1;
			while (await this.app.vault.adapter.exists(path)) {
				path = normalizePath(`${folder}/${safeName}-${counter}.svg`);
				counter++;
			}

			const content = blankSvg(width, height);
			await this.app.vault.create(path, content);

			// Insert embed at cursor in active editor
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				const editor = view.editor;
				const basename = path.replace(/^.*\//, "");
				editor.replaceSelection(`![[${basename}|stylus]]\n`);
			}

			new Notice(`Created ${path}`);
		} catch (err) {
			new Notice(`Failed to create SVG: ${err}`);
		}
	}

	private async importSvg() {
		// Get all SVG files in the vault
		const svgFiles = this.app.vault.getFiles().filter(
			(f) => f.extension.toLowerCase() === "svg"
		);

		if (svgFiles.length === 0) {
			new Notice("No SVG files found in vault.");
			return;
		}

		// Use FuzzySuggestModal for file picking
		class SvgPickerModal extends FuzzySuggestModal<TFile> {
			private onChoose: (file: TFile) => void;

			constructor(app: App, files: TFile[], onChoose: (file: TFile) => void) {
				super(app);
				this.onChoose = onChoose;
			}

			getItems(): TFile[] {
				return svgFiles;
			}

			getItemText(item: TFile): string {
				return item.path;
			}

			onChooseItem(item: TFile): void {
				this.onChoose(item);
			}
		}

		new SvgPickerModal(this.app, svgFiles, async (file) => {
			try {
				const folder = await this.ensureSavePath();
				const destPath = normalizePath(`${folder}/${file.name}`);
				let insertName = file.name;

				// If file is already in the save folder, just ensure it has the strokes group
				if (normalizePath(file.parent?.path || "") === folder) {
					let content = await this.app.vault.read(file);
					content = ensureStylusGroup(content);
					await this.app.vault.modify(file, content);
				} else {
					// Copy to save folder
					let content = await this.app.vault.read(file);
					content = ensureStylusGroup(content);

					let finalPath = destPath;
					let counter = 1;
					while (await this.app.vault.adapter.exists(finalPath)) {
						const base = file.name.replace(/\.svg$/i, "");
						finalPath = normalizePath(`${folder}/${base}-${counter}.svg`);
						counter++;
					}
					await this.app.vault.create(finalPath, content);
					insertName = finalPath.replace(/^.*\//, "");
				}

				// Insert embed at cursor
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					const editor = view.editor;
					editor.replaceSelection(`![[${insertName}|stylus]]\n`);
				}

				new Notice(`Imported ${file.name} for stylus editing`);
			} catch (err) {
				new Notice(`Failed to import SVG: ${err}`);
			}
		}).open();
	}
}
