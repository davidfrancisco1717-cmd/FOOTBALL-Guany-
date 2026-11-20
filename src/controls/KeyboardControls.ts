export interface KeyboardCallbacks {
  onTogglePause?: () => void;
  onToggleCamera?: () => void;
}

export class KeyboardControls {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
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
      this.keys.delete(e.code);
      if (e.code === 'KeyK' || e.code === 'Space') {
        this.mouseJustReleased = true;
      }
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
      this.mouseDown = false;
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

  public consumeSnapshot() {
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

    const crossHeld =
      this.keys.has('KeyJ') || this.keys.has('KeyZ') || this.keys.has('Enter');
    const squareHeld =
      this.keys.has('KeyK') || this.keys.has('Space') || this.mouseDown;
    const doublePressHeld =
      this.keys.has('KeyU') || this.keys.has('KeyR') || (crossHeld && squareHeld);

    const out = {
      moveX,
      moveZ,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      crossHeld,
      squareHeld,
      doublePressHeld,
      justPressedCross:
        this.justPressed.has('KeyJ') ||
        this.justPressed.has('KeyZ') ||
        this.justPressed.has('Enter'),
      justPressedTriangle:
        this.justPressed.has('KeyI') ||
        this.justPressed.has('KeyX') ||
        this.justPressed.has('KeyE'),
      justPressedCircle:
        this.justPressed.has('KeyL') ||
        this.justPressed.has('KeyC') ||
        this.justPressed.has('KeyQ'),
      justPressedSquare:
        this.justPressed.has('KeyK') ||
        this.justPressed.has('Space') ||
        this.mouseJustPressed,
      justReleasedSquare: this.mouseJustReleased,
    };

    this.justPressed.clear();
    this.mouseJustPressed = false;
    this.mouseJustReleased = false;
    return out;
  }
}
