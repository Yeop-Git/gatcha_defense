import * as THREE from 'three';
import type { Enemy } from './Enemy';

/** 투사체: 대상 적을 추적, 도달 시 onArrive 콜백. 유닛탄/성 평타 공용. */
export class Projectile {
  mesh: THREE.Mesh;
  target: Enemy | null;
  from = new THREE.Vector3();
  speed: number;
  onArrive: (hit: Enemy | null) => void;
  dead = false;
  private arc: boolean;
  private trav = 0;
  private dist = 1;

  constructor(from: THREE.Vector3, target: Enemy | null, color: number, speed = 20, arc = false, onArrive: (hit: Enemy | null) => void = () => {}) {
    this.target = target;
    this.speed = speed;
    this.onArrive = onArrive;
    this.arc = arc;
    this.from.copy(from);
    const r = arc ? 0.34 : 0.42; // 평타가 잘 보이도록 크게
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 10),
      new THREE.MeshBasicMaterial({ color }), // unlit (카툰) — 밝은 단색 탄
    );
    // 발광 헤일로 (가산합성) — 탄이 확실히 보이게
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.9, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.mesh.add(glow);
    this.mesh.position.copy(from);
    this.mesh.position.y = 1;
    this.dist = target ? from.distanceTo(target.pos) : 1;
  }

  update(dt: number): void {
    if (this.dead) return;
    const tp = this.target && this.target.alive ? this.target.pos : null;
    if (!tp) {
      // 대상 소멸 → 마지막 위치로 진행 후 소멸
      this.dead = true;
      this.onArrive(null);
      return;
    }
    const dir = new THREE.Vector3(tp.x - this.mesh.position.x, 1 - this.mesh.position.y, tp.z - this.mesh.position.z);
    const d = dir.length();
    if (d < 0.5) {
      this.dead = true;
      this.onArrive(this.target);
      return;
    }
    dir.normalize();
    const step = this.speed * dt;
    this.mesh.position.x += dir.x * step;
    this.mesh.position.z += dir.z * step;
    if (this.arc) {
      this.trav += step;
      const p = Math.min(1, this.trav / this.dist);
      this.mesh.position.y = 1 + Math.sin(p * Math.PI) * 3;
    } else {
      this.mesh.position.y = 1;
    }
  }

  dispose(parent: THREE.Object3D): void {
    parent.remove(this.mesh);
    // 본체 + 발광 헤일로 자식까지 전부 해제 (GPU 버퍼 누수 방지)
    this.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
