import { slides } from "./generated/slides-data.js";

const root = document.getElementById("slides-root");
const navLinks = document.querySelectorAll(".deck-nav a");
const params = new URLSearchParams(window.location.search);

if (params.get("capture") === "1") {
  document.documentElement.classList.add("capture-mode");
}

function assignStyles(element, styles) {
  Object.entries(styles).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      element.style[key] = value;
    }
  });
}

function baseStyles(layer) {
  return {
    left: layer.x,
    top: layer.y,
    width: layer.w,
    height: layer.h,
    opacity: layer.opacity,
  };
}

function renderText(layer) {
  const element = document.createElement("div");
  element.className = "layer text-layer";
  element.textContent = layer.text;
  assignStyles(element, {
    ...baseStyles(layer),
    color: layer.color,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    fontSize: layer.fontSize,
    lineHeight: layer.lineHeight,
    textAlign: layer.textAlign,
    alignItems: layer.alignItems,
    justifyContent: layer.justifyContent,
    letterSpacing: layer.letterSpacing,
  });
  return element;
}

function renderBox(layer) {
  const element = document.createElement("div");
  element.className = "layer box-layer";
  assignStyles(element, {
    ...baseStyles(layer),
    ...layer.fill,
    borderColor: layer.stroke,
    borderWidth: layer.strokeWeight,
    borderStyle: layer.stroke ? "solid" : undefined,
    borderRadius: layer.radius,
    boxShadow: layer.shadow,
    overflow: layer.overflow,
  });
  return element;
}

function renderAsset(layer) {
  const element = document.createElement("img");
  element.className = "layer asset-layer";
  element.src = layer.src;
  element.alt = "";
  element.decoding = "async";
  assignStyles(element, baseStyles(layer));
  return element;
}

function renderLayer(layer) {
  if (layer.kind === "text") return renderText(layer);
  if (layer.kind === "asset") return renderAsset(layer);
  return renderBox(layer);
}

function renderSlide(slide, index) {
  const section = document.createElement("section");
  section.className = "slide";
  section.id = `slide-${index + 1}`;
  section.setAttribute("aria-label", slide.name);

  const canvas = document.createElement("div");
  canvas.className = "slide-canvas";
  canvas.style.aspectRatio = `${slide.width} / ${slide.height}`;

  slide.layers.forEach((layer) => canvas.appendChild(renderLayer(layer)));
  section.appendChild(canvas);
  return section;
}

slides.forEach((slide, index) => root.appendChild(renderSlide(slide, index)));

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.hash === `#${entry.target.id}`);
      });
    });
  },
  { threshold: 0.55 },
);

document.querySelectorAll(".slide").forEach((slide) => observer.observe(slide));
