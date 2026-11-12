// ITIHAS website: the "as known on" control. A time line with one tick per document;
// the thumb snaps to the dates on which something was published.
import { day, fmtDate, icon, reducedMotion } from "./core.js";

/**
 * el: container. dates: sorted unique ISO dates the thumb can rest on.
 * ticks: [{date, big}] one per document (big marks central compilations).
 * onChange(index, iso) fires whenever the position changes.
 * Returns { set(index), index(), play(), stop(), setDates(dates, ticks) }.
 */
export function scrubber(el, { dates, ticks = [], onChange, label = "As known on", replayMs = 8000 }) {
  el.classList.add("scrub");
  el.innerHTML = `<button type="button" class="btn btn-secondary" data-play></button>
    <div class="scrub-track" role="slider" tabindex="0" aria-label="${label}">
      <div class="scrub-fill"></div><div class="scrub-ticks"></div><div class="scrub-years"></div><div class="scrub-thumb"></div>
    </div>`;
  const track = el.querySelector(".scrub-track"), thumb = el.querySelector(".scrub-thumb"), fill = el.querySelector(".scrub-fill");
  const tickEl = el.querySelector(".scrub-ticks"), yearEl = el.querySelector(".scrub-years"), btn = el.querySelector("[data-play]");
  let d0 = 0, d1 = 1, days = [], i = 0, raf = null;
  const pos = (d) => ((d - d0) / (d1 - d0 || 1)) * 100;
  const setBtn = (playing) => { btn.innerHTML = `${icon(playing ? "pause" : "play")}<span>${playing ? "Pause" : "Replay"}</span>`; };

  function layout(newDates, newTicks) {
    dates = newDates; ticks = newTicks;
    days = dates.map(day);
    d0 = days[0]; d1 = days[days.length - 1];
    tickEl.innerHTML = ticks.map((t) => `<i class="${t.big ? "big" : ""}" style="left:${pos(day(t.date)).toFixed(2)}%"></i>`).join("");
    const y0 = +dates[0].slice(0, 4), y1 = +dates[dates.length - 1].slice(0, 4);
    const yrs = [];
    for (let y = y0 + 1; y <= y1; y++) yrs.push(y);
    const stepY = Math.ceil(yrs.length / 8);
    yearEl.innerHTML = yrs.filter((_, k) => k % stepY === 0).map((y) => `<span style="left:${pos(day(`${y}-01-01`)).toFixed(2)}%">${y}</span>`).join("");
    track.setAttribute("aria-valuemin", 0);
    track.setAttribute("aria-valuemax", dates.length - 1);
  }
  function place(p) { thumb.style.left = `${p}%`; fill.style.width = `${p}%`; }
  function set(k, { silent = false, glide = false } = {}) {
    k = Math.max(0, Math.min(dates.length - 1, k));
    const changed = k !== i;
    i = k;
    if (!glide) place(pos(days[i]));
    track.setAttribute("aria-valuenow", i);
    track.setAttribute("aria-valuetext", fmtDate(dates[i]));
    if (changed && !silent) onChange(i, dates[i]);
  }
  /** Index of the last date on or before a day. */
  const before = (d) => { let k = 0; while (k < days.length - 1 && days[k + 1] <= d) k++; return k; };
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    setBtn(false);
    place(pos(days[i]));
  }
  function play() {
    if (raf) return stop();
    if (reducedMotion()) { set(dates.length - 1); return; }
    setBtn(true);
    raf = -1; // playing() is already true when the first change fires, so the page does not record it as the reader's choice
    set(0);
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / replayMs), d = d0 + t * (d1 - d0);
      place(t * 100);
      set(before(d), { glide: true });
      if (t < 1) raf = requestAnimationFrame(tick); else { raf = null; setBtn(false); set(dates.length - 1); }
    };
    raf = requestAnimationFrame(tick);
  }
  const fromPointer = (ev) => {
    const r = track.getBoundingClientRect();
    const d = d0 + Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (d1 - d0);
    // nearest date to the pointer
    let k = before(d);
    if (k < days.length - 1 && days[k + 1] - d < d - days[k]) k++;
    set(k);
  };
  track.addEventListener("pointerdown", (ev) => {
    if (raf) stop();
    track.setPointerCapture(ev.pointerId);
    fromPointer(ev);
    const move = (e) => fromPointer(e);
    const up = () => { track.removeEventListener("pointermove", move); track.removeEventListener("pointerup", up); track.removeEventListener("pointercancel", up); };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", up);
    track.addEventListener("pointercancel", up);
  });
  track.addEventListener("keydown", (ev) => {
    const k = { ArrowLeft: i - 1, ArrowDown: i - 1, ArrowRight: i + 1, ArrowUp: i + 1, Home: 0, End: dates.length - 1, PageDown: i - 5, PageUp: i + 5 }[ev.key];
    if (k == null) return;
    ev.preventDefault();
    if (raf) stop();
    set(k);
  });
  btn.addEventListener("click", play);
  setBtn(false);
  layout(dates, ticks);
  i = -1;
  set(dates.length - 1, { silent: true });
  return {
    set, play, stop, index: () => i, date: () => dates[i], playing: () => !!raf,
    setDates(nd, nt) { stop(); layout(nd, nt); i = -1; set(nd.length - 1, { silent: true }); },
  };
}
