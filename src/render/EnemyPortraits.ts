import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { ENEMY_HEIGHT } from '../data/constants';
import type { Element } from '../core/types';
import { makeEnemy, makeCreature, disposeCreatureView } from './fallback';

/**
 * 적(포획 몬스터) 포트레이트 생성기 — 적 GLTF에는 PNG 포트레이트가 없으므로,
 * 오프스크린 WebGL 렌더러로 모델을 1회 렌더해 정사각 썸네일(dataURL)로 캐시한다.
 * 크리처(mon_*)는 별도 PNG 포트레이트(Portraits.ts)를 쓰므로 여기선 적 전용.
 *
 * - 모델이 실제 로드되면 그 프레임을 캡처, 파일이 없으면 null(이모지/이니셜 폴백 유지).
 * - species당 1회만 렌더 후 캐시. 배경 투명(알파).
 */

const SIZE = 256;
const MAX_FRAMES = 120; // 모델 비동기 로드 대기 (약 2초)
const cache = new Map<string, Promise<string | null>>();
let renderer: THREE.WebGLRenderer | null = null;

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

/** 폴백(placeholder)이 아닌 실제 GLB 메시가 붙었는지 — 로드 완료 판정. */
function hasLoadedModel(group: THREE.Object3D): boolean {
  let found = false;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.placeholder && !o.userData.outline) found = true;
  });
  return found;
}

function renderPortrait(species: string): Promise<string | null> {
  return new Promise((resolve) => {
    const def = ENEMIES[species];
    if (!def) { resolve(null); return; }
    const r = getRenderer();
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(2, 4, 3);
    scene.add(dir);

    const H = ENEMY_HEIGHT[def.tier];
    const group = def.creatureStage
      ? makeCreature(def.element as Element, H / 1.85, def.creatureStage)
      : makeEnemy(def.element, def.radius, def.flying, def.model, 'idle', H);
    scene.add(group);

    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    cam.position.set(H * 0.35, H * 0.62, H * 1.75);
    cam.lookAt(0, H * 0.52, 0);

    let frames = 0;
    const done = (url: string | null): void => {
      scene.remove(group);
      disposeCreatureView(group);
      resolve(url);
    };
    const tick = (): void => {
      r.render(scene, cam);
      frames++;
      if (hasLoadedModel(group)) {
        r.render(scene, cam); // 로드 직후 1프레임 더 (포즈 안정)
        done(r.domElement.toDataURL('image/png'));
        return;
      }
      if (frames >= MAX_FRAMES) { done(null); return; } // 모델 없음 → 이모지 폴백 유지
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** 적 species의 정규화 포트레이트 dataURL. 모델 없으면 null. 결과 캐시. */
export function getEnemyPortrait(species: string): Promise<string | null> {
  let p = cache.get(species);
  if (!p) { p = renderPortrait(species); cache.set(species, p); }
  return p;
}
