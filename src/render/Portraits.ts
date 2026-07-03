import {
  PORTRAIT_SIZE,
  PORTRAIT_PADDING,
  PORTRAIT_KEY_LOW,
  PORTRAIT_KEY_HIGH,
} from '../data/constants';
import type { Element } from '../core/types';

/**
 * 몬스터 포트레이트(PNG) 정규화 로더.
 * 원본이 제각각 크기/여백/배경이어도 런타임에 자동 처리 → 일관된 썸네일 dataURL.
 *  1) 단색 스튜디오 배경(흰색·회색·크림 등)이면 코너에서 배경색을 샘플링해
 *     가장자리 flood-fill 로 그 색만 투명 처리(누끼). 캐릭터 내부 밝은 색은 보존.
 *  2) 남은 내용의 바운딩박스로 크롭 → 고정 정사각형(PORTRAIT_SIZE)에 중앙 정렬.
 *
 * ▼ 사용법: /public/assets/portraits/ 에 PNG를 넣으면 됩니다.
 *   파일명 규칙: mon_{element}_{stage}.png  예: mon_fire_1.png, mon_water_3.png
 *   등록 불필요 — 파일이 있으면 자동 사용, 없으면 UI가 이모지 폴백.
 */

const BASE = `${import.meta.env.BASE_URL}assets/portraits/`;
const cache = new Map<string, Promise<string | null>>();

export const portraitFile = (el: Element, stage: number) => `mon_${el}_${stage}.png`;

type RGB = [number, number, number];

/** 두 색의 유클리드 거리 (0~441). */
function colorDist(r: number, g: number, b: number, c: RGB): number {
  const dr = c[0] - r, dg = c[1] - g, db = c[2] - b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * 네 코너 픽셀에서 배경색을 추정. 코너들이 서로 비슷하고(단색), 밝고(스튜디오 배경),
 * 불투명일 때만 누끼 대상으로 판단해 그 배경색을 반환. 아니면 null(누끼 생략).
 * 흰색 고정이 아니라 실제 배경색을 잡으므로 옅은 회색(240)·크림 배경도 처리됨.
 */
function sampleBackground(d: Uint8ClampedArray, w: number, h: number): RGB | null {
  const at = (x: number, y: number): RGB & { a: number } => {
    const i = (y * w + x) * 4;
    const c = [d[i], d[i + 1], d[i + 2]] as RGB & { a: number };
    c.a = d[i + 3];
    return c;
  };
  // 불투명 코너에서만 배경색 추정. (일부 코너가 이미 투명한 반가공 소스도 지원)
  const opaque = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)].filter((c) => c.a >= 250);
  if (opaque.length === 0) return null; // 코너 전부 투명 → 이미 배경 제거됨
  const avg: RGB = [0, 0, 0];
  for (const c of opaque) { avg[0] += c[0]; avg[1] += c[1]; avg[2] += c[2]; }
  avg[0] /= opaque.length; avg[1] /= opaque.length; avg[2] /= opaque.length;
  // 불투명 코너들이 서로 일관되고(단색 배경) 충분히 밝아야(어두운 풀블리드 아트 오검출 방지) 함.
  const spread = Math.max(...opaque.map((c) => colorDist(c[0], c[1], c[2], avg)));
  const brightness = Math.min(avg[0], avg[1], avg[2]);
  if (spread > 20 || brightness < 180) return null;
  return avg;
}

/**
 * 불투명 테두리 픽셀 중 상당수가 배경색(±LOW)과 일치해야 실제 단색 배경으로 확정.
 * (이미 투명한 픽셀은 배경으로 간주해 분모에서 제외 → 반가공 소스도 통과)
 */
function borderMatchesBackground(d: Uint8ClampedArray, w: number, h: number, bg: RGB): boolean {
  let match = 0, opaque = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  const test = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (d[i + 3] <= 200) return; // 이미 투명 → 배경 취급, 분모 제외
    opaque++;
    if (colorDist(d[i], d[i + 1], d[i + 2], bg) < PORTRAIT_KEY_LOW) match++;
  };
  for (let x = 0; x < w; x += step) { test(x, 0); test(x, h - 1); }
  for (let y = 0; y < h; y += step) { test(0, y); test(w - 1, y); }
  return opaque > 0 && match / opaque > 0.6;
}

/**
 * 가장자리에서 배경색과 연결된 영역을 flood-fill 로 투명 처리.
 * 경계(LOW~HIGH)는 알파 페더 + 배경색 언프리멀티플로 배경 테두리 띠를 제거.
 */
function keyOutBackground(d: Uint8ClampedArray, w: number, h: number, bg: RGB): void {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (!seen[p]) { seen[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  const span = PORTRAIT_KEY_HIGH - PORTRAIT_KEY_LOW;
  while (stack.length) {
    const p = stack.pop()!;
    const i = p * 4;
    const dist = colorDist(d[i], d[i + 1], d[i + 2], bg);
    if (dist >= PORTRAIT_KEY_HIGH) continue; // 캐릭터 경계 → 제거/전파 중단
    if (dist <= PORTRAIT_KEY_LOW) {
      d[i + 3] = 0; // 순수 배경 → 완전 투명
    } else {
      // 경계 페더: 알파 부분 적용 + 배경색 성분 언프리멀티플(테두리 띠 제거)
      const a = (dist - PORTRAIT_KEY_LOW) / span; // 0~1
      d[i + 3] = Math.round(d[i + 3] * a);
      const inv = 1 - a;
      d[i] = Math.min(255, Math.max(0, (d[i] - bg[0] * inv) / Math.max(a, 0.001)));
      d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - bg[1] * inv) / Math.max(a, 0.001)));
      d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - bg[2] * inv) / Math.max(a, 0.001)));
    }
    const x = p % w, y = (p - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
}

/** 알파>16 픽셀의 바운딩박스. 없으면 전체. */
function alphaBounds(d: Uint8ClampedArray, w: number, h: number) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function normalize(img: HTMLImageElement): string {
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const src = document.createElement('canvas');
  src.width = nw; src.height = nh;
  const sctx = src.getContext('2d')!;
  sctx.drawImage(img, 0, 0);

  let box: { x: number; y: number; w: number; h: number };
  try {
    const id = sctx.getImageData(0, 0, nw, nh);
    const bg = sampleBackground(id.data, nw, nh);
    if (bg && borderMatchesBackground(id.data, nw, nh, bg)) {
      keyOutBackground(id.data, nw, nh, bg); // 샘플링한 배경색 누끼
      sctx.putImageData(id, 0, 0);
    }
    box = alphaBounds(id.data, nw, nh);
  } catch {
    box = { x: 0, y: 0, w: nw, h: nh }; // 크로스오리진 등 → 처리 생략
  }

  const S = PORTRAIT_SIZE;
  const inner = S * (1 - PORTRAIT_PADDING * 2);
  const scale = inner / Math.max(box.w, box.h);
  const dw = box.w * scale, dh = box.h * scale;

  const out = document.createElement('canvas');
  out.width = S; out.height = S;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, box.x, box.y, box.w, box.h, (S - dw) / 2, (S - dh) / 2, dw, dh);
  return out.toDataURL('image/png');
}

/** 정규화된 포트레이트 dataURL. 파일 없으면 null (이모지 폴백). 결과 캐시. */
export function getPortrait(el: Element, stage: number): Promise<string | null> {
  const file = portraitFile(el, stage);
  let p = cache.get(file);
  if (!p) {
    p = new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => { try { resolve(normalize(img)); } catch { resolve(null); } };
      img.onerror = () => resolve(null);
      img.src = BASE + file;
    });
    cache.set(file, p);
  }
  return p;
}
