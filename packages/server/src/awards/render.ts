import 'server-only';
import {paintWinning} from './winning.js';
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Image } from '@napi-rs/canvas';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import type { CertSpec, CertTextStyle } from './layouts';
export type CertFields = Record<string,string|null|undefined>;
export type CertPaintOptions = {blurKeys?:readonly string[]};
function asset(path:string){if(!/^\/(certs|ticket-share)\/[a-zA-Z0-9_./ -]+$/.test(path)||path.includes('..'))throw new Error('invalid_asset');const relative=path.slice(1);const local=resolve(process.cwd(),'../../packages/server/assets/awards',relative);if(existsSync(local))return local;return resolve(process.cwd(),'packages/server/assets/awards',relative);}
const loaded=new Set<string>();
const plates=new Map<string,Promise<Image>>();
function fontString(weight: number, size: number, family: string) {
  return `${weight} ${size}px "${family}"`;
}

function measureRun(
  ctx: SKRSContext2D,
  text: string,
  tracking: number,
) {
  let width = 0;
  let glyphs = 0;
  for (const glyph of text) {
    width += ctx.measureText(glyph).width;
    glyphs += 1;
  }
  return width + tracking * Math.max(0, glyphs - 1);
}

function eachGlyph(
  ctx: SKRSContext2D,
  text: string,
  start: number,
  tracking: number,
  draw: (glyph: string, x: number) => void,
) {
  let x = start;
  for (const glyph of text) {
    draw(glyph, x);
    x += ctx.measureText(glyph).width + tracking;
  }
}

function setShadow(
  ctx: SKRSContext2D,
  shadow: { color: string; blur: number; dx: number; dy: number } | null,
) {
  ctx.shadowColor = shadow ? shadow.color : "transparent";
  ctx.shadowBlur = shadow ? shadow.blur : 0;
  ctx.shadowOffsetX = shadow ? shadow.dx : 0;
  ctx.shadowOffsetY = shadow ? shadow.dy : 0;
}

function supportsFilter(ctx: SKRSContext2D) {
  return typeof (ctx as { filter?: unknown }).filter === "string";
}

function drawRun(
  ctx: SKRSContext2D,
  style: CertTextStyle,
  raw: string,
  blur: boolean,
) {
  let text = style.uppercase ? raw.toUpperCase() : raw;
  if (blur && !supportsFilter(ctx)) text = "HIDDEN";
  if (!text) return;

  ctx.save();
  ctx.translate(style.x, style.y);
  if (style.rot) ctx.rotate((style.rot * Math.PI) / 180);
  const scaleX = style.scaleX ?? 1;
  ctx.scale(scaleX, 1);

  let size = style.size;
  let tracking = style.tracking ?? 0;
  const weight = style.weight ?? 400;
  ctx.font = fontString(weight, size, style.family);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "miter";
  ctx.miterLimit = 4;

  if (style.maxWidth) {
    const width = measureRun(ctx, text, tracking) * scaleX;
    if (width > style.maxWidth) {
      const factor = style.maxWidth / width;
      size *= factor;
      tracking *= factor;
      ctx.font = fontString(weight, size, style.family);
    }
  }

  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  const width = measureRun(ctx, text, tracking);
  const start =
    style.align === "left" ? 0 : style.align === "right" ? -width : -width / 2;
  ctx.translate(0, (ascent - descent) / 2);

  const face = ctx.createLinearGradient(0, -ascent, 0, descent);
  style.colors.forEach((color, index) =>
    face.addColorStop(
      style.colors.length === 1 ? 0 : index / (style.colors.length - 1),
      color,
    ),
  );

  if (blur) ctx.filter = `blur(${Math.max(4, size * 0.16)}px)`;

  const fill = (paint: string | ReturnType<SKRSContext2D["createLinearGradient"]>) => {
    ctx.fillStyle = paint;
    eachGlyph(ctx, text, start, tracking, (glyph, x) =>
      ctx.fillText(glyph, x, 0),
    );
  };

  // 1. soft glow
  if (style.glow) {
    setShadow(ctx, { color: style.glow.color, blur: style.glow.blur, dx: 0, dy: 0 });
    fill(style.colors[1] ?? style.colors[0]);
  }
  // 2. drop shadows
  if (style.shadow2) {
    setShadow(ctx, style.shadow2);
    fill(face);
  }
  if (style.shadow) {
    setShadow(ctx, style.shadow);
    fill(style.outline ? style.outline.color : face);
  }
  setShadow(ctx, null);
  // 3. 3-D extrusion
  if (style.extrude) {
    const extrude = style.extrude;
    const layer = (depth: number, stroke: boolean) =>
      eachGlyph(ctx, text, start, tracking, (glyph, x) =>
        stroke
          ? ctx.strokeText(glyph, x + extrude.dx * depth, extrude.dy * depth)
          : ctx.fillText(glyph, x + extrude.dx * depth, extrude.dy * depth),
      );
    ctx.fillStyle = extrude.color;
    for (let depth = extrude.depth; depth >= 1; depth -= 1) layer(depth, false);
    if (style.outline) {
      ctx.strokeStyle = style.outline.color;
      ctx.lineWidth = style.outline.width * 2;
      for (let depth = extrude.depth; depth >= 1; depth -= 1) layer(depth, true);
      ctx.fillStyle = extrude.color;
      for (let depth = extrude.depth; depth >= 1; depth -= 1) layer(depth, false);
    }
  }
  // 4. outline + face
  if (style.outline) {
    ctx.strokeStyle = style.outline.color;
    ctx.lineWidth = style.outline.width * 2;
    eachGlyph(ctx, text, start, tracking, (glyph, x) =>
      ctx.strokeText(glyph, x, 0),
    );
  }
  fill(face);
  ctx.restore();
}

/** Paints plate + every field in plate coordinates onto a prepared context. */
export function paintCert(
  ctx: SKRSContext2D,
  spec: CertSpec,
  plate: Image,
  fields: CertFields,
  options: CertPaintOptions = {},
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(plate, 0, 0, spec.width, spec.height);
  for (const key of Object.keys(spec.layout)) {
    const value = key in fields ? (fields[key] ?? "") : spec.defaults[key] ?? "";
    drawRun(ctx, spec.layout[key], value, options.blurKeys?.includes(key) === true);
  }
}


export async function renderCert(spec:CertSpec,fields:CertFields,options:CertPaintOptions={}) {
 for(const font of spec.fonts){if(!loaded.has(font.url)){if(!GlobalFonts.registerFromPath(asset(font.url),font.family))throw new Error('font_unavailable');loaded.add(font.url);}}
 let plate=plates.get(spec.plate);if(!plate){plate=loadImage(asset(spec.plate));plates.set(spec.plate,plate);plate.catch(()=>plates.delete(spec.plate));}
 const canvas=createCanvas(spec.width,spec.height);
 if(spec.id==='win'){const ctx=canvas.getContext('2d');ctx.drawImage(await plate,0,0,spec.width,spec.height);paintWinning(ctx,Object.fromEntries(Object.keys(spec.layout).map(k=>[k,fields[k]??spec.defaults[k]??''])));}else paintCert(canvas.getContext('2d'),spec,await plate,fields,options);
 return canvas.encode('png');
}
