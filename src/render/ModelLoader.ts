import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  MODEL_MAX_TEXTURE,
  MODEL_UNLIT,
  MODEL_OUTLINE,
  MODEL_OUTLINE_THICKNESS,
} from '../data/constants';
import type { Element, ElementOrNeutral } from '../core/types';

/**
 * GLB 임포트 + 텍스처 자동 다운스케일 인프라.
 * 원칙: 모델이 없어도 완전 플레이(폴백 캡슐). 모델을 넣으면 자동 적용.
 *
 * ▼ 사용법: /public/assets/models/ 에 아래 네이밍대로 GLB를 **넣기만 하면** 자동 로드됩니다.
 *   (화이트리스트 불필요 — 파일이 없으면 조용히 폴백 유지, 파일당 최초 1회만 요청.)
 *   텍스처는 로드시 자동으로 최대 1024px(=MODEL_MAX_TEXTURE)로 축소되어 용량을 줄입니다.
 *
 *   준비된 파일: creatures/mon_{element}_{1,2,3}.glb (15종, 있음)
 *   ▶ 넣어주면 자동 적용될 파일 (예비): creatures/hero.glb,
 *     enemies/enemy_slime.gltf / enemy_imp.gltf / enemy_shellguard.gltf /
 *     enemy_bat.gltf / enemy_spirit.gltf / enemy_golem.gltf,
 *     enemies/boss_final.gltf (키메라)
 *   모두 unlit + 검은 외곽선(카툰 셰이딩)으로 자동 변환됩니다.
 */

const BASE = `${import.meta.env.BASE_URL}assets/models/`;
const loader = new GLTFLoader();
interface LoadedModel { scene: THREE.Group; animations: THREE.AnimationClip[] }
const cache = new Map<string, Promise<LoadedModel>>();

/**
 * 네이밍 규칙 (ASSETS.md §0)
 *   creatures/ = 플레이어블 캐릭터 (glb)
 *   enemies/   = 적 (gltf; 분리형이면 적별 하위폴더 안에 .bin/텍스처 동반)
 */
export const modelFile = {
  creature: (el: Element, stage: number) => `creatures/mon_${el}_${stage}.glb`,
  hero: () => `creatures/hero.glb`,
  /** file = enemies/ 안의 GLTF 파일명 (EnemyDef.model). 예: 'GreenBlob.gltf' */
  enemy: (file: string) => `enemies/${file}`,
};

/** 텍스처를 max 이하로 캔버스 리샘플 (용량/GPU 메모리 절감) */
function downscaleTexture(tex: THREE.Texture | null, max: number): void {
  if (!tex || !tex.image) return;
  const img = tex.image as { width?: number; height?: number };
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  if (!w || !h || Math.max(w, h) <= max) return;
  const scale = max / Math.max(w, h);
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(tex.image as CanvasImageSource, 0, 0, nw, nh);
  tex.image = canvas;
  tex.needsUpdate = true;
}

/** 머티리얼의 모든 텍스처 슬롯 다운스케일 */
function processMaterial(mat: THREE.Material, max: number): void {
  const m = mat as THREE.MeshStandardMaterial;
  downscaleTexture(m.map ?? null, max);
  downscaleTexture(m.normalMap ?? null, max);
  downscaleTexture(m.roughnessMap ?? null, max);
  downscaleTexture(m.metalnessMap ?? null, max);
  downscaleTexture(m.emissiveMap ?? null, max);
  downscaleTexture(m.aoMap ?? null, max);
}

/** PBR 머티리얼 → unlit(MeshBasic). 베이스컬러 맵/색/투명만 보존 (카툰 룩). */
function toUnlit(mat: THREE.Material): THREE.Material {
  const m = mat as THREE.MeshStandardMaterial;
  const basic = new THREE.MeshBasicMaterial({
    map: m.map ?? null,
    color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
    transparent: m.transparent,
    opacity: m.opacity,
    alphaMap: m.alphaMap ?? null,
    alphaTest: m.alphaTest,
    vertexColors: m.vertexColors,
    side: m.side,
  });
  basic.name = m.name;
  return basic;
}

/**
 * 검은 외곽선 (inverted hull): 같은 지오메트리를 BackSide로 렌더하며
 * 뷰 공간에서 법선 방향으로 두께만큼 밀어낸다. 모델 스케일과 무관하게 두께 일정.
 */
const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: MODEL_OUTLINE_THICKNESS } },
  vertexShader: `
    uniform float thickness;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      mv.xyz += n * thickness;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`,
  side: THREE.BackSide,
});

/** 검은 외곽선(inverted hull)을 mesh에 부착. 폴백 도형(속성 캡슐 등)에도 재사용. */
export function addOutline(mesh: THREE.Mesh): void {
  if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
  const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.userData.outline = true;
  mesh.add(outline); // 부모(mesh) 트랜스폼 상속 → 정규화 스케일도 함께 적용
}

async function loadRaw(file: string): Promise<LoadedModel> {
  let p = cache.get(file);
  if (!p) {
    p = loader.loadAsync(BASE + file).then((gltf) => {
      const meshes: THREE.Mesh[] = [];
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes.push(o);
      });
      const animated = gltf.animations.length > 0;
      for (const o of meshes) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // 스킨드 메시가 애니메이션 중 잘못 컬링되는 문제 방지
        if (MODEL_UNLIT) {
          o.material = Array.isArray(o.material)
            ? o.material.map(toUnlit)
            : toUnlit(o.material);
        }
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mm) => processMaterial(mm, MODEL_MAX_TEXTURE));
        // 스킨드(리깅) 메시의 인버티드 헐 아웃라인은 본을 따라가지 못한다 → 애니메이션 모델은 아웃라인 생략
        if (MODEL_OUTLINE && !(animated && o instanceof THREE.SkinnedMesh)) addOutline(o);
      }
      return { scene: gltf.scene, animations: gltf.animations };
    });
    cache.set(file, p);
  }
  const loaded = await p;
  // SkeletonUtils.clone: 스킨드 메시의 본 바인딩까지 올바르게 복제 (Object3D.clone은 깨짐)
  return { scene: skeletonClone(loaded.scene) as THREE.Group, animations: loaded.animations };
}

/** 목표 높이에 맞춰 정규화 (발바닥 y=0) */
function normalize(model: THREE.Group, targetHeight: number): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const h = size.y || 1;
  const s = targetHeight / h;
  model.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(model);
  model.position.y -= box2.min.y; // 발바닥을 y=0으로
}

/**
 * 팔레트 스왑 (§5.6·§9): 클론된 모델의 머티리얼을 복제한 뒤 base color에 틴트를 곱한다.
 * 캐시 원본과 다른 클론은 머티리얼을 공유하므로 반드시 복제 후 수정 — 다른 개체에 번지지 않게.
 * 이미 틴트된 머티리얼(재틴트: 보스 P2 등)은 제자리에서 색만 곱한다(중복 클론 누수 방지).
 * 복제본은 userData.tinted 표시 → disposeCreatureView가 해제한다.
 */
export function tintModel(root: THREE.Object3D, tint: number): void {
  const c = new THREE.Color(tint);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.outline) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const tinted = mats.map((m) => {
      if (m.userData.tinted) { // 재틴트: 제자리 곱
        const bm = m as THREE.MeshBasicMaterial;
        if (bm.color) bm.color.multiply(c);
        return m;
      }
      const nm = m.clone() as THREE.MeshBasicMaterial;
      nm.userData.tinted = true;
      if (nm.color) nm.color.multiply(c);
      return nm;
    });
    o.material = Array.isArray(o.material) ? tinted : tinted[0];
  });
}

/** 선호 애니메이션 클립 선택: 이름 우선순위 → 첫 클립 폴백. */
function pickClip(clips: THREE.AnimationClip[], prefs: RegExp[]): THREE.AnimationClip | null {
  for (const re of prefs) {
    const hit = clips.find((c) => re.test(c.name));
    if (hit) return hit;
  }
  return clips[0] ?? null;
}

/**
 * group에 GLB 모델을 비동기로 붙인다. 성공 시 폴백(placeholder) 메시를 제거.
 * 파일이 없거나 로드 실패하면 조용히 폴백 유지(파일당 최초 1회만 요청 — 캐시).
 * tint가 있으면 팔레트 스왑(분기 진화/타락체) — 머티리얼 복제 후 색 오버라이드.
 * 애니메이션 클립이 있으면 AnimationMixer를 group.userData.mixer에 부착 —
 * 소유 엔티티(Enemy/Monster/뷰어)가 매 프레임 mixer.update(dt)를 호출한다.
 */
export function attachModel(group: THREE.Group, file: string, targetHeight: number, tint?: number, animPrefs?: RegExp[]): void {
  loadRaw(file)
    .then(({ scene: model, animations }) => {
      normalize(model, targetHeight);
      if (tint !== undefined) tintModel(model, tint);
      // 폴백 placeholder 제거
      for (const child of [...group.children]) {
        if (child.userData.placeholder) group.remove(child);
      }
      group.add(model);
      // 내장 애니메이션 재생 (걷기/대기 등)
      if (animations.length) {
        const clip = pickClip(animations, animPrefs ?? [/walk/i, /run/i, /move/i, /idle/i]);
        if (clip) {
          const mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(clip).play();
          group.userData.mixer = mixer;
        }
      }
    })
    .catch(() => {
      /* 파일 없음/로드 실패 → 폴백 캡슐 유지 (조용히 무시) */
    });
}

export function elementForModel(el: ElementOrNeutral): Element | null {
  return el === 'neutral' ? null : el;
}
