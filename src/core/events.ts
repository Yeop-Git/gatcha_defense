import type { GameEvents } from './types';

type Handler<T> = (payload: T) => void;

/**
 * 타입 안전 이벤트 버스. 외부 상태 라이브러리 금지 원칙에 따라 순수 TS 구현.
 * 시스템(전투/웨이브/UI)은 서로를 직접 참조하지 않고 이 버스로만 통신한다.
 */
type AnyHandler = (p: any) => void;

class EventBus {
  private handlers: Partial<Record<keyof GameEvents, Set<AnyHandler>>> = {};

  on<K extends keyof GameEvents>(type: K, handler: Handler<GameEvents[K]>): () => void {
    (this.handlers[type] ??= new Set()).add(handler as AnyHandler);
    return () => this.off(type, handler);
  }

  off<K extends keyof GameEvents>(type: K, handler: Handler<GameEvents[K]>): void {
    this.handlers[type]?.delete(handler as AnyHandler);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    this.handlers[type]?.forEach((h) => h(payload));
  }

  clear(): void {
    this.handlers = {};
  }
}

/** 전역 단일 이벤트 버스 */
export const bus = new EventBus();
