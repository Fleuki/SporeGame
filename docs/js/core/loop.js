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

const STEP = 1 / 60;

// Потолок на догоняющие шаги. Без него после сворачивания вкладки
// накопится минута отставания и цикл повесит страницу, пытаясь её отыграть.
const MAX_STEPS = 5;

// ПОТОЛОК ЧАСТОТЫ РИСОВАНИЯ.
//
// requestAnimationFrame зовут столько раз, сколько герц у экрана, и на
// ProMotion-телефоне (iPhone 13 Pro и новее) это 120 раз в секунду. Симуляция
// от этого не ускоряется — она давно фиксированная, — а вот КАРТИНКА рисуется
// вдвое чаще, чем нужно: те же шесть полноэкранных заливок (земля, тинт,
// темнота, виньетка), только 120 раз вместо 60. Телефон греется ровно на этой
// разнице, и заметить её в игре нельзя: пиксель-арт при 60 и 120 кадрах
// выглядит одинаково, потому что сама анимация идёт по 60 шагам симуляции.
//
// Допуск в миллисекунду обязателен: на честном 60-герцовом экране кадры
// приходят через 16.6 мс с дрожанием, и сравнение «>= 16.67» выбрасывало бы
// каждый второй кадр, превращая 60 Гц в 30.
const RENDER_TOLERANCE = 1;

export class Loop {
  constructor(update, render, maxFps = 60) {
    this.update = update;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.frameId = 0;
    this.renderStep = maxFps > 0 ? 1000 / maxFps : 0;
    this.lastRender = 0;
  }

  start() {
    this.last = performance.now();
    this.lastRender = 0;
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
      if (now - this.lastRender < this.renderStep - RENDER_TOLERANCE) return;
      this.lastRender = now;
      this.render();
    };
    this.frameId = requestAnimationFrame(tick);
  }

  stop() { cancelAnimationFrame(this.frameId); }
}
