// @ts-nocheck
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
let active = null;
const rendered = new WeakMap();
const formatted = metric => (metric.format === 'money' ? money : integer).format(metric.value);

function finish(job) {
  if (job.frame !== null) cancelAnimationFrame(job.frame);
  for (const metric of job.metrics) {
    paint(metric, metric.value, 0, 0, true);
    metric.element.setAttribute('data-metric-animating', 'false');
  }
  if (active === job) active = null;
}

function wheel() {
  const element = document.createElement('span');
  element.className = 'metric-digit';
  const reel = document.createElement('span');
  reel.className = 'metric-reel';
  for (let index = 0; index <= 10; index++) {
    const cell = document.createElement('span');
    cell.textContent = String(index % 10);
    reel.appendChild(cell);
  }
  element.appendChild(reel);
  return { element, reel, value: 0, phase: 0, goal: 0, velocity: 0, landing: null };
}

function paint(metric, amount, elapsed, remainingTime = 500, immediate = false) {
  const text = (metric.format === 'money' ? money : integer).format(amount);
  const layout = text.replace(/\d/g, '#');
  const fragment = layout !== metric.layout ? document.createDocumentFragment() : null;
  let place = (text.match(/\d/g) || []).length;
  const slots = new Map();
  for (const character of text) {
    if (!/\d/.test(character)) {
      if (fragment) {
        const symbol = document.createElement('span');
        symbol.className = 'metric-symbol';
        symbol.textContent = character;
        fragment.appendChild(symbol);
      }
      continue;
    }
    const key = --place;
    const slot = metric.slots.get(key) || wheel();
    const value = Number(character);
    if (value !== slot.value) {
      slot.value = value;
      slot.goal = Math.floor(slot.phase / 10) * 10 + value;
      if (slot.goal < slot.phase - 0.000001) slot.goal += 10;
    }
    if (immediate) {
      slot.phase = value;
      slot.goal = value;
      slot.velocity = 0;
      slot.landing = null;
    } else if (remainingTime <= 200) {
      if (!slot.landing) {
        const seconds = remainingTime / 1000;
        slot.landing = {
          phase: slot.phase,
          goal: slot.goal,
          remainingTime,
          tangent: Math.min(Math.max(0, slot.velocity * seconds), 3 * (slot.goal - slot.phase))
        };
      }
      // Match the incoming velocity, then decelerate to zero at 500 ms.
      const landing = slot.landing;
      const t = landing.remainingTime ? 1 - remainingTime / landing.remainingTime : 1;
      const t2 = t * t;
      const t3 = t2 * t;
      slot.phase = (2 * t3 - 3 * t2 + 1) * landing.phase
        + (t3 - 2 * t2 + t) * landing.tangent
        + (-2 * t3 + 3 * t2) * landing.goal;
    } else {
      // Critically damped motion preserves velocity when the count advances.
      const seconds = elapsed / 1000;
      const frequency = 24;
      const error = slot.phase - slot.goal;
      const step = (slot.velocity + frequency * error) * seconds;
      const decay = Math.exp(-frequency * seconds);
      slot.phase = slot.goal + (error + step) * decay;
      slot.velocity = (slot.velocity - frequency * step) * decay;
      if (slot.phase > slot.goal) { slot.phase = slot.goal; slot.velocity = 0; }
    }
    slot.reel.style.transform = 'translateY(' + (-(slot.phase % 10) * 1.12) + 'em)';
    if (fragment) fragment.appendChild(slot.element);
    slots.set(key, slot);
  }
  if (fragment) metric.visual.replaceChildren(fragment);
  metric.slots = slots;
  metric.layout = layout;
  if (metric.formatted !== text) {
    metric.element.setAttribute('data-metric-value', text);
    metric.formatted = text;
  }
}

// One frame loop for all four stats; later edits replace the values immediately.
export function displayMetrics(entries, animateOnLoad = false) {
  if (active) finish(active);
  const metrics = entries.map(entry => {
    const element = document.getElementById(entry.id);
    if (!element) return null;
    let metric = rendered.get(element);
    if (!metric) {
      const visual = document.createElement('span');
      visual.className = 'metric-visual';
      visual.setAttribute('aria-hidden', 'true');
      element.replaceChildren(visual);
      element.classList.add('metric-odometer');
      element.setAttribute('role', 'img');
      metric = { element, visual, slots: new Map(), layout: null, formatted: null };
      rendered.set(element, metric);
    }
    Object.assign(metric, entry);
    const text = formatted(metric);
    element.setAttribute('aria-label', text);
    // Size for the final value once, so font size and the Y axis never move.
    element.style.setProperty('--metric-width', String(text.length * 0.7));
    return metric;
  }).filter(Boolean);
  const job = { metrics, frame: null };
  const reduced = () => document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animateOnLoad || reduced() || metrics.every(metric => metric.value === 0)) {
    finish(job);
    return;
  }
  active = job;
  for (const metric of metrics) {
    metric.amount = 0;
    for (const slot of metric.slots.values()) {
      slot.value = 0; slot.phase = 0; slot.goal = 0; slot.velocity = 0; slot.landing = null;
    }
    metric.element.setAttribute('data-metric-animating', 'true');
    paint(metric, 0, 0, 500, true);
  }
  const started = performance.now();
  const duration = 500;
  let previous = started;
  function tick(now) {
    if (active !== job) return;
    if (reduced()) { finish(job); return; }
    const elapsed = Math.max(0, now - previous);
    previous = now;
    const progress = Math.max(0, Math.min((now - started) / duration, 1));
    // Reserve the final 40% for the wheels to land smoothly on their targets.
    const countProgress = Math.min(progress / 0.6, 1);
    const eased = 1 - Math.pow(1 - countProgress, 2);
    for (const metric of metrics) {
      const scale = metric.format === 'money' ? 100 : 1;
      let amount = Math.round(metric.value * eased * scale) / scale;
      const boundary = Math.pow(10, Math.max(1, Math.floor(Math.log10(Math.max(metric.amount, 1))) + 1));
      if (amount >= boundary && metric.amount < boundary && countProgress < 1) amount = boundary;
      metric.amount = countProgress === 1 ? metric.value : amount;
      paint(metric, metric.amount, elapsed, Math.max(0, duration - (now - started)));
    }
    if (progress === 1) finish(job);
    else job.frame = requestAnimationFrame(tick);
  }
  job.frame = requestAnimationFrame(tick);
}
