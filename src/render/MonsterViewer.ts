import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type OwnedUnit } from '../core/GameState';
import type { Element } from '../core/types';
import { ENEMIES } from '../data/enemies';
import { CAPTURED_BOSS_SCALE, unitHeight } from '../data/constants';
import { makeCreature, makeEnemy, disposeCreatureView } from './fallback';

/**
 * "내 몬스터" 3D 뷰어. OrbitControls 360° 회전/줌. 대기 연출은 코드(바운스/부유/회전).
 * 어두운 목재 진열장 + 스포트라이트 분위기 (ASSETS.md §3.3).
 */
export class MonsterViewer {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  controls: OrbitControls;
  private model: THREE.Group | null = null;
  private stand: THREE.Mesh;
  private t = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.scene.background = new THREE.Color(0x1c130c);
    this.camera.position.set(0, 2.4, 6);

    // 스포트라이트 진열대
    const spot = new THREE.SpotLight(0xfff0d0, 90, 30, Math.PI / 5, 0.4, 1.5);
    spot.position.set(2, 8, 4);
    this.scene.add(spot);
    this.scene.add(new THREE.AmbientLight(0x66708a, 0.5));
    const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
    rim.position.set(-4, 3, -4);
    this.scene.add(rim);

    this.stand = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.9, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x3e2a1b }),
    );
    this.stand.position.y = 0.2;
    this.scene.add(this.stand);
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.08, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0xd8a93b }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.42;
    this.scene.add(trim);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enablePan = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 10;
    this.controls.target.set(0, 1.4, 0);
    this.controls.autoRotate = false;
    this.controls.enabled = false;

    // 창 크기에 맞춘 종횡비 (없으면 뷰어가 늘어져 보임)
    this.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () => this.resize(window.innerWidth, window.innerHeight));
  }

  setUnit(unit: OwnedUnit): void {
    if (this.model) {
      this.scene.remove(this.model);
      disposeCreatureView(this.model);
    }
    // 뷰어는 정규화 높이를 크게 확대해 전시 (보스체는 더 크게)
    if (unit.kind === 'enemy') {
      const def = ENEMIES[unit.species ?? ''] ?? ENEMIES.slime;
      const bossy = def.tier === 'boss' || def.tier === 'miniboss';
      const h = unitHeight(unit.stage) * (bossy ? CAPTURED_BOSS_SCALE : 1) * 1.6;
      this.model = makeEnemy(def.element, def.radius, def.flying, def.model, 'idle', h);
    } else {
      const scale = (unitHeight(unit.stage) / 1.85) * 1.6;
      this.model = makeCreature(unit.element, scale, unit.stage);
    }
    this.model.position.y = 0.4;
    this.scene.add(this.model);
  }

  setActive(on: boolean): void {
    this.controls.enabled = on;
  }

  /** 도감 감상용: 소유 여부와 무관하게 크리처(속성·단계) 3D 표시. */
  viewCreature(element: Element, stage: 1 | 2 | 3): void {
    this.setUnit({ uid: 'dex', kind: 'creature', element, level: 1, stage, xp: 0, equipped: [], discarded: [], bond: 0 });
  }

  /** 도감 감상용: 적 species 3D 표시. */
  viewEnemy(species: string): void {
    const def = ENEMIES[species];
    if (!def) return;
    this.setUnit({ uid: 'dex', kind: 'enemy', species, element: (def.element === 'neutral' ? 'grass' : def.element) as Element, level: 1, stage: 1, xp: 0, equipped: [], discarded: [], bond: 0 });
  }

  update(dt: number): void {
    this.t += dt;
    if (this.model) {
      this.model.rotation.y += dt * 0.4;
      this.model.position.y = 0.4 + Math.sin(this.t * 2) * 0.12; // 부유
      const mixer = this.model.userData.mixer as THREE.AnimationMixer | undefined;
      if (mixer) mixer.update(dt);
    }
    this.controls.update();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
