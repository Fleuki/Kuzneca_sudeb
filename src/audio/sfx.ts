/**
 * Звук — синтезом, без единого файла.
 *
 * Ассетов у игры нет принципиально: всё рисуется примитивами, и звук сделан
 * тем же способом — осцилляторы и шум через Web Audio. Это не «пока нет
 * художника», а сознательный размен: тонна коротких wav-ов утяжелила бы сборку
 * для Яндекс Игр, а процедурный удар настраивается числом, как и всё остальное
 * в этой игре.
 *
 * Правила, из которых всё здесь следует:
 *  - симуляция про звук не знает вообще ничего. Звуки издаёт наблюдатель
 *    состояния (`audio/reactor.ts`), ровно как рендер рисует искры;
 *  - контекст создаётся только после жеста пользователя — иначе браузер его
 *    заблокирует, а Safari ещё и оставит навсегда в suspended;
 *  - громкости держатся низкими: игра про чтение телеграфов, и звук не должен
 *    перекрикивать картинку.
 */

export type SfxName =
  | 'pick'
  | 'oreBreak'
  | 'oreSweet'
  | 'nugget'
  | 'hit'
  | 'pogo'
  | 'hurt'
  | 'weaponBreak'
  | 'craft'
  | 'unlock'
  | 'forgeGood'
  | 'forgePerfect'
  | 'forgeMiss'
  | 'menuMove'
  | 'menuConfirm'
  | 'win'
  | 'lose';

/** Фоновый гул: у каждой фазы свой. */
export type AmbientName = 'none' | 'menu' | 'mine' | 'combat';

const MUTE_KEY = 'kuznec_sudeb_muted';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private ambient: AmbientName = 'none';
  private muted = false;
  /** Общий буфер шума: генерировать его на каждый удар — лишняя работа. */
  private noise: AudioBuffer | null = null;

  constructor() {
    try {
      this.muted = window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Создаёт контекст. Вызывать из обработчика жеста: до первого нажатия
   * браузер держит аудио выключенным, и молча.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }

    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(ctx.destination);

      this.ambientGain = ctx.createGain();
      this.ambientGain.gain.value = 0;
      this.ambientGain.connect(this.master);

      this.noise = makeNoiseBuffer(ctx);

      // Фон мог быть запрошен ещё до первого жеста — включаем его теперь.
      const wanted = this.ambient;
      this.ambient = 'none';
      this.setAmbient(wanted);
    } catch {
      // Без звука играть можно; молчание — не повод ронять игру.
      this.ctx = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    try {
      window.localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Приватный режим — настройка просто не переживёт вкладку.
    }
    return this.muted;
  }

  // -------------------------------------------------------------------------
  // Фон
  // -------------------------------------------------------------------------

  /**
   * Фоновый гул фазы. Не музыка: два расстроенных низких тона и отфильтрованный
   * шум. Задача — убрать тишину, а не развлекать; мелодия на примитивах звучала
   * бы дешевле, чем её отсутствие.
   */
  setAmbient(name: AmbientName): void {
    if (this.ambient === name) return;
    this.ambient = name;

    const ctx = this.ctx;
    const bus = this.ambientGain;
    if (!ctx || !bus) return;

    for (const node of this.ambientNodes) {
      try {
        (node as OscillatorNode | AudioBufferSourceNode).stop?.();
      } catch {
        // уже остановлен
      }
      node.disconnect();
    }
    this.ambientNodes = [];

    if (name === 'none') {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      return;
    }

    const preset =
      name === 'mine'
        ? { base: 46, detune: 7, cutoff: 260, level: 0.16, noise: 0.05 }
        : name === 'combat'
          ? { base: 38, detune: 11, cutoff: 190, level: 0.2, noise: 0.035 }
          : { base: 58, detune: 5, cutoff: 320, level: 0.12, noise: 0.03 };

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = preset.cutoff;
    filter.connect(bus);

    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = preset.base + (i === 0 ? 0 : preset.detune);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(filter);
      osc.start();
      this.ambientNodes.push(osc);
    }

    if (this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = preset.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 420;
      hp.Q.value = 0.7;
      src.connect(hp).connect(g).connect(bus);
      src.start();
      this.ambientNodes.push(src);
    }

    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.linearRampToValueAtTime(preset.level, ctx.currentTime + 0.8);
  }

  // -------------------------------------------------------------------------
  // Разовые звуки
  // -------------------------------------------------------------------------

  play(name: SfxName, power = 1): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t = ctx.currentTime;
    const p = Math.max(0.1, Math.min(1, power));

    switch (name) {
      // Кирка по породе: сухой стук с призвуком камня.
      case 'pick':
        this.noiseBurst(t, 0.07, 1100, 2.4, 0.16);
        this.tone(t, 'triangle', 180, 90, 0.07, 0.1);
        break;

      case 'oreBreak':
        this.noiseBurst(t, 0.22, 700, 1.2, 0.2);
        this.tone(t, 'triangle', 120, 55, 0.22, 0.14);
        break;

      // Точный скол в слабое место: тот же удар, но с чистым звоном сверху.
      case 'oreSweet':
        this.noiseBurst(t, 0.18, 900, 1.6, 0.16);
        this.tone(t, 'sine', 880, 1320, 0.28, 0.13);
        this.tone(t + 0.05, 'sine', 1320, 1760, 0.24, 0.09);
        break;

      case 'nugget':
        this.tone(t, 'sine', 660, 990, 0.3, 0.12);
        this.tone(t + 0.08, 'sine', 990, 1320, 0.3, 0.1);
        this.tone(t + 0.16, 'sine', 1320, 1980, 0.36, 0.09);
        break;

      // Попадание по боссу: удар тем весомее, чем сильнее.
      case 'hit':
        this.noiseBurst(t, 0.09 + 0.05 * p, 1500 - 500 * p, 1.4, 0.14 * p + 0.05);
        this.tone(t, 'square', 150 - 40 * p, 60, 0.1 + 0.06 * p, 0.12 * p + 0.04);
        break;

      // Отскок от удара вниз — единственный звук, идущий вверх.
      case 'pogo':
        this.tone(t, 'triangle', 320, 760, 0.16, 0.15);
        this.noiseBurst(t, 0.08, 2200, 2.2, 0.07);
        break;

      // Пропущенный удар: глухо и вниз.
      case 'hurt':
        this.tone(t, 'sawtooth', 220, 70, 0.35, 0.16);
        this.noiseBurst(t, 0.2, 400, 0.8, 0.12);
        break;

      case 'weaponBreak':
        this.noiseBurst(t, 0.5, 1800, 1.0, 0.2);
        this.tone(t, 'square', 400, 60, 0.5, 0.12);
        break;

      case 'craft':
        this.tone(t, 'sine', 520, 780, 0.18, 0.1);
        this.tone(t + 0.09, 'sine', 780, 1040, 0.2, 0.09);
        break;

      // Открытие нового узла дерева — находка, и она звучит как находка.
      case 'unlock':
        this.tone(t, 'sine', 523, 523, 0.5, 0.09);
        this.tone(t + 0.1, 'sine', 659, 659, 0.5, 0.09);
        this.tone(t + 0.2, 'sine', 784, 784, 0.6, 0.1);
        this.tone(t + 0.3, 'sine', 1047, 1047, 0.7, 0.08);
        break;

      // §5: вспышка на идеальном ударе должна быть лучшим, что есть в игре.
      case 'forgePerfect':
        this.tone(t, 'square', 180, 90, 0.16, 0.16);
        this.noiseBurst(t, 0.3, 2600, 2.0, 0.16);
        this.tone(t + 0.02, 'sine', 1046, 1568, 0.5, 0.13);
        this.tone(t + 0.12, 'sine', 1568, 2093, 0.45, 0.1);
        break;

      case 'forgeGood':
        this.tone(t, 'square', 170, 100, 0.14, 0.12);
        this.noiseBurst(t, 0.16, 1800, 1.6, 0.1);
        this.tone(t + 0.03, 'sine', 784, 880, 0.26, 0.08);
        break;

      case 'forgeMiss':
        this.tone(t, 'square', 130, 70, 0.2, 0.1);
        this.noiseBurst(t, 0.12, 500, 0.9, 0.08);
        break;

      case 'menuMove':
        this.tone(t, 'sine', 440, 440, 0.06, 0.05);
        break;

      case 'menuConfirm':
        this.tone(t, 'sine', 520, 700, 0.12, 0.07);
        break;

      case 'win':
        this.tone(t, 'sine', 392, 392, 0.6, 0.1);
        this.tone(t + 0.14, 'sine', 523, 523, 0.6, 0.1);
        this.tone(t + 0.28, 'sine', 659, 659, 0.9, 0.11);
        break;

      case 'lose':
        this.tone(t, 'sawtooth', 320, 90, 1.2, 0.12);
        this.tone(t + 0.2, 'sawtooth', 240, 60, 1.0, 0.09);
        break;
    }
  }

  // -------------------------------------------------------------------------

  /** Тон с глайдом от `from` к `to` и экспоненциальным спадом. */
  private tone(
    at: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    level: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(g).connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  /** Шумовой всплеск через полосовой фильтр — из него сделаны все удары. */
  private noiseBurst(
    at: number,
    duration: number,
    freq: number,
    q: number,
    level: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.4), at + duration);
    filter.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    src.connect(filter).connect(g).connect(master);
    src.start(at);
    src.stop(at + duration + 0.05);
  }
}

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 1.2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
