// Keyboard + touch input, unified into one {throttle, airTilt} reading.
// throttle: -1 (brake/reverse) .. 1 (gas)
// airTilt: -1 (nose down / rotate one way) .. 1 (rotate the other way), only
//          effective while the car is airborne (see Car.step).

export class Input {
  constructor() {
    this.keys = new Set();
    this.touchGas = false;
    this.touchBrake = false;
    this.touchTiltDir = 0; // -1, 0, 1

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _onKey(e, down) {
    const k = e.key.toLowerCase();
    const codes = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '];
    if (codes.includes(k)) {
      e.preventDefault();
      if (down) this.keys.add(k);
      else this.keys.delete(k);
    }
  }

  bindTouchButton(el, onDown, onUp) {
    if (!el) return;
    const start = (e) => {
      e.preventDefault();
      onDown();
    };
    const end = (e) => {
      e.preventDefault();
      onUp();
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
    // Also mouse, so it works fine on touch-capable laptops/desktop testing.
    el.addEventListener('mousedown', start);
    window.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', end);
  }

  read() {
    const gas = this.keys.has('arrowright') || this.keys.has('d') || this.touchGas;
    const brake = this.keys.has('arrowleft') || this.keys.has('a') || this.touchBrake;
    const tiltUp = this.keys.has('arrowup') || this.keys.has('w') || this.touchTiltDir === -1;
    const tiltDown = this.keys.has('arrowdown') || this.keys.has('s') || this.touchTiltDir === 1;

    let throttle = 0;
    if (gas) throttle += 1;
    if (brake) throttle -= 1;

    let airTilt = 0;
    if (tiltUp) airTilt -= 1;
    if (tiltDown) airTilt += 1;

    return { throttle, airTilt };
  }
}
