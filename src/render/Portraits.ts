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
 *  1) 흰 배경이면 가장자리 flood-fill 로 배경만 투명 처리(누끼). 캐릭터 내부 흰색은 보존.
 *  2) 남은 내용의 바운딩박스로 크롭 → 고정 정사각형(PORTRAIT_SIZE)에 중앙 정렬.
 *
 * ▼ 사용법: /public/assets/portraits/ 에 PNG를 넣으면 됩니다.
 *   파일명 규칙: mon_{element}_{stage}.png  예: mon_fire_1.png, mon_water_3.png
 *   등록 불필요 — 파일이 있으면 자동 사용, 없으면 UI가 이모지 폴백.
 */

const BASE = `${import.meta.env.BASE_URL}assets/portraits/`;
const cache = new Map<string, Promise<string | null>>();

export const portraitFile = (el: Element, stage: number) => `mon_${el}_${stage}.png`;

/** 흰색(255,255,255)과의 유클리드 색거리 (0~441). */
function whiteDist(r: number, g: number, b: number): number {
  const dr = 255 - r, dg = 255 - g, db = 255 - b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** 테두리가 대부분 불투명 흰색이면 "흰 배경 이미지"로 판단 → 누끼 대상. */
function hasWhiteBackground(d: Uint8ClampedArray, w: number, h: number): boolean {
  let white = 0, total = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  const test = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    total++;
    if (d[i + 3] > 200 && whiteDist(d[i], d[i + 1], d[i + 2]) < PORTRAIT_KEY_LOW) white++;
  };
  for (let x = 0; x < w; x += step) { test(x, 0); test(x, h - 1); }
  for (let y = 0; y < h; y += step) { test(0, y); test(w - 1, y); }
  return total > 0 && white / total > 0.6;
}

/**
 * 가장자리에서 흰색과 연결된 배경을 flood-fill 로 투명 처리.
 * 경계(LOW~HIGH)는 알파 페더 + 흰 테두리 언프리멀티플로 제거. 반환: 알파 수정 완료.
 */
function keyOutWhite(d: Uint8ClampedArray, w: number, h: number): void {
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
    const dist = whiteDist(d[i], d[i + 1], d[i + 2]);
    if (dist >= PORTRAIT_KEY_HIGH) continue; // 캐릭터 경계 → 제거/전파 중단
    if (dist <= PORTRAIT_KEY_LOW) {
      d[i + 3] = 0; // 순수 배경 → 완전 투명
    } else {
      // 경계 페더: 알파 부분 적용 + 흰색 성분 언프리멀티플(테두리 하얀 띠 제거)
      const a = (dist - PORTRAIT_KEY_LOW) / span; // 0~1
      d[i + 3] = Math.round(d[i + 3] * a);
      const inv = 1 - a;
      d[i] = Math.min(255, Math.max(0, (d[i] - 255 * inv) / Math.max(a, 0.001)));
      d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - 255 * inv) / Math.max(a, 0.001)));
      d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - 255 * inv) / Math.max(a, 0.001)));
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
    if (hasWhiteBackground(id.data, nw, nh)) {
      keyOutWhite(id.data, nw, nh); // 흰 배경 누끼
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
