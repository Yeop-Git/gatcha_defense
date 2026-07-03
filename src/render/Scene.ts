import * as THREE from 'three';
import { FIELD, UNIT_SLOTS, COLORS } from '../data/constants';
import type { Theme } from '../data/stages';
import type { Vec2 } from '../core/types';
import { makeBase } from './fallback';
import { VFX } from './VFX';

const THEME_GROUND: Record<Theme, number> = {
  grassland: 0x6b8f47,
  forest: 0x3f6b3a,
  cave: 0x4a4453,
  volcano: 0x6b3b2e,
  temple: 0x8a7f66,
};

/** 색을 어둡게 (unlit 타일의 옆면 — 격자 구분용) */
function darken(hex: number, f: number): number {
  return new THREE.Color(hex).multiplyScalar(f).getHex();
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
  vfx: VFX;

  /** 엔티티/장판/이펙트 컨테이너 */
  entities = new THREE.Group();
  zones = new THREE.Group();

  base: THREE.Group;
  private grassTopMat!: THREE.MeshBasicMaterial;
  private grassSideMat!: THREE.MeshBasicMaterial;
  private raycaster = new THREE.Raycaster();
  private slotMeshes: THREE.Mesh[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // 전면 unlit(카툰) 셰이딩 — 그림자 수신자가 없으므로 섀도우맵 비활성(불필요한 패스 제거).
    this.renderer.shadowMap.enabled = false;
    this.scene.background = new THREE.Color(0x241a12);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
    this.camera.position.set(2, 37, 27);
    this.camera.lookAt(2, 0, 1);

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
    this.buildGrid();
    this.buildSlots();

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
    const dirtTopMat = new THREE.MeshBasicMaterial({ color: 0xb79662 });
    const dirtSideMat = new THREE.MeshBasicMaterial({ color: darken(0xb79662, SIDE_SHADE) });
    const grassMats = faceMats(this.grassTopMat, this.grassSideMat);
    const dirtMats = faceMats(dirtTopMat, dirtSideMat);

    for (let col = 0; col < FIELD.cols; col++) {
      for (let row = 0; row < FIELD.rows; row++) {
        const isPath = FIELD.pathCellSet.has(`${col},${row}`);
        const c = FIELD.cellCenter(col, row);
        const mesh = new THREE.Mesh(isPath ? pathGeo : grassGeo, isPath ? dirtMats : grassMats);
        // 경로는 살짝 낮게(파인 길), 잔디는 윗면 y=0
        const topY = isPath ? -0.14 : 0;
        mesh.position.set(c.x, topY - cubeH / 2, c.z);
        this.scene.add(mesh);
      }
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
      this.scene.add(ring);
      this.slotMeshes.push(ring);
    }
  }

  setSlotHighlight(index: number, on: boolean): void {
    const mat = this.slotMeshes[index]?.material as THREE.MeshBasicMaterial;
    if (mat) mat.opacity = on ? 0.95 : 0.5;
  }

  setTheme(theme: Theme): void {
    this.grassTopMat.color.setHex(THEME_GROUND[theme]);
    this.grassSideMat.color.setHex(darken(THEME_GROUND[theme], SIDE_SHADE));
  }

  /** 성(거점) 위에 뜬 HP 바 갱신 (0~1). */
  setBaseHp(frac: number): void {
    const bar = this.base.userData.hpbar as { set: (f: number) => void } | undefined;
    bar?.set(frac);
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
