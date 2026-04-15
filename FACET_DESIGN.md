# Facet Design Language — Crystal Labs Reference

A summary of the **Facet Design Language** used in the Crystal GUI, written for web developers building the Crystal Labs company website.

---

## Philosophy

Facet is a design system built around the metaphor of a cut gemstone. Every surface has an angle, every edge is intentional, and depth is created through stacked gradients rather than shadows alone. The aesthetic is simultaneously industrial and organic — precise geometry with luminous, refractive color.

**Three pillars:**
1. **Chamfered geometry** — corners are cut at 45°, not rounded
2. **Crystal surfaces** — cards and panels use multi-gradient faceting to simulate 3D gem faces
3. **Dual themes** — every color exists in two worlds: Amethyst (dark) and Celestite (light)

---

## Theme Cues

### Amethyst (Dark Mode)

The dark theme draws from deep-space purple and violet — rich, saturated, and high-contrast.

| Role | Value | Notes |
|------|-------|-------|
| Background base | `#0d0d14` | Near-black with a purple tint |
| Background elevated | `#141420` | Slightly lifted surfaces |
| Card surface | `#1a1a2e` | Card backgrounds |
| Card elevated | `#232338` | Hoverable/active cards |
| Primary | `hsl(280°, 67%, 59%)` — `#9d4edd` | Crystal Purple |
| Accent | `hsl(280°, 100%, 73%)` — `#c77dff` | Bright Amethyst |
| Text primary | `#f8fafc` | Near-white |
| Text secondary | `#94a3b8` | Blue-grey |
| Text muted | `#64748b` | Subdued labels |
| Glow color | Purple @ 40% opacity | Bloom on active elements |
| Facet light | `#9d4edd` | Bright face of a crystal |
| Facet dark | `#37224f` | Shadow face of a crystal |
| Crystal edge | `#c77dff` @ 25% opacity | Edge highlight |

**Personality:** Like looking into a geode. Dark surfaces, glowing interior light, violet bloom everywhere.

---

### Celestite (Light Mode)

The light theme evokes pale blue minerals and frosted glass — cool, airy, and refined.

| Role | Value | Notes |
|------|-------|-------|
| Background base | `hsl(213°, 33%, 97%)` — `#f5f7fa` | Blue-tinted ivory |
| Background elevated | `hsl(0°, 0%, 100%)` — `#fafbfc` | Pure-white panels |
| Primary | `hsl(217°, 99%, 65%)` — `#4a9eff` | Crystal Blue |
| Accent | `hsl(197°, 72%, 68%)` — `#68d5ff` | Sky Blue |
| Text primary | `#0f172a` | Near-black |
| Text secondary | `#475569` | Slate |
| Text muted | `#94a3b8` | Grey-blue |
| Glow color | Blue @ 22% opacity | Softer bloom than amethyst |
| Facet light | `#4fa3d1` | Pale crystal face |
| Facet dark | `#1e6b96` | Deep crystal shadow |
| Crystal edge | `#4fa3d1` @ 18% opacity | Subtle edge |

**Personality:** Like looking at a piece of celestite crystal on a bright morning. Cool, mineral, luminous.

---

## Typography

| Family | Usage | Class |
|--------|-------|-------|
| **Geist** (sans-serif) | Body text, UI labels | `font-sans` |
| **Chakra Petch** | Headings, display text | `font-heading` |
| **Space Mono** | Code, addresses, hashes | `font-mono` |

Chakra Petch is the personality font — its geometric, slightly futuristic letterforms reinforce the crystalline aesthetic in headings and UI labels.

---

## Chamfered Geometry

The defining visual signature of Facet. Instead of `border-radius`, corners are **cut** at 45° using CSS `clip-path: polygon()`.

### The Three Sizes

```css
/* Standard UI elements: cards, panels, modals */
.chamfered {
  clip-path: polygon(
    8px 0, calc(100% - 8px) 0,
    100% 8px, 100% calc(100% - 8px),
    calc(100% - 8px) 100%, 8px 100%,
    0 calc(100% - 8px), 0 8px
  );
}

/* Small elements: buttons, inputs, badges, chips */
.chamfered-sm {
  clip-path: polygon(
    4px 0, calc(100% - 4px) 0,
    100% 4px, 100% calc(100% - 4px),
    calc(100% - 4px) 100%, 4px 100%,
    0 calc(100% - 4px), 0 4px
  );
}

/* Large elements: hero cards, feature blocks */
.chamfered-lg {
  clip-path: polygon(
    12px 0, calc(100% - 12px) 0,
    100% 12px, 100% calc(100% - 12px),
    calc(100% - 12px) 100%, 12px 100%,
    0 calc(100% - 12px), 0 12px
  );
}
```

### Chamfered Border (the border trick)

Because `clip-path` clips borders too, borders on chamfered elements require a wrapper technique:

```css
/* Wrapper creates 1px border that follows the chamfered polygon */
.chamfered-border-wrap {
  clip-path: polygon(
    8px 0, calc(100% - 8px) 0,
    100% 8px, 100% calc(100% - 8px),
    calc(100% - 8px) 100%, 8px 100%,
    0 calc(100% - 8px), 0 8px
  );
  padding: 1px;
  background: var(--_cb-color, hsl(var(--border)));
}

/* Inner content fills the border inset */
.chamfered-border-wrap > * {
  clip-path: polygon(/* same coords */);
  background: hsl(var(--background));
}
```

**Usage:** Wrap a `.chamfered` element inside a `.chamfered-border-wrap` div. The wrapper provides the 1px border color; the inner element provides the fill. The cut corners align perfectly.

---

## Faceted Border (gradient border)

For premium elements, use a gradient border that shifts from primary → border → accent:

```css
.faceted-border {
  border: 1px solid transparent;
  background:
    /* fill stays solid */
    linear-gradient(hsl(var(--card)), hsl(var(--card))) padding-box,
    /* border rotates through primary/accent */
    linear-gradient(
      135deg,
      hsl(var(--primary) / 0.4) 0%,
      hsl(var(--border)) 30%,
      hsl(var(--accent) / 0.3) 60%,
      hsl(var(--border)) 100%
    ) border-box;
}
```

This creates a border that appears to catch light at an angle, as if the edge of a crystal is refracting.

---

## Crystalline Card Surface

The `.crystalline` class simulates a polished gem face — three gradients combined create the sense of depth and faceting:

```css
.crystalline {
  position: relative;
  background: linear-gradient(
    145deg,
    hsl(var(--card)) 0%,
    hsl(var(--card-elevated)) 50%,
    hsl(var(--card)) 100%
  );
}

/* Pseudo-element provides the faceted gradient border */
.crystalline::before {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid transparent;
  background: linear-gradient(
    135deg,
    hsl(var(--crystal-facet-light) / 0.3) 0%,
    hsl(var(--border)) 25%,
    hsl(var(--crystal-edge)) 50%,
    hsl(var(--border)) 75%,
    hsl(var(--crystal-facet-dark) / 0.2) 100%
  ) border-box;
  /* Clip to border only */
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

**Usage:** Combine `.chamfered` + `.crystalline` + `shadow-crystalline` for the signature card:

```html
<div class="chamfered crystalline shadow-crystalline p-6">
  <!-- premium card content -->
</div>
```

---

## Hex-Gem Faceting Effect

For icon containers, status indicators, or decorative elements that should look like cut gems, use the hex-gem multi-gradient technique:

```css
/* Variables set per-element for color-mapped facets */
--gem-highlight: /* lighter shade */;
--gem-base: /* base color */;
--gem-shadow: /* darker shade */;

.hex-gem {
  background:
    /* Facet 1: diagonal top-left shadow ↔ bottom-right highlight */
    linear-gradient(34deg,
      hsl(var(--gem-shadow) / 0.28) 50%,
      hsl(var(--gem-highlight) / 0.28) 50%
    ),
    /* Facet 2: diagonal top-right highlight ↔ bottom-left shadow */
    linear-gradient(146deg,
      hsl(var(--gem-highlight) / 0.28) 50%,
      hsl(var(--gem-shadow) / 0.28) 50%
    ),
    /* Facet 3: horizontal light ↔ shadow (subtle) */
    linear-gradient(180deg,
      hsl(var(--gem-highlight) / 0.15) 50%,
      hsl(var(--gem-shadow) / 0.15) 50%
    ),
    /* Facet 4: lateral symmetry break (very subtle) */
    linear-gradient(90deg,
      hsl(var(--gem-highlight) / 0.06) 50%,
      hsl(var(--gem-shadow) / 0.06) 50%
    );
  background-color: hsl(var(--gem-base) / 0.10);
}
```

Apply this to a `.hexagon` or `.chamfered` shape. The four gradients at different angles simulate how light hits the triangular faces of a cut gem.

---

## Other Geometric Shapes

```css
/* 4-sided diamond — status dots, decorative accents */
.diamond {
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}

/* Hexagonal containers — icon backgrounds, badges */
.hexagon {
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}

/* Octagon — heavy feature elements */
.octagon {
  clip-path: polygon(
    30% 0%, 70% 0%,
    100% 30%, 100% 70%,
    70% 100%, 30% 100%,
    0% 70%, 0% 30%
  );
}
```

---

## Glow System

All glow effects use a single `--glow-color` CSS variable, so they adapt automatically to the current theme:

```css
/* Amethyst: purple glow */
[data-theme="amethyst"] { --glow-color: hsl(280deg 67% 59% / 0.4); }

/* Celestite: blue glow */
[data-theme="celestite"] { --glow-color: hsl(217deg 99% 65% / 0.22); }

/* Applied as box-shadow */
.shadow-glow-sm { box-shadow: 0 0 10px var(--glow-color); }
.shadow-glow    { box-shadow: 0 0 20px var(--glow-color), 0 0 40px var(--glow-color); }

/* Crystalline card shadow */
.shadow-crystalline {
  box-shadow:
    0 4px 20px -2px hsl(var(--primary) / 0.15),
    0 2px 8px -2px hsl(var(--primary) / 0.1);
}
```

---

## Crystal Refraction Line

A decorative detail added to large surface cards — a subtle diagonal light streak that mimics internal crystal refraction:

```css
.crystal-refraction::after {
  content: "";
  position: absolute;
  top: 15%;
  left: 8%;
  right: 55%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    hsl(var(--crystal-facet-light) / 0.15) 30%,
    hsl(var(--crystal-facet-light) / 0.08) 70%,
    transparent 100%
  );
  transform: rotate(-12deg);
  pointer-events: none;
}
```

---

## Sidebar/Nav Outline Glow

For navigation elements, a conic gradient cycles between celestite blue and amethyst purple, creating an animated "scanner" effect:

```css
@property --nav-outline-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

.nav-outline-glow {
  background: conic-gradient(
    from var(--nav-outline-angle),
    hsl(var(--celestite-blue) / 0.65),
    hsl(var(--celestite-blue-soft) / 0.65),
    hsl(var(--amethyst-purple) / 0.65),
    hsl(var(--amethyst-purple-soft) / 0.65),
    hsl(var(--celestite-blue) / 0.65)
  ) border-box;
  animation: outline-rotate 7.5s linear infinite;
}

@keyframes outline-rotate {
  to { --nav-outline-angle: 360deg; }
}
```

---

## Semantic Crystal Colors

These colors appear across both themes with consistent meaning:

| Element | Hue | Role |
|---------|-----|------|
| **Stem** 🌿 | Green `142°, 71%` | Fast PoW blocks, live data |
| **Leaf** 🍃 | Cyan `200°, 95%` | Finalized blocks, persisted state |
| **Fruit** 🍎 | Orange `25°, 95%` | PoS shards, validators |

Each has `highlight`, `shadow`, and `specular` variants for use with the hex-gem faceting system.

---

## Angular Dividers

```css
/* Horizontal rule with diamond endpoints */
.divider-angular {
  position: relative;
  height: 1px;
  background: hsl(var(--border));
}

.divider-angular::before,
.divider-angular::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 6px;
  height: 6px;
  background: hsl(var(--border));
  transform: translateY(-50%) rotate(45deg);
}

.divider-angular::before { left: 0; }
.divider-angular::after  { right: 0; }
```

---

## Shimmer Animation

For loading skeletons and active state bars:

```css
.shimmer {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 0%,
    hsl(var(--muted-foreground) / 0.2) 50%,
    hsl(var(--muted)) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}
```

---

## Hex Grid Background

A subtle SVG hex grid is used as a full-bleed page texture:

```css
.hex-grid-bg::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='52' viewBox='0 0 60 52'><path d='M30 2 L58 17 L58 35 L30 50 L2 35 L2 17 Z' fill='none' stroke='%239d4edd' stroke-width='0.5' opacity='0.08'/></svg>");
  pointer-events: none;
}

[data-theme="celestite"] .hex-grid-bg::before {
  background-image: url("data:image/svg+xml,<svg ... stroke='%233b82f6' ... opacity='0.06'/>");
}
```

---

## Practical Composition Patterns

### Premium Feature Card
```html
<div class="chamfered-border-wrap">
  <div class="chamfered crystalline crystal-refraction shadow-crystalline p-8">
    <h2 class="font-heading text-2xl text-foreground">Feature Title</h2>
    <p class="text-foreground-muted mt-2">Description text</p>
  </div>
</div>
```

### Primary CTA Button
```html
<button class="chamfered-sm bg-primary text-primary-foreground
               px-6 py-3 font-heading tracking-wide
               hover:bg-primary-hover hover:shadow-glow-sm
               active:scale-[0.98] transition-all">
  Get Started
</button>
```

### Status Badge
```html
<span class="chamfered-sm bg-success/15 text-success
             px-3 py-1 text-xs font-heading tracking-widest uppercase">
  Live
</span>
```

### Hexagonal Icon Container (with gem faceting)
```html
<div class="hexagon hex-gem w-16 h-16 flex items-center justify-center"
     style="--gem-highlight: var(--primary); --gem-base: var(--primary); --gem-shadow: var(--primary);">
  <!-- icon -->
</div>
```

---

## Key Files (Crystal GUI)

| File | Contents |
|------|---------|
| `src/styles/globals.css` | All CSS variables, chamfered/crystalline/hex-gem classes, animations |
| `tailwind.config.js` | Extended Tailwind config — all theme colors, shadows, fonts, transitions |
| `src/components/ui/button.tsx` | Button variants with chamfered geometry |
| `src/components/ui/card.tsx` | Card variants including crystalline |
| `src/components/ui/badge.tsx` | Badge shapes + hex-gem gem color mapping |
| `src/components/common/ThemeProvider.tsx` | Amethyst/celestite theme switching |
