import * as THREE from 'three';
import type { Vec2 } from '../core/types';

/**
 * 포획구 — 성에서 지정 지점으로 포물선을 그리며 날아가 착지 시 판정.
 * 낙하 시간이 있어 "적이 갈 곳을 예측해 던지는" 재미가 핵심(§ capture).
 * 착지 순간 onLand(지점)이 호출되면 Battle이 최근접 적과의 거리로 포획을 판정한다.
 */
export class CaptureOrb {
  view: THREE.Group;
  dead = false;
  private t = 0;
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;

  constructor(
    private from: Vec2,
    private to: Vec2,
    private dur: number,
    private arcH: number,
    private onLand: (p: Vec2) => void,
  ) {
    this.view = new THREE.Group();
    // 포획구 본체 (붉은/흰 이분할 느낌 — 상단 빨강, 하단 흰색 근사)
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xd23b3b }),
    );
    this.ball.userData.placeholder = true;
    const belt = new THREE.Mesh(
      new THREE.SphereGeometry(0.33, 16, 4, 0, Math.PI * 2, Math.PI * 0.46, Math.PI * 0.08),
      new THREE.MeshBasicMaterial({ color: 0xf2ce6b }),
    );
    belt.userData.placeholder = true;
    this.ball.add(belt);
    this.view.add(this.ball);
    // 착지 예측 그림자 (지면 링) — 낙하할수록 작아짐
    this.shadow = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 20),
      new THREE.MeshBasicMaterial({ color: 0xf2ce6b, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(to.x, 0.05, to.z);
    this.shadow.userData.placeholder = true;
    this.view.add(this.shadow);
  }

  update(dt: number): void {
    if (this.dead) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    const x = this.from.x + (this.to.x - this.from.x) * k;
    const z = this.from.z + (this.to.z - this.from.z) * k;
    const y = 0.4 + this.arcH * 4 * k * (1 - k); // 포물선 (양 끝 낮고 중앙 최고)
    this.ball.position.set(x, y, z);
    this.ball.rotation.x += dt * 10;
    // 그림자: 착지 지점 고정, 낙하할수록 작아짐(임박 표시)
    const s = 0.5 + (1 - k) * 0.9;
    this.shadow.scale.setScalar(s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 + k * 0.5;
    if (k >= 1) {
      this.dead = true;
      this.onLand({ x: this.to.x, z: this.to.z });
    }
  }

  dispose(parent: THREE.Object3D): void {
    parent.remove(this.view);
    this.view.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
  }
}
