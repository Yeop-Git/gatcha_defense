import * as THREE from 'three';
import { FIELD, UNIT_SLOTS, COLORS } from '../data/constants';
import type { Theme } from '../data/stages';
import type { Vec2 } from '../core/types';
import { makeBase, makeLabelSprite } from './fallback';
import { VFX } from './VFX';

const THEME_GROUND: Record<Theme, number> = {
  grassland: 0x6b8f47,
  forest: 0x3f6b3a,
  cave: 0x4a4453,
  volcano: 0x6b3b2e,
  temple: 0x8a7f66,
};

/** 테마별 하늘/배경색 — 지면 밖 여백을 테마 분위기로 물들여 몰입감. */
const THEME_BG: Record<Theme, number> = {
  grassland: 0x2a3a1e,
  forest: 0x1c2a1c,
  cave: 0x161320,
  volcano: 0x2a140e,
  temple: 0x2b241a,
};

/**
 * 스테이지별 고유 팔레트 — 같은 테마의 두 스테이지도 확실히 달라 보이게 10개 각각 다른 정체성.
 * ground=잔디/바닥 윗면, path=경로(흙) 색, bg=배경 하늘, density=장식 프롭 밀도.
 */
export interface StageVisual { ground: number; path: number; bg: number; density: number }
const STAGE_VISUAL: Record<number, StageVisual> = {
  1:  { ground: 0x78a84e, path: 0xc6a468, bg: 0x33421f, density: 8 },   // 초원 아침 — 밝고 상쾌
  2:  { ground: 0x9aad4c, path: 0xccaa5c, bg: 0x3e3c1c, density: 15 },  // 초원 들판 — 누런 풀·꽃 만발
  3:  { ground: 0x3f6b3a, path: 0x8a6b3e, bg: 0x1b2a1a, density: 12 },  // 숲 진입 — 짙은 초록
  4:  { ground: 0x336b54, path: 0x6d5836, bg: 0x132a20, density: 17 },  // 숲 심부 — 청록·빽빽한 나무
  5:  { ground: 0x514a5e, path: 0x5f5468, bg: 0x161320, density: 11 },  // 동굴 입구 — 보라 회암·크리스털
  6:  { ground: 0x6f8093, path: 0x9aabbb, bg: 0x131c26, density: 13 },  // 동굴 심부 설산 — 얼음 청회색
  7:  { ground: 0x7a3e2c, path: 0x9a4e30, bg: 0x2c140d, density: 9 },   // 화산 — 붉은 흙
  8:  { ground: 0x4c271f, path: 0x86311f, bg: 0x1f0c07, density: 14 },  // 화산 심부 — 숯빛·용암 균열
  9:  { ground: 0x8f8467, path: 0xbdac7a, bg: 0x2c251b, density: 10 },  // 신전 — 사암빛
  10: { ground: 0x554b3d, path: 0x7d6b49, bg: 0x171309, density: 15 },  // 신전 심층 — 어두운 흑요석
};

/** 색을 어둡게 (unlit 타일의 옆면 — 격자 구분용) */
function darken(hex: number, f: number): number {
  return new THREE.Color(hex).multiplyScalar(f).getHex();
}

/** 성 HP 코어 색 보간용 상수 (매 틱 재할당 방지 — setBaseHp는 60Hz 호출). */
const BASE_HP_HEALTHY = new THREE.Color(0x6fd0e8);
const BASE_HP_DANGER = new THREE.Color(0xc0392b);

/** 테마별 장식 프롭 (로우폴리 unlit). 잔디/비경로 셀에 흩뿌린다. */
function makeProp(theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const mat = (c: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: c });
  const r = Math.random();
  if (theme === 'forest') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.6, 6), mat(0x6b4a2b)); trunk.position.y = 0.3; g.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 7), mat(r < 0.5 ? 0x2f6b34 : 0x3c7a3e)); top.position.y = 1.05; g.add(top);
  } else if (theme === 'cave') {
    if (r < 0.5) { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), mat(0x9a86e0)); cr.position.y = 0.5; cr.scale.y = 1.7; g.add(cr); }
    else { const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), mat(0x6a6470)); rk.position.y = 0.32; g.add(rk); }
  } else if (theme === 'volcano') {
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.44, 0), mat(0x3a2420)); rk.position.y = 0.34; g.add(rk);
    if (r < 0.4) { const em = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), mat(0xe8632c)); em.position.set(0.22, 0.5, 0.1); g.add(em); }
  } else if (theme === 'temple') {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.3, 8), mat(0xbdb08c)); col.position.y = 0.65; g.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), mat(0xd8a93b)); cap.position.y = 1.4; g.add(cap);
  } else { // grassland
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), mat(r < 0.5 ? 0x5a8a3c : 0x6b9a44)); bush.position.y = 0.32; bush.scale.y = 0.8; g.add(bush);
    if (r < 0.3) { const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mat(0xe8a0c0)); flower.position.set(0.35, 0.2, 0.2); g.add(flower); }
  }
  return g;
}
const SIDE_SHADE = 0.62; // 타일 옆면 밝기 비율
/** BoxGeometry 6면 머티리얼 배열: 윗면(+Y)만 밝게, 나머지는 옆면색. */
function faceMats(top: THREE.Material, side: THREE.Material): THREE.Material[] {
  return [side, side, top, side, side, side]; // +x,-x,+y(top),-y,+z,-z
}

/** 탑뷰 고정 카메라 씬. Three.js 안에 UI를 그리지 않는다 (UI는 DOM). */
export class Scene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  /** 카메라 셰이크 (궁극기급 스킬 전용) — camBase 기준 감쇠 랜덤 오프셋. */
  private camBase = new THREE.Vector3();
  private shakeAmt = 0;
  vfx: VFX;

  /** 엔티티/장판/이펙트 컨테이너 */
  entities = new THREE.Group();
  zones = new THREE.Group();
  /** 맵 타일 + 배치 슬롯 + 장식 (스테이지별 재구성 대상) */
  private mapGroup = new THREE.Group();
  private theme: Theme = 'grassland';

  base: THREE.Group;
  private grassTopMat!: THREE.MeshBasicMaterial;
  private grassSideMat!: THREE.MeshBasicMaterial;
  private pathTopMat!: THREE.MeshBasicMaterial;
  private pathSideMat!: THREE.MeshBasicMaterial;
  private decorDensity = 12;
  private raycaster = new THREE.Raycaster();
  private slotMeshes: THREE.Mesh[] = [];
  private capRing!: THREE.Mesh;
  private capLabel!: THREE.Sprite;
  private capLabelText = '';
  private rangeRing!: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // 전면 unlit(카툰) 셰이딩 — 그림자 수신자가 없으므로 섀도우맵 비활성(불필요한 패스 제거).
    this.renderer.shadowMap.enabled = false;
    this.scene.background = new THREE.Color(0x241a12);

    // 캐릭터가 잘 보이도록 종전보다 가까운 앵글 (그리드가 화면을 더 채움)
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
    this.camera.position.set(2, 31.5, 23);
    this.camera.lookAt(2, 0, 1);
    this.camBase.copy(this.camera.position);

    // 라이팅: 따뜻한 키 + 앰비언트
    const key = new THREE.DirectionalLight(0xfff1d0, 1.1);
    key.position.set(-14, 30, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -30; key.shadow.camera.right = 30;
    key.shadow.camera.top = 30; key.shadow.camera.bottom = -30;
    key.shadow.camera.far = 90;
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.55));
    const fill = new THREE.DirectionalLight(0x88aaff, 0.3);
    fill.position.set(16, 20, -14);
    this.scene.add(fill);

    // 격자 큐브 맵 (unlit + 옆면 음영으로 격자 구분)
    this.grassTopMat = new THREE.MeshBasicMaterial({ color: THEME_GROUND.grassland });
    this.grassSideMat = new THREE.MeshBasicMaterial({ color: darken(THEME_GROUND.grassland, SIDE_SHADE) });
    // 경로(흙) 머티리얼 — 스테이지별 재색칠 대상 (인스턴스 공유, 재빌드 시 지오메트리만 교체).
    this.pathTopMat = new THREE.MeshBasicMaterial({ color: 0xb79662 });
    this.pathSideMat = new THREE.MeshBasicMaterial({ color: darken(0xb79662, SIDE_SHADE) });
    this.scene.add(this.mapGroup);
    this.buildGrid();
    this.buildSlots();
    this.buildCapturePreview();
    this.buildRangePreview();

    this.base = makeBase();
    const last = FIELD.path[FIELD.path.length - 1];
    this.base.position.set(last.x, 0, last.z);
    this.scene.add(this.base);

    this.scene.add(this.entities);
    this.scene.add(this.zones);
    this.vfx = new VFX(this.scene);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** 격자 정육면체 타일: 잔디 셀 + 경로(흙) 셀. 각진 블록 룩. */
  private buildGrid(): void {
    const t = FIELD.tile;
    const gap = 0.12; // 셀 사이 홈 → 격자선
    const size = t - gap;
    const cubeH = 0.9;
    const grassGeo = new THREE.BoxGeometry(size, cubeH, size);
    const pathGeo = new THREE.BoxGeometry(size, cubeH, size);
    const grassMats = faceMats(this.grassTopMat, this.grassSideMat);
    const dirtMats = faceMats(this.pathTopMat, this.pathSideMat);

    for (let col = 0; col < FIELD.cols; col++) {
      for (let row = 0; row < FIELD.rows; row++) {
        const isPath = FIELD.pathCellSet.has(`${col},${row}`);
        const c = FIELD.cellCenter(col, row);
        const mesh = new THREE.Mesh(isPath ? pathGeo : grassGeo, isPath ? dirtMats : grassMats);
        // 경로는 살짝 낮게(파인 길), 잔디는 윗면 y=0
        const topY = isPath ? -0.14 : 0;
        mesh.position.set(c.x, topY - cubeH / 2, c.z);
        this.mapGroup.add(mesh);
      }
    }
  }

  /** 스테이지 레이아웃 변경 시 맵 타일/슬롯 재구성 + 기지 위치 갱신. */
  rebuildMap(): void {
    for (const c of [...this.mapGroup.children]) {
      this.mapGroup.remove(c);
      c.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); // 지오메트리만 해제(머티리얼 공유/재사용)
    }
    this.slotMeshes = [];
    this.buildGrid();
    this.buildSlots();
    const last = FIELD.path[FIELD.path.length - 1];
    if (last) this.base.position.set(last.x, 0, last.z);
    this.buildDecor();
  }

  /** 비경로 셀에 테마 장식 흩뿌리기 (기지 주변 제외). */
  private buildDecor(): void {
    const cands: { x: number; z: number }[] = [];
    for (let col = 1; col < FIELD.cols - 1; col++) for (let row = 1; row < FIELD.rows - 1; row++) {
      if (FIELD.pathCellSet.has(`${col},${row}`)) continue;
      cands.push(FIELD.cellCenter(col, row));
    }
    const base = this.base.position;
    // 기지 주변 + 유닛 배치 슬롯 위에는 장식을 두지 않는다 (배치 자리를 장식이 가리지 않게).
    const usable = cands.filter((c) =>
      Math.hypot(c.x - base.x, c.z - base.z) > 3.6 &&
      !UNIT_SLOTS.some((s) => Math.hypot(c.x - s.x, c.z - s.z) < FIELD.tile * 0.8),
    );
    for (let i = usable.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [usable[i], usable[j]] = [usable[j], usable[i]]; }
    const count = Math.min(this.decorDensity, usable.length);
    for (let i = 0; i < count; i++) {
      const c = usable[i];
      const prop = makeProp(this.theme);
      prop.position.set(c.x + (Math.random() - 0.5) * 0.6, 0, c.z + (Math.random() - 0.5) * 0.6);
      prop.rotation.y = Math.random() * Math.PI * 2;
      prop.scale.multiplyScalar(0.8 + Math.random() * 0.5);
      this.mapGroup.add(prop);
    }
  }

  private buildSlots(): void {
    for (const s of UNIT_SLOTS) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.0, 4), // 사각 링 (격자 룩)
        new THREE.MeshBasicMaterial({ color: COLORS.gold, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ring.position.set(s.x, 0.06, s.z);
      this.mapGroup.add(ring);
      this.slotMeshes.push(ring);
    }
  }

  setSlotHighlight(index: number, on: boolean): void {
    const mat = this.slotMeshes[index]?.material as THREE.MeshBasicMaterial;
    if (mat) mat.opacity = on ? 0.95 : 0.5;
  }

  /** 포획 조준 미리보기 링 (드래그 중 착지 지점의 포획 판정 반경 표시). */
  private buildCapturePreview(): void {
    this.capRing = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.0, 40),
      new THREE.MeshBasicMaterial({ color: 0x54e0c8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.capRing.rotation.x = -Math.PI / 2;
    this.capRing.position.y = 0.12;
    this.capRing.renderOrder = 10;
    this.scene.add(this.capRing);
    this.capLabel = makeLabelSprite('', { worldHeight: 0.42 });
    this.capLabel.visible = false;
    this.capLabel.renderOrder = 11;
    this.scene.add(this.capLabel);
  }

  private static readonly CAP_COLOR = { catch: 0x5fe08a, bossWait: 0xf2b03b, none: 0xd23b3b } as const;
  /** 포획 조준 링 갱신: 지점·반경·상태(잡힘/보스대기/빗나감). */
  setCapturePreview(x: number, z: number, radius: number, status: 'catch' | 'bossWait' | 'none', label = ''): void {
    this.capRing.position.set(x, 0.12, z);
    this.capRing.scale.setScalar(Math.max(0.4, radius));
    const mat = this.capRing.material as THREE.MeshBasicMaterial;
    mat.color.setHex(Scene.CAP_COLOR[status]);
    mat.opacity = status === 'none' ? 0.4 : 0.75;
    const text = label || (status === 'catch' ? '포획 가능' : status === 'bossWait' ? '기절 필요' : '범위 밖');
    if (text !== this.capLabelText) {
      this.scene.remove(this.capLabel);
      (this.capLabel.material as THREE.SpriteMaterial).map?.dispose();
      this.capLabel.material.dispose();
      this.capLabel = makeLabelSprite(text, { worldHeight: 0.42 });
      this.capLabelText = text;
      this.capLabel.renderOrder = 11;
      this.scene.add(this.capLabel);
    }
    this.capLabel.position.set(x, 1.25, z);
    this.capLabel.visible = true;
  }
  hideCapturePreview(): void {
    (this.capRing.material as THREE.MeshBasicMaterial).opacity = 0;
    this.capLabel.visible = false;
  }

  private buildRangePreview(): void {
    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1.0, 80),
      new THREE.MeshBasicMaterial({ color: 0xf2ce6b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.14;
    this.rangeRing.renderOrder = 9;
    this.scene.add(this.rangeRing);
  }

  showRangePreview(x: number, z: number, radius: number): void {
    this.rangeRing.position.set(x, 0.14, z);
    this.rangeRing.scale.setScalar(Math.max(0.4, radius));
    (this.rangeRing.material as THREE.MeshBasicMaterial).opacity = 0.72;
  }

  hideRangePreview(): void {
    (this.rangeRing.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  /**
   * 스테이지별 시각 적용 — 테마(장식 종류) + 스테이지 고유 팔레트(잔디/경로/배경/밀도).
   * 같은 테마여도 스테이지마다 색과 장식 밀도가 달라 10개 각기 다른 정체성.
   */
  setStage(stageId: number, theme: Theme): void {
    this.theme = theme;
    const v = STAGE_VISUAL[stageId] ?? { ground: THEME_GROUND[theme], path: 0xb79662, bg: THEME_BG[theme], density: 12 };
    this.grassTopMat.color.setHex(v.ground);
    this.grassSideMat.color.setHex(darken(v.ground, SIDE_SHADE));
    this.pathTopMat.color.setHex(v.path);
    this.pathSideMat.color.setHex(darken(v.path, SIDE_SHADE));
    (this.scene.background as THREE.Color).setHex(v.bg);
    this.decorDensity = v.density;
  }

  /** 성 HP를 수호 코어(crystal) 색으로 표현 (0~1). 낮을수록 청록→붉게. */
  setBaseHp(frac: number): void {
    const crystal = this.base.userData.crystal as THREE.Mesh | undefined;
    const mat = crystal?.material as THREE.MeshBasicMaterial | undefined;
    if (!mat) return;
    const f = Math.max(0, Math.min(1, frac));
    // 청록(healthy) → 위험 시 루비(danger)로 보간. 상수 재사용(할당 없음).
    mat.color.copy(BASE_HP_DANGER).lerp(BASE_HP_HEALTHY, f);
  }

  /** 화면 좌표 → 지면(y=0) 월드 좌표 */
  groundPoint(clientX: number, clientY: number): Vec2 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, hit)) return { x: hit.x, z: hit.z };
    return null;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 카메라 셰이크 요청 (궁극기급 스킬에서만 호출). amount≈0.2~0.6 권장. */
  shake(amount: number): void {
    this.shakeAmt = Math.min(0.8, this.shakeAmt + amount);
  }

  render(): void {
    if (this.shakeAmt > 0.002) {
      const a = this.shakeAmt;
      this.camera.position.set(
        this.camBase.x + (Math.random() * 2 - 1) * a,
        this.camBase.y + (Math.random() * 2 - 1) * a * 0.5,
        this.camBase.z + (Math.random() * 2 - 1) * a,
      );
      this.shakeAmt *= 0.85;
    } else if (this.shakeAmt !== 0) {
      this.camera.position.copy(this.camBase);
      this.shakeAmt = 0;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
