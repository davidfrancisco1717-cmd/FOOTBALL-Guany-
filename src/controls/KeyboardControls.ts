import { InputSnapshot } from './TouchControls';

export interface KeyboardCallbacks {
  onTogglePause?: () => void;
  onToggleCamera?: () => void;
}

const CROSS_CODES = ['KeyJ', 'KeyZ', 'Enter'];
const TRIANGLE_CODES = ['KeyI', 'KeyX', 'KeyE'];
const CIRCLE_CODES = ['KeyL', 'KeyC', 'KeyQ'];
const SQUARE_CODES = ['KeyK', 'Space'];

export class KeyboardControls {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private justReleased = new Set<string>();
  private mouseDown = false;
  private mouseJustPressed = false;
  private mouseJustReleased = false;
  private callbacks: KeyboardCallbacks;
  private targetCanvas: HTMLElement | null = null;

  constructor(callbacks: KeyboardCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public attach(canvasEl: HTMLElement): () => void {
    this.targetCanvas = canvasEl;

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) {
        this.justPressed.add(e.code);
        if (e.code === 'Escape' || e.code === 'KeyP') {
          this.callbacks.onTogglePause?.();
        } else if (e.code === 'KeyV') {
          this.callbacks.onToggleCamera?.();
        }
      }
      this.keys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (this.keys.has(e.code)) {
        this.justReleased.add(e.code);
      }
      this.keys.delete(e.code);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && e.target === this.targetCanvas) {
        if (!this.mouseDown) this.mouseJustPressed = true;
        this.mouseDown = true;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0 && this.mouseDown) {
        this.mouseDown = false;
        this.mouseJustReleased = true;
      }
    };

    const onBlur = () => {
      this.keys.clear();
      this.justPressed.clear();
      this.justReleased.clear();
      this.mouseDown = false;
      this.mouseJustPressed = false;
      this.mouseJustReleased = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }

  private anyInSet(set: Set<string>, codes: string[]): boolean {
    for (let i = 0; i < codes.length; i++) {
      if (set.has(codes[i])) return true;
    }
    return false;
  }

  public consumeSnapshot(): InputSnapshot {
    let moveX = 0;
    let moveZ = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ += 1;

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) {
      moveX /= len;
      moveZ /= len;
    }

    const crossHeld = this.anyInSet(this.keys, CROSS_CODES);
    const triangleHeld = this.anyInSet(this.keys, TRIANGLE_CODES);
    const circleHeld = this.anyInSet(this.keys, CIRCLE_CODES);
    const squareHeld = this.anyInSet(this.keys, SQUARE_CODES) || this.mouseDown;
    const doublePressHeld =
      this.keys.has('KeyU') || this.keys.has('KeyR') || (crossHeld && squareHeld);

    const out: InputSnapshot = {
      moveX,
      moveZ,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      crossHeld,
      triangleHeld,
      circleHeld,
      squareHeld,
      doublePressHeld,
      justPressedCross: this.anyInSet(this.justPressed, CROSS_CODES),
      justPressedTriangle: this.anyInSet(this.justPressed, TRIANGLE_CODES),
      justPressedCircle: this.anyInSet(this.justPressed, CIRCLE_CODES),
      justPressedSquare: this.anyInSet(this.justPressed, SQUARE_CODES) || this.mouseJustPressed,
      justReleasedCross: this.anyInSet(this.justReleased, CROSS_CODES),
      justReleasedTriangle: this.anyInSet(this.justReleased, TRIANGLE_CODES),
      justReleasedCircle: this.anyInSet(this.justReleased, CIRCLE_CODES),
      justReleasedSquare: this.anyInSet(this.justReleased, SQUARE_CODES) || this.mouseJustReleased,
    };

    this.justPressed.clear();
    this.justReleased.clear();
    this.mouseJustPressed = false;
    this.mouseJustReleased = false;
    return out;
  }
}
