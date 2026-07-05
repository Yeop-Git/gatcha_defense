import * as THREE from 'three';
import type { Element, ElementOrNeutral } from '../core/types';
import { ELEMENT_COLOR, NEUTRAL_COLOR, ELEMENT_ICON, CREATURE_DISPLAY_SCALE, CASTLE_MODEL_HEIGHT } from '../data/constants';
import { attachModel, modelFile, addOutline } from './ModelLoader';

/**
 * 폴백 우선 원칙: GLB 모델이 없으면 속성 색 캡슐 + 머리 위 속성 아이콘.
 * 에셋 없이 완전 플레이 가능해야 함. (CLAUDE.md 원칙 4)
 * TODO(asset: mon_{element}_{stage}.glb) — 모델 준비되면 loadGLB로 교체.
 */

function elementColor(el: ElementOrNeutral): number {
  return el === 'neutral' ? NEUTRAL_COLOR : ELEMENT_COLOR[el];
}

/** 카툰 셰이딩용 unlit 머티리얼 (GLB 변환과 동일한 flat 룩). */
function toonMat(color: number, opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color });
  if (opts.transparent !== undefined) m.transparent = opts.transparent;
  if (opts.opacity !== undefined) m.opacity = opts.opacity;
  return m;
}

/**
 * lit(입체) 셰이딩 머티리얼 — 씬의 키/필 디렉셔널 + 앰비언트 조명에 반응해
 * 면마다 명암이 생긴다. 성채 전용(카툰 flat 룩 탈피). 그림자맵은 씬에서 꺼져 있어
 * 드리운 그림자는 없지만 형태 음영은 나온다.
 */
function litMat(color: number, opts: { roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
}

/**
 * 크리처 뷰(makeCreature/makeEnemy/makeBase 기반) 자원 해제.
 * - 아웃라인 메시(userData.outline): 공유 싱글턴 머티리얼 + 부모 지오메트리 공유 → 절대 dispose 금지.
 * - 폴백 메시(userData.placeholder): 개체 고유 지오메트리/머티리얼 → dispose.
 * - 그 외(클론된 GLB 메시): 캐시와 지오메트리/머티리얼 공유 → dispose 금지(다음 클론이 깨짐).
 * - 스프라이트(이름표/표식/아이콘): 개체 고유 캔버스 텍스처 → map+material dispose.
 */
export function disposeCreatureView(view: THREE.Object3D): void {
  view.traverse((o) => {
    if (o.userData.outline) return;
    if (o instanceof THREE.Mesh) {
      if (o.userData.placeholder) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      } else {
        // 팔레트 스왑으로 복제된 틴트 머티리얼은 개체 고유 → 해제 (GLB 캐시 공유분은 유지)
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m?.userData?.tinted) m.dispose();
      }
    } else if (o instanceof THREE.Sprite) {
      const sm = o.material as THREE.SpriteMaterial;
      sm.map?.dispose();
      sm.dispose();
    }
  });
}

/** 텍스트/이모지 스프라이트 (아이콘·표식·중첩수) */
export function makeTextSprite(text: string, size = 0.9, bg?: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = '84px "Jua", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 72);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size, size, size);
  return sp;
}

/**
 * 이름표/텍스트 라벨 스프라이트 — 여러 글자(한글 이름/Lv)도 안 깨지게 폭을 텍스트에 맞춰 생성.
 * (makeTextSprite는 128²에 84px 단일 이모지 전용이라 다글자 텍스트가 잘림.)
 */
export function makeLabelSprite(text: string, opts: { color?: string; worldHeight?: number } = {}): THREE.Sprite {
  const font = 46;
  const pad = 12;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${font}px 'Jua', sans-serif`;
  const w = Math.max(32, Math.ceil(ctx.measureText(text).width) + pad * 2);
  const h = font + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = `bold ${font}px 'Jua', sans-serif`; // 캔버스 리사이즈로 상태 초기화됨 → 재설정
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(text, w / 2, h / 2 + 2);
  ctx.fillStyle = opts.color ?? '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const hgt = opts.worldHeight ?? 0.5;
  sp.scale.set(hgt * (w / h), hgt, 1);
  return sp;
}

/** HP 등 상태 바 스프라이트 (금테). set(frac)로 갱신. */
export function makeBarSprite(worldWidth = 3, color = '#e05a4a'): { sprite: THREE.Sprite; set: (frac: number) => void } {
  const W = 100, H = 16;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(worldWidth, worldWidth * (H / W), 1);
  let last = -1;
  const set = (frac: number): void => {
    const q = Math.round(Math.max(0, Math.min(1, frac)) * 100);
    if (q === last) return; // 값이 바뀔 때만 캔버스 재렌더 (매 프레임 재업로드 방지)
    last = q;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(20,14,8,0.72)';
    ctx.fillRect(0, 0, W, H);
    const f = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = f > 0.5 ? color : f > 0.25 ? '#d8a93b' : '#c0392b';
    ctx.fillRect(3, 3, (W - 6) * f, H - 6);
    ctx.strokeStyle = '#d8a93b';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    tex.needsUpdate = true;
  };
  set(1);
  return { sprite: sp, set };
}

/**
 * 유닛/야생 몬스터 폴백 캡슐 (속성색 + 아이콘). height로 진화 크기 표현.
 * tint = 팔레트 스왑 색(분기 진화·타락체). 폴백 캡슐은 틴트색 자체를, GLB는 색 곱을 적용.
 */
export function makeCreature(el: Element, scale = 1, stage = 1, tint?: number, play = false): THREE.Group {
  const g = new THREE.Group();
  scale *= CREATURE_DISPLAY_SCALE[el] ?? 1; // 속성별 표시 배율(물 축소 등)
  const color = tint ?? elementColor(el);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55 * scale, 0.5 * scale, 6, 12),
    toonMat(color),
  );
  body.position.y = 0.75 * scale;
  body.userData.placeholder = true;
  addOutline(body);
  g.add(body);
  g.userData.body = body; // 바운스 연출용 (Enemy가 야생 렌더에 재사용)
  // 볼터치/눈 느낌의 흰 점 두 개
  for (const sx of [-0.22, 0.22]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.09 * scale, 8, 8),
      toonMat(0x2b2b2b),
    );
    eye.position.set(sx * scale, 0.9 * scale, 0.48 * scale);
    eye.userData.placeholder = true;
    g.add(eye);
  }
  const icon = makeTextSprite(ELEMENT_ICON[el], 0.7 * scale);
  icon.position.y = 1.7 * scale;
  icon.userData.placeholder = true;
  g.add(icon);
  g.userData.baseY = 0;
  // 아군 유닛은 제자리 대기(Idle 우선, 재생 안 함). 야생 크리처 적(play)은 걷기 재생.
  const prefs = play ? [/walk/i, /run/i, /move/i, /idle/i] : [/idle/i, /walk/i];
  attachModel(g, modelFile.creature(el, stage), 1.85 * scale, tint, prefs, play);
  return g;
}

/**
 * 적 모델 뷰. animMode로 클립 우선순위 분기:
 *  - 'walk'(기본): 필드 적 — 경로 이동이라 걷기/뛰기/비행 우선.
 *  - 'idle': 내가 포획해 쓰는 아군 유닛 — 제자리 대기라 대기/부유 우선(걷기 재생 안 함).
 */
export function makeEnemy(el: ElementOrNeutral, radius: number, flying?: boolean, model?: string, animMode: 'walk' | 'idle' = 'walk', modelHeight?: number): THREE.Group {
  const g = new THREE.Group();
  const color = elementColor(el);
  // 폴백 도형은 정규화 높이에 맞춰 크기 (모델 로드 전 잠깐 보임). 없으면 radius 기준.
  const geoR = modelHeight !== undefined ? modelHeight / 2.5 : radius;
  const geo = flying
    ? new THREE.OctahedronGeometry(geoR, 0)
    : new THREE.DodecahedronGeometry(geoR, 0);
  const body = new THREE.Mesh(geo, toonMat(color));
  body.position.y = flying ? geoR + 1.2 : geoR;
  body.userData.placeholder = true;
  addOutline(body);
  g.add(body);
  g.userData.body = body;
  if (model) {
    const prefs = animMode === 'idle'
      ? [/flying_idle/i, /idle/i, /float/i, /breath/i] // 아군: 대기/부유 우선 (걷기 회피)
      : [/walk/i, /run/i, /fly/i, /move/i, /idle/i];    // 적: 이동 클립 우선
    // 정규화: 모든 모델을 지정 높이로 스케일 (티어/진화별 일관 크기)
    attachModel(g, modelFile.enemy(model), modelHeight ?? radius * 2.5, undefined, prefs, true);
  }
  return g;
}

/** 지키는 성(거점) — lit(입체) 셰이딩 로우폴리 성채(주인공 통합). 위에 HP 바가 떠 있음. */
export function makeBase(): THREE.Group {
  const g = new THREE.Group();
  const STONE = 0x9a8f7a, STONE_D = 0x7a6f5c, ROOF = 0xc0392b, GOLD = 0xd8a93b;
  // 카툰 flat 룩 탈피: lit 머티리얼 + 검은 외곽선 제거로 면마다 명암이 살아난다.
  const addPart = (mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
    mesh.position.set(x, y, z);
    mesh.userData.placeholder = true;
    g.add(mesh);
    return mesh;
  };
  // 잔디 위 성터(원형 받침)
  addPart(new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.2, 0.5, 16), litMat(STONE_D, { roughness: 0.95 })), 0, 0.25, 0);
  // 성벽(사각 본체)
  addPart(new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.8, 3.6), litMat(STONE)), 0, 1.4, 0);
  // 중앙 첨탑(본성)
  addPart(new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, 1.9), litMat(STONE)), 0, 3.2, 0);
  addPart(new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 4), litMat(ROOF, { roughness: 0.7 })), 0, 5.1, 0).rotation.y = Math.PI / 4;
  // 네 모서리 탑
  for (const [sx, sz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) {
    addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 2.8, 8), litMat(STONE)), sx, 1.9, sz);
    addPart(new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 8), litMat(ROOF, { roughness: 0.7 })), sx, 3.7, sz);
  }
  // 성벽 흉벽(크레넬레이션)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    addPart(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), litMat(STONE_D, { roughness: 0.95 })), Math.cos(a) * 1.7, 2.45, Math.sin(a) * 1.7);
  }
  // 수호 코어(발광 크리스털) — 본성 위. emissive로 자체 발광(조명과 무관하게 빛남).
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55, 0),
    litMat(0x6fd0e8, { roughness: 0.25, emissive: 0x6fd0e8, emissiveIntensity: 0.6 }),
  );
  crystal.position.y = 6.4;
  crystal.userData.placeholder = true;
  g.add(crystal);
  g.userData.crystal = crystal;
  // 금색 깃대 (금속 질감)
  addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), litMat(GOLD, { metalness: 0.7, roughness: 0.35 })), 0, 6.0, 0);
  // 성 HP는 상단 HUD 🏰 게이지로 표시(#hud-actions와 겹침 방지 — 성 위 3D 바 제거).
  // 대신 수호 코어(crystal)를 HP 피드백에 사용: setBaseHp에서 낮을수록 붉게 물든다.
  // ▶ 예비: public/assets/models/castle.glb 를 넣으면 폴백 성채(위 placeholder 전부)를
  //   자동 대체한다. 파일 없으면 조용히 폴백 유지. 크리스털 HP 틴트는 모델 교체 시
  //   사라지지만 HP는 상단 HUD 🏰 게이지가 계속 표시한다. 애니(깃발 흔들림 등)가 있으면 재생.
  attachModel(g, modelFile.castle(), CASTLE_MODEL_HEIGHT, undefined, [/idle/i, /wave/i, /flag/i]);
  return g;
}
