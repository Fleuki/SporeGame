// Игровой цикл с фиксированным шагом симуляции.
//
// Раньше цикл был `update(); draw(); requestAnimationFrame(...)`, а вся
// логика считала кадры: attackCooldown--, this.timer++, life--. На мониторе
// 120 Гц игра шла ровно вдвое быстрее, на слабой машине — медленнее.
//
// Теперь симуляция всегда продвигается шагами по STEP секунд, сколько бы
// кадров ни успел нарисовать браузер: за один кадр делается столько шагов,
// сколько реально прошло времени. Все существующие счётчики кадров при этом
// продолжают работать и автоматически становятся привязанными ко времени —
// один «кадр логики» теперь всегда равен 1/60 секунды.

export const STEP = 1 / 60;

// Потолок на догоняющие шаги. Без него после сворачивания вкладки
// накопится минута отставания и цикл повесит страницу, пытаясь её отыграть.
const MAX_STEPS = 5;

export class Loop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.frameId = 0;
  }

  start() {
    this.last = performance.now();
    const tick = (now) => {
      this.frameId = requestAnimationFrame(tick);
      let elapsed = (now - this.last) / 1000;
      this.last = now;
      if (elapsed > MAX_STEPS * STEP) elapsed = MAX_STEPS * STEP;
      this.acc += elapsed;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.update(STEP);
      }
      this.render();
    };
    this.frameId = requestAnimationFrame(tick);
  }

  stop() { cancelAnimationFrame(this.frameId); }
}
