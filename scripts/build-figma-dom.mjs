import fs from "node:fs/promises";
import path from "node:path";

const FILE_KEY = "5oyoEl9g9orTmc3qsSPu7N";
const NODE_IDS = ["100:65", "113:4656", "113:4664", "113:4670"];
const OUT_DIR = "src/generated";
const IMAGE_DIR = "public/figma-images";
const VECTOR_DIR = "public/figma-vectors";

const token = process.env.FIGMA_TOKEN || process.env.FIGMA_ACCESS_TOKEN || "";

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function colorToCss(color, opacity = 1) {
  if (!color) return "transparent";
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = Math.max(0, Math.min(1, (color.a ?? 1) * opacity));
  return a >= 0.999 ? `rgb(${r} ${g} ${b})` : `rgba(${r}, ${g}, ${b}, ${round(a)})`;
}

function round(value, digits = 4) {
  return Number.parseFloat(Number(value).toFixed(digits));
}

function pct(value, total) {
  return `${round((value / total) * 100, 5)}%`;
}

function cqw(value, rootWidth) {
  return `${round((value / rootWidth) * 100, 5)}cqw`;
}

function hasVisiblePaint(paints = []) {
  return paints.some((paint) => paint.visible !== false && paint.opacity !== 0);
}

function firstVisiblePaint(paints = []) {
  return paints.find((paint) => paint.visible !== false && paint.opacity !== 0);
}

function cssString(value) {
  return value == null || value === "" ? "" : String(value);
}

function fontFamily(style = {}) {
  const family = style.fontFamily || "";
  if (/Paperlogy/i.test(family)) return "Paperlogy";
  if (/Freesentation/i.test(family)) return "Freesentation";
  if (/Pretendard/i.test(family)) return "Pretendard";
  return "Freesentation";
}

function fontWeight(style = {}) {
  if (style.fontWeight) return style.fontWeight;
  const post = `${style.fontPostScriptName || ""} ${style.fontStyle || ""}`;
  if (/Black/i.test(post)) return 900;
  if (/Extra\s*Bold/i.test(post)) return 800;
  if (/Bold/i.test(post)) return 700;
  if (/Semi\s*Bold/i.test(post)) return 600;
  if (/Medium/i.test(post)) return 500;
  if (/Light/i.test(post)) return 300;
  return 400;
}

function textAlign(style = {}) {
  const align = style.textAlignHorizontal;
  if (align === "CENTER") return "center";
  if (align === "RIGHT") return "right";
  return "left";
}

function alignItems(style = {}) {
  const align = textAlign(style);
  if (align === "center") return "center";
  if (align === "right") return "flex-end";
  return "flex-start";
}

function justifyContent(style = {}) {
  const vertical = style.textAlignVertical;
  if (vertical === "CENTER") return "center";
  if (vertical === "BOTTOM") return "flex-end";
  return "flex-start";
}

function lineHeight(style = {}, rootWidth) {
  const unit = style.lineHeightUnit;
  const px = style.lineHeightPx;
  if (unit === "PIXELS" && px) return cqw(px, rootWidth);
  if (unit === "FONT_SIZE_%" && style.lineHeightPercentFontSize) {
    return `${round(style.lineHeightPercentFontSize / 100, 4)}`;
  }
  if (unit === "INTRINSIC_%") return "normal";
  return px ? cqw(px, rootWidth) : "1.1";
}

function radiusCss(node, rootWidth) {
  if (Array.isArray(node.rectangleCornerRadii)) {
    return node.rectangleCornerRadii.map((v) => cqw(v, rootWidth)).join(" ");
  }
  if (node.cornerRadius) return cqw(node.cornerRadius, rootWidth);
  return "";
}

function effectCss(effects = [], rootWidth) {
  const shadows = effects
    .filter((effect) => effect.visible !== false && effect.type === "DROP_SHADOW")
    .map((effect) => {
      const color = colorToCss(effect.color, effect.opacity ?? 1);
      const x = effect.offset?.x ?? 0;
      const y = effect.offset?.y ?? 0;
      const blur = effect.radius ?? 0;
      return `${cqw(x, rootWidth)} ${cqw(y, rootWidth)} ${cqw(blur, rootWidth)} ${color}`;
    });
  return shadows.join(", ");
}

function backgroundCss(node, imageMap) {
  const fill = firstVisiblePaint(node.fills);
  if (!fill) return {};

  if (fill.type === "SOLID") {
    return { background: colorToCss(fill.color, fill.opacity ?? 1) };
  }

  if (fill.type === "IMAGE" && fill.imageRef && imageMap[fill.imageRef]) {
    const mode = fill.scaleMode === "FIT" ? "contain" : "cover";
    return {
      backgroundImage: `url(${imageMap[fill.imageRef]})`,
      backgroundSize: mode,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }

  if (fill.type?.startsWith("GRADIENT") && fill.gradientStops?.length) {
    const stops = fill.gradientStops
      .map((stop) => `${colorToCss(stop.color)} ${round((stop.position ?? 0) * 100, 2)}%`)
      .join(", ");
    return { background: `linear-gradient(135deg, ${stops})` };
  }

  return {};
}

function isVectorAsset(node) {
  return node.type === "VECTOR" || node.type === "REGULAR_POLYGON";
}

function collect(node, root, output, vectorIds, imageRefs) {
  if (node.visible === false) return;
  if (!node.absoluteBoundingBox) {
    node.children?.forEach((child) => collect(child, root, output, vectorIds, imageRefs));
    return;
  }

  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.type === "IMAGE" && fill.imageRef) imageRefs.add(fill.imageRef);
    }
  }

  const box = node.absoluteBoundingBox;
  const rootBox = root.absoluteBoundingBox;
  const base = {
    id: node.id,
    type: node.type,
    name: node.name,
    x: pct(box.x - rootBox.x, rootBox.width),
    y: pct(box.y - rootBox.y, rootBox.height),
    w: pct(box.width, rootBox.width),
    h: pct(box.height, rootBox.height),
    opacity: node.opacity == null ? undefined : round(node.opacity),
  };

  if (node.type === "TEXT" && node.characters) {
    const style = node.style || {};
    const fills = node.fills || [];
    output.push({
      ...base,
      kind: "text",
      text: node.characters,
      fontFamily: fontFamily(style),
      fontWeight: fontWeight(style),
      fontSize: cqw(style.fontSize || 16, rootBox.width),
      lineHeight: lineHeight(style, rootBox.width),
      color: colorToCss(firstVisiblePaint(fills)?.color, firstVisiblePaint(fills)?.opacity ?? 1),
      textAlign: textAlign(style),
      alignItems: alignItems(style),
      justifyContent: justifyContent(style),
      letterSpacing: style.letterSpacing ? cqw(style.letterSpacing, rootBox.width) : undefined,
    });
    return;
  }

  if (isVectorAsset(node) && box.width > 0 && box.height > 0) {
    vectorIds.add(node.id);
    output.push({
      ...base,
      kind: "asset",
      src: `/figma-vectors/${sanitizeId(node.id)}.svg`,
    });
    return;
  }

  const hasPaint = hasVisiblePaint(node.fills) || hasVisiblePaint(node.strokes) || node.effects?.length;
  if (hasPaint) {
    const fillCss = backgroundCss(node, {});
    const stroke = firstVisiblePaint(node.strokes);
    output.push({
      ...base,
      kind: "box",
      fill: fillCss,
      stroke: stroke ? colorToCss(stroke.color, stroke.opacity ?? 1) : undefined,
      strokeWeight: stroke ? cqw(node.strokeWeight || 1, rootBox.width) : undefined,
      radius: radiusCss(node, rootBox.width) || undefined,
      shadow: effectCss(node.effects, rootBox.width) || undefined,
      overflow: node.clipsContent ? "hidden" : undefined,
      rawFills: node.fills,
    });
  }

  node.children?.forEach((child) => collect(child, root, output, vectorIds, imageRefs));
}

async function readJson(file) {
  return JSON.parse(stripBom(await fs.readFile(file, "utf8")));
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(file, buffer);
}

async function exportVectorUrls(ids) {
  if (!token || ids.length === 0) return {};
  const all = {};
  for (let index = 0; index < ids.length; index += 80) {
    const chunk = ids.slice(index, index + 80);
    const query = new URLSearchParams({
      ids: chunk.join(","),
      format: "svg",
    });
    const res = await fetch(`https://api.figma.com/v1/images/${FILE_KEY}?${query}`, {
      headers: { "X-Figma-Token": token },
    });
    if (!res.ok) throw new Error(`Vector export failed ${res.status}`);
    const json = await res.json();
    Object.assign(all, json.images || {});
  }
  return all;
}

async function main() {
  const nodes = await readJson("figma-nodes.json");
  const imageFills = await readJson("figma-image-fills.json");

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  await fs.mkdir(VECTOR_DIR, { recursive: true });

  const slides = [];
  const vectorIds = new Set();
  const imageRefs = new Set();

  for (const id of NODE_IDS) {
    const root = nodes.nodes[id]?.document;
    if (!root) throw new Error(`Missing node ${id}`);
    const layers = [];
    root.children?.forEach((child) => collect(child, root, layers, vectorIds, imageRefs));
    slides.push({
      id,
      name: root.name,
      width: root.absoluteBoundingBox.width,
      height: root.absoluteBoundingBox.height,
      layers,
    });
  }

  const imageMap = {};
  for (const ref of imageRefs) {
    const url = imageFills.meta?.images?.[ref];
    if (!url) continue;
    const file = `${sanitizeId(ref)}.png`;
    const target = path.join(IMAGE_DIR, file);
    await download(url, target);
    imageMap[ref] = `/figma-images/${file}`;
  }

  const vectorUrls = await exportVectorUrls([...vectorIds]);
  for (const id of vectorIds) {
    const url = vectorUrls[id];
    if (!url) continue;
    await download(url, path.join(VECTOR_DIR, `${sanitizeId(id)}.svg`));
  }

  for (const slide of slides) {
    for (const layer of slide.layers) {
      if (layer.kind === "box" && layer.rawFills) {
        layer.fill = backgroundCss({ fills: layer.rawFills }, imageMap);
        delete layer.rawFills;
      }
    }
  }

  await fs.writeFile(
    path.join(OUT_DIR, "slides-data.js"),
    `export const slides = ${JSON.stringify(slides, null, 2)};\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        slides: slides.length,
        layers: slides.reduce((sum, slide) => sum + slide.layers.length, 0),
        imageRefs: imageRefs.size,
        vectorAssets: vectorIds.size,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
