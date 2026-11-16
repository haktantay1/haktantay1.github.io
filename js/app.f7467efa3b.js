"use strict";
/* 00-core.js */
/* Çekirdek: ortak yardımcılar ve modül kayıt sistemi.
   Her modül YULA.module(ad, init) ile kaydolur; 99-init.js hepsini sırayla başlatır.
   Faz e'deki sayfa geçişlerinde modüller destroy() ile temizlenip yeniden kurulacak. */
(function () {
  document.documentElement.classList.add("js");

  const modules = [];
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  window.YULA = {
    modules,
    /** @param {string} name @param {(root: Document|Element) => (void|(() => void))} init */
    module(name, init) { modules.push({ name, init }); },
    reducedMotion: () => motionQuery.matches,
    finePointer: () => window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    /** Hafif mod: veri tasarrufu, yavaş bağlantı ya da az bellek. Görünür bir ayar yok;
     *  site bunu kendiliğinden algılar ve daha küçük kareler / daha az önbellek kullanır. */
    lite: () => {
      const c = navigator.connection || {};
      return !!(c.saveData || /(^|-)2g|3g/.test(c.effectiveType || "") || (navigator.deviceMemory && navigator.deviceMemory < 4));
    },
    $: (sel, root = document) => root.querySelector(sel),
    $$: (sel, root = document) => Array.from(root.querySelectorAll(sel)),
    splitLines,
  };

  /**
   * Bir başlığı görsel satırlarına böler: her satır `.line` (maske) > `.line__inner` olur.
   * Yalnızca DOM API'leri kullanır (innerHTML yok → Trusted Types uyumlu). İç öğeler
   * (ör. <em>) bölünmeden tek kelime gibi taşınır. revert() orijinal işaretlemeyi geri
   * koyar; animasyon bitince çağrılır ki yeniden boyutlandırmada satırlar bozulmasın.
   * @param {HTMLElement} el
   */
  /** Metni kelime span'lerine böler (satır gruplaması yok). */
  function splitWords(el) {
    const original = Array.from(el.childNodes, (n) => n.cloneNode(true));
    const words = [];
    const frag = document.createDocumentFragment();
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (!part.trim()) { frag.append(" "); return; }
          const w = document.createElement("span");
          w.className = "word";
          w.textContent = part;
          words.push(w);
          frag.append(w);
        });
      } else {
        const w = document.createElement("span");
        w.className = "word";
        w.append(node.cloneNode(true));
        words.push(w);
        frag.append(w);
      }
    });
    el.replaceChildren(frag);
    return { words, revert: () => el.replaceChildren(...original) };
  }
  window.YULA.splitWords = splitWords;

  function splitLines(el) {
    const original = Array.from(el.childNodes, (n) => n.cloneNode(true));
    const { words } = splitWords(el);

    // Kelimeleri dikey konumlarına göre satırlara grupla.
    const rows = [];
    let top = null;
    words.forEach((w) => {
      if (w.offsetTop !== top) { rows.push([]); top = w.offsetTop; }
      rows[rows.length - 1].push(w);
    });
    const lines = rows.map((row) => {
      const line = document.createElement("span");
      line.className = "line";
      const inner = document.createElement("span");
      inner.className = "line__inner";
      row.forEach((w, i) => { if (i) inner.append(" "); inner.append(w); });
      line.append(inner);
      return line;
    });
    el.replaceChildren(...lines);
    return {
      lines: lines.map((l) => l.firstChild),
      revert: () => el.replaceChildren(...original),
    };
  }
})();

/* 10-header.js */
/* Header: hero'nun koyu sahnesinden çıkınca krem cam yüzeye ve bordo logoya geçer. */
(function () {
  YULA.module("header", () => {
    const header = YULA.$("[data-header]");
    if (!header) return;
    let lastY = window.scrollY;
    // Koyu bir açılış görseli olmayan sayfalarda (ör. proje listesi) header baştan açık zeminli.
    const light = document.body.classList.contains("page--light");
    const update = () => {
      const y = window.scrollY;
      header.classList.toggle("is-solid", light || y > window.innerHeight * 0.08);
      // Bir ekran boyu aşağıdayken: aşağı kaydırınca çekil, yukarı kaydırınca geri gel.
      if (Math.abs(y - lastY) > 6) {
        header.classList.toggle("is-hidden", y > lastY && y > window.innerHeight && !header.contains(document.activeElement));
        lastY = y;
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  });

  // Dış bağlantılarda opener / referrer sızıntısını engelle.
  YULA.module("external-links", (root) => {
    YULA.$$('a[target="_blank"]', root).forEach((a) => { a.rel = "noopener noreferrer nofollow"; });
  });
})();

/* 15-smooth-scroll.js */
/* Akıcı kaydırma: Lenis + GSAP ScrollTrigger tek saat (gsap.ticker) üzerinde.
   - Dokunmatik cihazlarda tarayıcının kendi kaydırması korunur (syncTouch kapalı).
   - Hareketi azalt tercihinde Lenis hiç kurulmaz; ScrollTrigger yerel kaydırmayla çalışır.
   - Preloader açıkken kaydırma durdurulur.
   Dışa açılan: YULA.lenis (yoksa null). */
(function () {
  YULA.lenis = null;

  YULA.module("smooth-scroll", () => {
    const { gsap, ScrollTrigger, Lenis } = window;
    if (!gsap || !ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    if (!Lenis || YULA.reducedMotion()) return;

    const lenis = new Lenis({
      lerp: 0.085,              // düşük = daha ağır, "lüks" bir süzülme
      wheelMultiplier: 0.9,
      anchors: true,            // #projeler gibi bağlantılar da yumuşak kayar
      autoRaf: false,
    });
    YULA.lenis = lenis;

    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);   // Lenis ile kaydırma ve animasyon aynı zamanı paylaşır

    // Preloader sürerken sayfa kaymasın.
    const html = document.documentElement;
    if (html.classList.contains("is-preloading")) {
      lenis.stop();
      const mo = new MutationObserver(() => {
        if (!html.classList.contains("is-preloading")) { lenis.start(); mo.disconnect(); }
      });
      mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    }

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      YULA.lenis = null;
    };
  });
})();

/* 20-hero-light.js */
/* Hero ışığı.
   Karanlık sahnede imleç (ya da dokunuş) bir ışık kaynağı gibi dolaşır; imleç yokken ışık
   kendi kendine yavaşça süzülür.

   İki çizim yolu:
   1) WebGL2 shader (varsayılan): görsel doğrusal renk uzayında aydınlatılır; ışık ters-kare
      benzeri yumuşak düşüşe, sıcak renk sıcaklığına ve görselin parlaklığından türetilen
      "rölyef" normallerine sahiptir (ışık kumaş, ahşap ve duvar dokusunu yalayarak aydınlatır).
      Üstüne ince bir hale, filmik ton eşleme, vinyet ve canlı film greni eklenir.
   2) CSS maske (yedek): WebGL2 yoksa ya da bağlam kaybolursa (--mx / --my değişkenleri).

   Dışa açılan: YULA.hero.intensity (0–1), açılış animasyonu ışığı bununla yakar. */
(function () {
  const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;        // tuval boyutu (px)
uniform vec2 uTexSize;    // doku boyutu (px)
uniform vec2 uFocus;      // object-position karşılığı
uniform vec2 uLight;      // ışık konumu (px, sol üst orijin)
uniform float uRadius;    // ışık yarıçapı (px)
uniform float uTime;
uniform float uIntensity; // açılışta 0 → 1
uniform float uAmbient;   // ortam ışığı (doğrusal)
out vec4 outColor;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c)   { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float luma(vec3 c)    { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 fuv = frag / uRes;

  // object-fit: cover + object-position eşlemesi
  float sa = uRes.x / uRes.y, ta = uTexSize.x / uTexSize.y;
  vec2 sc = sa > ta ? vec2(1.0, ta / sa) : vec2(sa / ta, 1.0);
  vec2 uv = fuv * sc + (1.0 - sc) * uFocus;

  vec3 albedo = toLinear(texture(uTex, uv).rgb);

  // Parlaklık gradyanından rölyef normali (hafif bulanık mip seviyesinden, gürültüsüz)
  vec2 t = 1.5 / uTexSize;
  float hl = luma(textureLod(uTex, uv - vec2(t.x, 0.0), 1.0).rgb);
  float hr = luma(textureLod(uTex, uv + vec2(t.x, 0.0), 1.0).rgb);
  float hu = luma(textureLod(uTex, uv - vec2(0.0, t.y), 1.0).rgb);
  float hd = luma(textureLod(uTex, uv + vec2(0.0, t.y), 1.0).rgb);
  vec3 n = normalize(vec3((hl - hr) * 3.0, (hu - hd) * 3.0, 1.0));

  // Işık: yüzeyin biraz önünde duran bir kaynak
  vec2 d = uLight - frag;
  float dist = length(d) / uRadius;
  vec3 l = normalize(vec3(d / uRadius, 0.55));
  float relief = clamp(max(dot(n, l), 0.0) / l.z, 0.0, 2.0);   // düz yüzeyde 1
  // Yumuşak çekirdek + uzun kuyruk; yarıçapta tamamen söner (CSS yedeğiyle aynı ölçek)
  float att = 1.0 / (1.0 + 4.0 * dist * dist);
  att *= 1.0 - smoothstep(0.35, 1.0, dist);

  // Merkezde nötr-sıcak, kenarlara doğru daha amber
  vec3 warm = mix(vec3(1.0, 0.79, 0.6), vec3(1.0, 0.94, 0.86), smoothstep(0.0, 0.6, att));

  vec3 col = albedo * (uAmbient + warm * att * 1.6 * mix(1.0, relief, 0.55));

  // Işığın çevresine taşan yumuşak hale (çok bulanık mip)
  vec3 glow = toLinear(textureLod(uTex, uv, 5.0).rgb);
  col += glow * warm * att * att * 0.45;

  col *= uIntensity;
  col = vec3(1.0) - exp(-col * 1.25);                            // filmik ton eşleme

  float v = smoothstep(1.25, 0.35, length((fuv - vec2(0.5, 0.55)) * vec2(1.0, 0.9)) * 1.35);
  col *= mix(0.75, 1.0, v);                                      // vinyet

  vec3 c = toSrgb(col);
  c += (hash(frag + fract(uTime * 0.137) * 997.0) - 0.5) * 0.028; // canlı film greni
  outColor = vec4(c, 1.0);
}`;

  /** WebGL2 çizici kurar; desteklenmiyorsa null döner. */
  function createRenderer(hero, onLost) {
    const canvas = document.createElement("canvas");
    canvas.className = "hero__gl";
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance" });
    if (!gl) return null;

    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    // Tüm ekranı kaplayan tek üçgen
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    ["uTex", "uRes", "uTexSize", "uFocus", "uLight", "uRadius", "uTime", "uIntensity", "uAmbient"]
      .forEach((n) => { u[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uFocus, 0.5, 0.68);
    gl.uniform1f(u.uAmbient, 0.016);

    let ready = false;
    let size = [1, 1];
    const img = hero.querySelector(".hero__base img");
    const upload = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform2f(u.uTexSize, img.naturalWidth, img.naturalHeight);
      ready = true;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // keskinlik / performans dengesi
      const w = Math.round(hero.clientWidth * dpr);
      const h = Math.round(hero.clientHeight * dpr);
      if (w === size[0] && h === size[1]) return;
      size = [w, h];
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uRadius, Math.max(w, h) * 0.3);
    };

    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); ready = false; onLost(); });

    hero.querySelector(".hero__stage").appendChild(canvas);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(hero);

    return {
      canvas,
      load: () => (img.complete ? Promise.resolve() : new Promise((r) => img.addEventListener("load", r, { once: true })))
        .then(() => img.decode().catch(() => {}))
        .then(upload),
      /** x, y: 0–1 (hero içinde); t: ms */
      draw(x, y, t, intensity) {
        if (!ready) return;
        gl.uniform2f(u.uLight, x * size[0], y * size[1]);
        gl.uniform1f(u.uTime, t / 1000);
        gl.uniform1f(u.uIntensity, intensity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      destroy() { ro.disconnect(); canvas.remove(); gl.getExtension("WEBGL_lose_context")?.loseContext(); },
    };
  }

  YULA.hero = { intensity: 1, exit: 0 };

  YULA.module("hero-light", () => {
    const hero = YULA.$("[data-hero]");
    if (!hero) return;
    YULA.hero.intensity = 1;
    YULA.hero.exit = 0;
    const still = YULA.reducedMotion();

    let tx = 0.5, ty = 0.62, cx = tx, cy = ty;
    let active = false, idle = 0, raf = 0, visible = true, gl = null;

    const fallback = () => { hero.classList.remove("gl-ready"); gl = null; };
    gl = createRenderer(hero, fallback);
    if (gl) {
      gl.load().then(() => {
        if (!gl) return;
        hero.classList.add("gl-ready");
        if (still) requestAnimationFrame(() => gl.draw(cx, cy, 0, 1));
      }).catch(fallback);
    }

    const cssLight = () => {
      hero.style.setProperty("--mx", (cx * 100).toFixed(2) + "%");
      hero.style.setProperty("--my", (cy * 100).toFixed(2) + "%");
    };

    const onMove = (ev) => {
      const r = hero.getBoundingClientRect();
      tx = (ev.clientX - r.left) / r.width;
      ty = (ev.clientY - r.top) / r.height;
      active = true;
      clearTimeout(idle);
      idle = setTimeout(() => { active = false; }, 2500);
      if (still) { cx = tx; cy = ty; gl ? gl.draw(cx, cy, 0, 1) : cssLight(); }
    };
    hero.addEventListener("pointermove", onMove, { passive: true });
    hero.addEventListener("pointerdown", onMove, { passive: true });

    if (still) {
      // Hareket yok: ışık sabit; yalnızca boyut değişince yeniden çizilir.
      hero.style.setProperty("--r", "40vmax");
      const ro = new ResizeObserver(() => requestAnimationFrame(() => gl?.draw(cx, cy, 0, 1)));
      ro.observe(hero);
      return () => { ro.disconnect(); hero.removeEventListener("pointermove", onMove); hero.removeEventListener("pointerdown", onMove); gl?.destroy(); };
    }

    const tick = (t) => {
      if (!active) {                       // imleç yokken süzülme
        tx = 0.5 + 0.28 * Math.sin(t / 2600);
        ty = 0.58 + 0.16 * Math.sin(t / 1700 + 1);
      }
      cx += (tx - cx) * 0.07;              // atalet: ışık imleci yumuşakça takip eder
      cy += (ty - cy) * 0.07;
      // Hero'dan çıkarken ışık yavaşça kısılır (exit: 0–1, ScrollTrigger yazar).
      if (gl && hero.classList.contains("gl-ready")) gl.draw(cx, cy, t, YULA.hero.intensity * (1 - 0.6 * YULA.hero.exit));
      else cssLight();
      raf = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); };

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); });
    io.observe(hero);
    document.addEventListener("visibilitychange", wake);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      clearTimeout(idle);
      document.removeEventListener("visibilitychange", wake);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerdown", onMove);
      gl?.destroy();
    };
  });
})();

/* 25-intro.js */
/* Açılış koreografisi (GSAP).
   1) Preloader (yalnızca oturumdaki ilk ziyaret): vektör logo kendi çizgileri boyunca yazılır
      (Y, U, L, A; kalem yönünde), yükleme bitince dört harf kapı kanatları gibi köşelerine ayrılır.
   2) Hero: sahne bulanık ve yakından netleşir, ışık yanar, başlık satır satır maskeden
      yükselir, yan metin ve header belirir.
   CSS'te her öğenin bir "failsafe" animasyonu vardır: JS/GSAP çalışmazsa içerik yine
   birkaç saniye içinde görünür. JS kontrolü aldığında .intro-ctl sınıfıyla bunları iptal eder. */
(function () {
  const MAX_PRELOAD = 3200;    // ms: yavaş bağlantıda bile en fazla bu kadar beklenir

  YULA.module("intro", () => {
    const html = document.documentElement;
    const hero = YULA.$("[data-hero]");
    const pre = YULA.$(".preloader");
    const preloading = html.classList.contains("is-preloading") && pre;
    const gsap = window.gsap;

    const finishPreloader = () => {
      html.classList.remove("is-preloading");
      try { sessionStorage.setItem("yula:intro", "1"); } catch (e) { /* yok say */ }
    };

    if (!gsap || YULA.reducedMotion()) {
      finishPreloader();
      if (hero) hero.classList.add("intro-ctl", "intro-done");
      YULA.$("[data-header]")?.classList.add("intro-ctl");
      return;
    }

    const tl = gsap.timeline({ defaults: { ease: "expo.out" }, paused: !!preloading });
    const header = YULA.$("[data-header]");
    if (header) header.classList.add("intro-ctl");

    // --- 1) Preloader ---------------------------------------------------------
    if (preloading) {
      pre.classList.add("intro-ctl");
      const strokes = YULA.$$("[data-stroke]", pre);
      const by = (k) => strokes.find((p) => p.dataset.stroke === k);
      const text = YULA.$("[data-pre-text]", pre);
      const svg = YULA.$(".preloader__svg", pre);
      const q = (k) => YULA.$(`.preloader__q--${k}`, pre);
      const heroImg = hero && YULA.$(".hero__base img", hero);
      const imgReady = !heroImg ? null
        : heroImg.complete ? heroImg.decode().catch(() => {})
        : new Promise((r) => { heroImg.addEventListener("load", r, { once: true }); heroImg.addEventListener("error", r, { once: true }); });
      const loaded = Promise.all([document.fonts ? document.fonts.ready : null, imgReady]);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));

      // yazılış: harfler kalem yönünde, Y -> U -> L -> A; önce kalın gövde, sonra ince çizgi
      text.setAttribute("width", "0");
      const pen = (k) => ({ attr: { "stroke-dashoffset": 0 }, ease: "power2.inOut", duration: 1 });
      const draw = gsap.timeline({ delay: 0.25 })
        .to(by("y1"), { ...pen(), duration: 1.15 }, 0)
        .to(by("y2"), { ...pen(), duration: 0.55 }, 0.55)
        .to(by("u"), { ...pen(), duration: 1.15 }, 0.7)
        .to(by("l"), { ...pen(), duration: 0.8 }, 1.35)
        .to(by("a"), { ...pen(), duration: 1.15 }, 1.7)
        .to(by("a2"), { ...pen(), duration: 0.45 }, 2.6)
        .to(text, { attr: { width: 358 }, duration: 0.9, ease: "power2.inOut" }, 2.75);
      const drawn = new Promise((r) => draw.eventCallback("onComplete", r));

      Promise.all([Promise.race([loaded, wait(MAX_PRELOAD + 2000)]), drawn]).then(() => {
        // dört harf, kapı kanatları gibi köşelerine ayrılır; aradan site görünür
        const vw = window.innerWidth, vh = window.innerHeight;
        const dx = Math.min(vw * 0.32, 520), dy = Math.min(vh * 0.26, 320);
        tl.add(() => { gsap.set(YULA.$$(".preloader__q", pre), { visibility: "visible" }); gsap.set(svg, { autoAlpha: 0 }); }, "+=0.35")
          .to(q("y"), { x: -dx, y: -dy, autoAlpha: 0, duration: 1.4, ease: "expo.inOut" })
          .to(q("u"), { x: dx, y: -dy, autoAlpha: 0, duration: 1.4, ease: "expo.inOut" }, "<")
          .to(q("l"), { x: -dx, y: dy, autoAlpha: 0, duration: 1.4, ease: "expo.inOut" }, "<")
          .to(q("a"), { x: dx, y: dy, autoAlpha: 0, duration: 1.4, ease: "expo.inOut" }, "<")
          .to(q("t"), { y: dy * 1.2, autoAlpha: 0, duration: 1.2, ease: "expo.inOut" }, "<")
          .to(pre, { autoAlpha: 0, duration: 0.9, ease: "power2.inOut", onComplete: finishPreloader }, "<0.45")
          .add(heroIntro(), "<0.1");
        tl.play();
      });
    } else {
      finishPreloader();
      tl.add(heroIntro(), 0.05);
    }

    // --- 2) Hero ----------------------------------------------------------------
    function heroIntro() {
      const t = gsap.timeline({ defaults: { ease: "expo.out" } });
      if (header) t.fromTo(header, { autoAlpha: 0, y: -16 }, { autoAlpha: 1, y: 0, duration: 1.2, clearProps: "transform,opacity,visibility" }, 0.6);
      if (!hero) return t;

      hero.classList.add("intro-ctl");
      const stage = YULA.$(".hero__stage", hero);
      const title = YULA.$(".hero__title", hero);
      const label = YULA.$(".hero__head .label", hero);
      const aside = YULA.$(".hero__aside", hero);
      const split = YULA.splitLines(title);
      gsap.set(title, { autoAlpha: 1 });
      YULA.hero.intensity = 0;

      t.fromTo(stage, { scale: 1.18, filter: "blur(16px)" }, { scale: 1, filter: "blur(0px)", duration: 2.6, clearProps: "transform,filter" }, 0)
        .to(YULA.hero, { intensity: 1, duration: 2.2, ease: "power2.out" }, 0)
        .fromTo(label, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1.2 }, 0.55)
        .fromTo(split.lines, { yPercent: 112 }, { yPercent: 0, duration: 1.6, stagger: 0.12 }, 0.6)
        .fromTo(aside, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 1.4 }, 1.05)
        .add(() => { split.revert(); hero.classList.add("intro-done"); });
      return t;
    }

    return () => tl.kill();
  });
})();

/* 30-scroll-motion.js */
/* Kaydırmaya bağlı animasyonlar (GSAP ScrollTrigger). Hepsi tek bir gsap.context içinde
   kurulur; destroy() ile (faz e: sayfa geçişleri) tamamen geri alınır.

   Öğeler işaretlemeden seçilir:
   [data-reveal]   yumuşak yukarı belirme (yakın öğeler sırayla, ScrollTrigger.batch)
   [data-split]    başlık satırları maskeden yükselir
   [data-words]    alıntı: kaydırdıkça kelime kelime koyulaşır (scrub)
   .shot[data-shot] görsel perde gibi aşağıdan açılır, içi hafifçe yakınlaşır;
                   masaüstünde görsel çerçevesinde hafif paralaks
   [data-slice]    (mutfak) görselin üstünden çapraz bir bıçak çizgisi geçer, örtü
                   dilimleri sırayla aşağı / yukarı kayarak görseli açar
   [data-rule]     ince çizgi soldan sağa çizilir
   [data-services] Hizmetler: madde değiştikçe yandaki yapışkan görsel değişir
   [data-hero]     hero'dan çıkarken içerik yukarı kayar, ışık kısılır

   Hareketi azalt tercihinde hiçbiri kurulmaz; içerik olduğu gibi görünür. */
(function () {
  const EASE = "expo.out";

  YULA.module("scroll-motion", (root) => {
    const { gsap, ScrollTrigger } = window;
    if (!gsap || !ScrollTrigger || YULA.reducedMotion()) return;
    const mm = gsap.matchMedia();
    const reverts = [];

    const ctx = gsap.context(() => {
      // --- Genel belirme ---------------------------------------------------
      const reveals = YULA.$$("[data-reveal]", root);
      gsap.set(reveals, { autoAlpha: 0, y: 40 });
      ScrollTrigger.batch(reveals, {
        start: "top 90%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 1.4, ease: EASE, stagger: 0.12, overwrite: true }),
      });

      // --- Başlık satırları --------------------------------------------------
      YULA.$$("[data-split]", root).forEach((el) => {
        const split = YULA.splitLines(el);
        reverts.push(split.revert);
        gsap.fromTo(split.lines, { yPercent: 112 }, {
          yPercent: 0, duration: 1.5, ease: EASE, stagger: 0.1,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
          onComplete: () => split.revert(),   // satırlar yeniden boyutlandırmada bozulmasın
        });
      });

      // --- Alıntı: kelime kelime koyulaşma -------------------------------------
      YULA.$$("[data-words]", root).forEach((el) => {
        const split = YULA.splitWords(el);
        reverts.push(split.revert);
        gsap.fromTo(split.words, { opacity: 0.12 }, {
          opacity: 1, ease: "none", stagger: 0.08,
          scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 50%", scrub: 0.6 },
        });
      });

      // --- Görsel perdesi ------------------------------------------------------
      YULA.$$(".shot[data-shot]", root).forEach((shot) => {
        const img = shot.querySelector("img");
        if (shot.hasAttribute("data-slice")) {
          // Dilimler: zemin renginde, çapraz duran şeritler; bıçak çizgisi geçtikçe kayar
          const wrap = document.createElement("span");
          wrap.className = "slice";
          wrap.setAttribute("aria-hidden", "true");
          const strips = Array.from({ length: 6 }, () => {
            const st = document.createElement("span");
            st.className = "slice__strip";
            wrap.append(st);
            return st;
          });
          const blade = document.createElement("span");
          blade.className = "slice__blade";
          wrap.append(blade);
          shot.append(wrap);
          reverts.push(() => wrap.remove());
          gsap.timeline({ scrollTrigger: { trigger: shot, start: "top 82%", once: true }, onComplete: () => wrap.remove() })
            .fromTo(blade, { xPercent: -8 }, { xPercent: 108, duration: 0.85, ease: "power2.inOut" })
            .to(strips, { yPercent: (i) => (i % 2 ? -112 : 112), duration: 1.05, ease: "expo.inOut", stagger: 0.09 }, 0.12)
            .fromTo(img, { scale: 1.18 }, { scale: 1, duration: 2.2, ease: EASE, clearProps: "transform" }, 0.15);
          return;
        }
        gsap.timeline({ scrollTrigger: { trigger: shot, start: "top 92%", once: true } })
          .fromTo(shot, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.5, ease: "expo.inOut" })
          .fromTo(img, { scale: 1.3 }, { scale: 1, duration: 2, ease: EASE, clearProps: "transform" }, 0.1);
      });

      // --- El yazısı: kelime soldan sağa "yazılır" ------------------------------------
      YULA.$$("[data-write]", root).forEach((el) => {
        gsap.fromTo(el, { clipPath: "inset(-20% 100% -20% 0%)" }, {
          clipPath: "inset(-20% 0% -20% 0%)", duration: 1.8, ease: "power2.inOut",
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      });

      // --- Çizgiler ---------------------------------------------------------------
      YULA.$$("[data-rule]", root).forEach((rule) => {
        gsap.fromTo(rule, { scaleX: 0 }, {
          scaleX: 1, duration: 1.6, ease: "expo.inOut",
          scrollTrigger: { trigger: rule, start: "top 92%", once: true },
        });
      });

      // --- Hero çıkışı -------------------------------------------------------------
      const hero = YULA.$("[data-hero]", root);
      if (hero) {
        gsap.to(YULA.$(".hero__content", hero), {
          yPercent: -18, autoAlpha: 0.15, ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
        });
        ScrollTrigger.create({
          trigger: hero, start: "top top", end: "bottom top",
          onUpdate: (self) => { YULA.hero.exit = self.progress; },
        });
      }

      // --- Masaüstüne özel: paralaks + Hizmetler görselleri -----------------------
      mm.add("(min-width: 64rem)", () => {
        YULA.$$("[data-parallax]", root).forEach((el) => {
          gsap.fromTo(el, { yPercent: -6 }, {
            yPercent: 6, ease: "none",
            scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true },
          });
        });

        const services = YULA.$("[data-services]", root);
        if (services) {
          const items = YULA.$$(".services__item", services);
          const media = YULA.$$(".services__media .shot", services);
          let active = -1;
          const activate = (i) => {
            if (i === active) return;
            const prev = active;
            active = i;
            items.forEach((it, n) => it.classList.toggle("is-active", n === i));
            media.forEach((m, n) => { m.style.zIndex = n === i ? 2 : n === prev ? 1 : 0; });
            gsap.fromTo(media[i], { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2, ease: "expo.inOut", overwrite: true });
            gsap.fromTo(media[i].querySelector("img"), { scale: 1.2 }, { scale: 1, duration: 1.8, ease: EASE, overwrite: true });
          };
          services.classList.add("is-live");
          activate(0);
          items.forEach((it, i) => ScrollTrigger.create({
            trigger: it, start: "top 55%", end: "bottom 55%",
            onToggle: (self) => self.isActive && activate(i),
          }));
          return () => { services.classList.remove("is-live"); items.forEach((it) => it.classList.remove("is-active")); };
        }
      });
    }, root === document ? document.body : root);

    // Fontlar yüklenince ölçüler değişir; tetik noktalarını yeniden hesapla.
    if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());

    return () => {
      mm.revert();
      ctx.revert();
      reverts.forEach((fn) => fn());
    };
  });
})();

/* 35-sequence.js */
/* Kamera çekimleri: 3ds Max + Corona ile render'lanmış kare dizileri, kaydırmayla oynatılır.
   Ana sayfada art arda dizilen bölümler tek bir yolculuk gibi akar: her sahne karanlıktan
   "ışık yanarak" açılır, sonunda ışık söner ve bir sonraki sahne aynı karanlıktan doğar.

   Bellek (önemli): kareler SIKIŞTIRILMIŞ halde (Blob, kare başına 30-70 KB) tutulur.
   Yalnızca bulunulan noktanın çevresindeki birkaç kare, tuval boyutunda ImageBitmap'e
   açılır (ana iş parçacığı dışında); uzaklaşanlar ve ekrandan çıkan sahnenin tüm açık
   kareleri hemen serbest bırakılır. (Tüm kareleri <img> olarak açık tutmak GB'larca bellek
   ister ve sekmeyi çökertir.)

   Akıcılık: render'lar arasına ffmpeg ile ara kareler (tools/sequence.py), WebP, iki kare
   arası kesirli karışım, ilk kareler önce iner.
   Bıçak kesişi (data-cut-to): sahnenin son bölümünde bir bıçak ışığı kadrajı çapraz keser,
   iki yarı kesik boyunca ayrılıp kayar ve altından sonraki çekimin ilk karesi açılır
   (renk kırılması, "şşık" sesi). Sonraki bölüm (data-cut-in) bu sahnenin altına biner;
   kesiş bittiğinde iki bölüm aynı kareyi gösterdiği için geçiş dikişsizdir.
   Başlık kesişi (.walk__caption--slice): başlık altyazısı belirince bıçakla çapraz bölünür.

   Hareketi azalt tercihinde sabitleme yok: son kare tek görsel olarak gösterilir. */
(function () {
  // Hafif modda (veri tasarrufu / yavaş bağlantı / az bellek) daha dar pencere ve en küçük kareler.
  const LITE = YULA.lite();
  const WINDOW = LITE ? 8 : 14;        // açık tutulan kare yarıçapı (önde / arkada)
  const RELEASE = LITE ? 11 : 18;      // bunun ötesindekiler serbest bırakılır
  const CUT = 0.72;                    // bıçak kesişinin başladığı ilerleme
  const SWEEP = 0.32;                  // kesişin ilk bölümü: bıçak ışığı kadrajı boydan geçer
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /** Başlığı iki çapraz yarıya böler (bıçak çizgisiyle); geri alma fonksiyonu döner. */
  function sliceTitle(cap) {
    const text = cap.textContent;
    const make = (tag, cls, txt) => {
      const el = document.createElement(tag);
      el.className = cls;
      if (txt) el.textContent = txt;
      return el;
    };
    const cut = make("span", "cut");
    cut.setAttribute("aria-hidden", "true");
    cut.append(make("span", "cut__a", text), make("span", "cut__b", text), make("span", "cut__line"));
    cap.textContent = "";
    cap.append(make("span", "sr-only", text), cut);
    return () => { cap.textContent = text; };
  }

  /** Tek bir kare dizisi bölümünü kurar; temizleme fonksiyonu döner. */
  function setupSequence(section) {
    const { gsap, ScrollTrigger } = window;
    if (section.dataset.height) section.style.setProperty("--walk-h", section.dataset.height + "vh");
    const canvas = YULA.$("canvas", section);
    const dim = YULA.$(".walk__dim", section);
    const ctx = canvas.getContext("2d", { alpha: false });
    const count = +section.dataset.count;
    const base = section.dataset.base;
    const widths = section.dataset.widths.split(",").map(Number);
    const ext = section.dataset.ext || "webp";
    const pad = +(section.dataset.pad || 3);
    const fadeOut = section.hasAttribute("data-fade-out");
    const cutBase = section.dataset.cutTo || "";
    const cutIn = section.hasAttribute("data-cut-in");
    const sticky = YULA.$(".walk__sticky", section);
    let cutBlob = null, cutBmp = null, cutPending = false, prog = 0;
    const frames = new Array(count);                    // { blob, bmp, pending }
    let width = widths[0], started = false, dead = false, near = false;
    let pos = 0, lastKey = "", painted = false;

    const ver = section.dataset.v ? `?v=${section.dataset.v}` : "";   // önbellek sürümü (build.py)
    const fileFor = (i) => `${base}${width}/${String(i).padStart(pad, "0")}.${ext}${ver}`;
    // Sonraki çekim de aynı kuralla genişlik seçer: kesişin altındaki kare onunkiyle birebir aynı olur.
    // Ekrandaki gerçek piksel genişliğini karşılayan en küçük boy (yoksa en büyüğü).
    const pickFrom = (list) => {
      if (LITE) return list[0];
      const px = (canvas.clientWidth || window.innerWidth) * Math.min(window.devicePixelRatio || 1, 2);
      return list.find((w) => w >= px * 0.92) || list[list.length - 1];
    };
    const pickWidth = () => pickFrom(widths);

    const releaseAll = () => {
      frames.forEach((f) => { if (f && f.bmp) { f.bmp.close(); f.bmp = null; } });
      if (cutBmp) { cutBmp.close(); cutBmp = null; }
      lastKey = "";
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.min(Math.round(canvas.clientWidth * dpr), width);
      if (!w) return;
      const h = Math.round(w * canvas.clientHeight / canvas.clientWidth);
      if (canvas.width === w && canvas.height === h && painted) return;   // değişiklik yoksa sıfırlama
      canvas.width = w;
      canvas.height = Math.round(w * canvas.clientHeight / canvas.clientWidth);
      releaseAll();
      painted = false;
      warm(Math.round(pos));
    };

    // --- Açık kare penceresi ---------------------------------------------------------
    const coverSize = (iw, ih) => {
      const s = Math.max(canvas.width / iw, canvas.height / ih);
      return [Math.max(1, Math.round(iw * s)), Math.max(1, Math.round(ih * s))];
    };
    let natural = null;                                 // [w, h] (ilk açılan kareden)
    function warm(center) {
      if (!near || !window.createImageBitmap || !canvas.width) return;
      const lo = Math.max(0, center - RELEASE - 4), hi = Math.min(count - 1, center + RELEASE + 4);
      for (let i = lo; i <= hi; i++) {
        const f = frames[i];
        if (!f) continue;
        const d = Math.abs(i - center);
        if (d <= WINDOW && f.blob && !f.bmp && !f.pending) {
          f.pending = true;
          const opts = natural
            ? (() => { const [w, h] = coverSize(natural[0], natural[1]); return { resizeWidth: w, resizeHeight: h, resizeQuality: "medium" }; })()
            : {};
          createImageBitmap(f.blob, opts)
            .then((b) => {
              f.pending = false;
              if (dead || !near) { b.close(); return; }
              if (!natural) natural = [b.width, b.height];
              f.bmp = b;
              if (Math.abs(i - pos) < 2 || !painted) { lastKey = ""; render(); }
              else if (frames[Math.round(pos)]?.bmp == null) render();
            })
            .catch(() => { f.pending = false; });
        } else if (d > RELEASE && f.bmp) {
          f.bmp.close();
          f.bmp = null;
        }
      }
      warmCut();
    }

    // Kesişin altından açılacak kare (sonraki çekimin ilk karesi): yalnızca sahne yakındayken açık.
    // Tek kare olduğu için kaynak boyutunda çözülür (çizerken ölçeklenir).
    function warmCut() {
      if (!cutBlob || cutBmp || cutPending || !near) return;
      cutPending = true;
      createImageBitmap(cutBlob)
        .then((b) => {
          cutPending = false;
          if (dead || !near) { b.close(); return; }
          cutBmp = b;
          if (prog > CUT) { lastKey = ""; render(); }
        })
        .catch(() => { cutPending = false; });
    }

    const nearestOpen = (i) => {
      for (let o = 0; o < count; o++) {
        if (frames[i - o]?.bmp) return i - o;
        if (frames[i + o]?.bmp) return i + o;
      }
      return -1;
    };
    const paintBmp = (b, zoom = 1) => {
      const s = Math.max(canvas.width / b.width, canvas.height / b.height) * zoom;
      const w = b.width * s, h = b.height * s;
      ctx.drawImage(b, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };
    const paint = (i, alpha) => {
      ctx.globalAlpha = alpha;
      paintBmp(frames[i].bmp);
    };

    // --- Bıçak kesişi ---------------------------------------------------------------------
    // Kesik: sağ üstten sol alta çapraz. q: 0..SWEEP bıçak ışığı geçer, SWEEP..1 yarılar ayrılır.
    function drawCut(i, q) {
      const W = canvas.width, H = canvas.height, k = W / 1600;
      const ax = W * 0.8, ay = -H * 0.04, bx = W * 0.22, by = H * 1.04;
      const len = Math.hypot(bx - ax, by - ay);
      const dx = (bx - ax) / len, dy = (by - ay) / len;
      const nx = -dy, ny = dx;
      const sw = Math.min(1, q / SWEEP);
      const sep = q <= SWEEP ? 0 : smooth((q - SWEEP) / (1 - SWEEP));
      const b = frames[i].bmp;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (sep === 0) {
        paintBmp(b);
      } else {
        // Altta: sonraki çekimin ilk karesi, hafif yakından netleşerek gelir
        ctx.fillStyle = "#110b0d";
        ctx.fillRect(0, 0, W, H);
        if (cutBmp) {
          ctx.globalAlpha = Math.min(1, 0.3 + sep * 0.9);
          paintBmp(cutBmp, 1.06 - 0.06 * sep);
          ctx.globalAlpha = 1;
        }
        // Yarıların ekrandan tamamen çıkması için gereken uzaklık (en uzak köşe)
        let far = 0;
        for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) far = Math.max(far, Math.abs((cx - ax) * nx + (cy - ay) * ny));
        const big = W + H;
        for (const side of [1, -1]) {
          const ox = nx * side * sep * (far + 8) - dx * side * sep * H * 0.08;
          const oy = ny * side * sep * (far + 8) - dy * side * sep * H * 0.08;
          ctx.save();
          ctx.translate(ox, oy);
          ctx.beginPath();
          ctx.moveTo(ax - dx * big, ay - dy * big);
          ctx.lineTo(bx + dx * big, by + dy * big);
          ctx.lineTo(bx + dx * big + nx * side * big, by + dy * big + ny * side * big);
          ctx.lineTo(ax - dx * big + nx * side * big, ay - dy * big + ny * side * big);
          ctx.closePath();
          ctx.clip();
          paintBmp(b);
          // kesik yüzü: ince parlak kenar, iki yarıda ayrı renk (renk kırılması)
          const fade = Math.pow(1 - sep, 1.6);
          if (fade > 0.01) {
            ctx.globalCompositeOperation = "lighter";
            ctx.strokeStyle = side > 0 ? `rgba(255, 120, 96, ${(0.55 * fade).toFixed(3)})` : `rgba(110, 200, 255, ${(0.55 * fade).toFixed(3)})`;
            ctx.lineWidth = 3 * k;
            ctx.beginPath();
            ctx.moveTo(ax - dx * big + nx * side * 2 * k, ay - dy * big + ny * side * 2 * k);
            ctx.lineTo(bx + dx * big + nx * side * 2 * k, by + dy * big + ny * side * 2 * k);
            ctx.stroke();
            ctx.globalCompositeOperation = "source-over";
          }
          ctx.restore();
        }
      }

      // Bıçak ışığı: kesik boyunca ilerleyen parlak uç ve arkasında kalan ince çizgi
      const glow = sep === 0 ? 1 : Math.max(0, 1 - sep * 3);
      if (glow > 0) {
        const t = easeOut(sw);
        const tx = ax + (bx - ax) * t, ty = ay + (by - ay) * t;
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createLinearGradient(ax, ay, tx + dx, ty + dy);
        g.addColorStop(0, "rgba(255, 238, 220, 0.25)");
        g.addColorStop(0.8, "rgba(255, 238, 220, 0.55)");
        g.addColorStop(1, "rgba(255, 250, 244, 1)");
        ctx.strokeStyle = g;
        ctx.lineCap = "round";
        for (const [wd, al] of [[14, 0.18], [4.5, 0.5], [1.4, 1]]) {
          ctx.globalAlpha = al * glow;
          ctx.lineWidth = wd * k;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
        if (sw < 1) {
          // ucun parlaması
          const r = 90 * k;
          const fl = ctx.createRadialGradient(tx, ty, 0, tx, ty, r);
          fl.addColorStop(0, "rgba(255, 252, 246, 0.9)");
          fl.addColorStop(0.25, "rgba(255, 228, 200, 0.35)");
          fl.addColorStop(1, "rgba(255, 228, 200, 0)");
          ctx.globalAlpha = glow;
          ctx.fillStyle = fl;
          ctx.fillRect(tx - r, ty - r, r * 2, r * 2);
        }
        // kesik tamamlanınca kısa bir ışık nabzı
        const flash = Math.max(0, 1 - Math.abs(q - SWEEP) / 0.05) * 0.12;
        if (flash > 0) {
          ctx.globalAlpha = flash;
          ctx.fillStyle = "#fff6ec";
          ctx.fillRect(0, 0, W, H);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }

    // Çizim: en yakın GERÇEK kare, saydam karışım yok (karışım hızlı harekette çift görüntü yapıyordu).
    function render() {
      if (!canvas.width) return;
      const a = Math.min(count - 1, Math.round(pos));
      const fa = frames[a]?.bmp ? a : nearestOpen(a);
      if (fa < 0) return;
      const q = cutBase ? Math.max(0, Math.min(1, (prog - CUT) / (1 - CUT))) : 0;
      const key = q > 0 ? `${fa}:${q.toFixed(4)}:${cutBmp ? 1 : 0}` : String(fa);
      if (key === lastKey) return;
      lastKey = key;
      if (q > 0 && !cutBmp) warmCut();
      if (q > 0) drawCut(fa, q);
      else paint(fa, 1);
      ctx.globalAlpha = 1;
      painted = true;
    }

    // --- İndirme (sıkıştırılmış) -------------------------------------------------------
    const load = async (i) => {
      if (frames[i] || dead) return;
      frames[i] = { blob: null, bmp: null, pending: false };
      try {
        const r = await fetch(fileFor(i));
        if (!r.ok) return;
        frames[i].blob = await r.blob();
        if (Math.abs(i - pos) <= WINDOW) warm(Math.round(pos));
      } catch (e) { /* ağ hatası: o kare atlanır, en yakın kare çizilir */ }
    };
    const loadCut = async () => {
      if (!cutBase || cutBlob || dead) return;
      const cw = section.dataset.cutWidths.split(",").map(Number);
      const v = section.dataset.cutV ? `?v=${section.dataset.cutV}` : "";
      try {
        const r = await fetch(`${cutBase}${pickFrom(cw)}/${"0".padStart(+(section.dataset.cutPad || 3), "0")}.${ext}${v}`);
        if (r.ok) { cutBlob = await r.blob(); warmCut(); }
      } catch (e) { /* kesişin altı koyu kalır */ }
    };
    const loadAll = async () => {
      width = pickWidth();
      resize();
      const order = [];
      const seen = new Set();
      const push = (i) => { if (i >= 0 && i < count && !seen.has(i)) { seen.add(i); order.push(i); } };
      for (let i = 0; i < Math.min(24, count); i++) push(i);
      push(count - 1);
      for (const step of [8, 4, 2, 1]) for (let i = 0; i < count; i += step) push(i);
      let k = 0;
      const worker = async () => { while (k < order.length && !dead) await load(order[k++]); };
      await Promise.all([...Array.from({ length: 4 }, worker), loadCut()]);
    };
    const start = () => { if (!started && !dead) { started = true; loadAll(); } };

    // Yakınlık: ekrana yaklaşınca açık kareleri hazırla, uzaklaşınca belleği boşalt.
    const io = new IntersectionObserver(([e]) => {
      near = e.isIntersecting;
      if (near) { start(); warm(Math.round(pos)); render(); }
      else releaseAll();
    }, { rootMargin: "120% 0px" });
    io.observe(section);
    // İndirme (yalnızca sıkıştırılmış veri) sayfa boşa çıkınca erkenden başlar.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const idleId = idle(() => start(), { timeout: 4000 });
    // Tuvalin ekrandaki boyutu değişince (düzen oturması, pencere) yeniden boyutlandır.
    let lastSize = "";
    const ro = new ResizeObserver(() => {
      const s = canvas.clientWidth + "x" + canvas.clientHeight;
      if (s !== lastSize) { lastSize = s; resize(); }
    });
    ro.observe(canvas);

    const unslice = YULA.$$(".walk__caption--slice", section).map(sliceTitle);
    const cleanup = () => {
      dead = true;
      unslice.forEach((fn) => fn());
      sticky.style.visibility = "";
      io.disconnect();
      if (window.cancelIdleCallback) window.cancelIdleCallback(idleId);
      ro.disconnect();
      releaseAll();
      frames.length = 0;
    };

    // --- Hareketi azalt: sabit son kare ----------------------------------------
    if (!gsap || !ScrollTrigger || YULA.reducedMotion()) {
      section.classList.add("is-static");
      started = true;
      pos = count - 1;
      if (dim) dim.style.opacity = "0";
      width = pickWidth();
      resize();
      load(count - 1);
      return cleanup;
    }

    // --- Kaydırma ----------------------------------------------------------------
    const captions = YULA.$$("[data-from]", section);
    const ambKind = section.dataset.ambience || "";
    const quiet = () => { if (ambKind && YULA.audio && YULA.audio.ambience) YULA.audio.ambience(ambKind, 0); };
    let lastCenter = -99;
    if (cutIn && dim) dim.style.opacity = "0";       // kesişin altından aydınlık açılır
    const st = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.25,
      // Kesiş bitince bu bölüm gizlenir: altındaki sonraki çekim aynı kareyle devralır.
      onLeave: () => { if (cutBase) sticky.style.visibility = "hidden"; quiet(); },
      onLeaveBack: quiet,
      onEnterBack: () => { sticky.style.visibility = ""; },
      onUpdate: (self) => {
        const p = self.progress;
        // ileri kaydırırken bıçak kesişe girdiği an: "şşık"
        if (cutBase && self.direction > 0 && prog < CUT + 0.01 && p >= CUT + 0.01 && YULA.audio) YULA.audio.slice();
        prog = p;
        pos = p * (count - 1);
        const c = Math.round(pos);
        if (Math.abs(c - lastCenter) >= 2) { lastCenter = c; warm(c); }
        render();
        if (dim) {
          const lit = Math.min(1, p / 0.14);
          let o = cutIn ? 0 : 0.9 * (1 - lit * lit);
          if (fadeOut && p > 0.88) { const q = (p - 0.88) / 0.12; o = Math.max(o, q * q); }
          dim.style.opacity = o.toFixed(3);
        }
        captions.forEach((cap) => cap.classList.toggle("is-on", p >= +cap.dataset.from && p <= +cap.dataset.to));
        // mekân sesi: sahnenin başında yavaşça açılır, sonunda kısılır
        if (ambKind && YULA.audio && YULA.audio.ambience) YULA.audio.ambience(ambKind, Math.min(1, p / 0.12, (1 - p) / 0.12));
      },
    });

    return () => { quiet(); st.kill(); cleanup(); };
  }

  YULA.module("sequence", (root) => {
    const cleanups = YULA.$$("[data-sequence]", root).map(setupSequence);
    return () => cleanups.forEach((fn) => fn && fn());
  });
})();

/* 37-chime.js */
/* Lamba perdesi: Melek'in salon lambasından (3ds Max + Corona render'ı) ince, boncuklu
   ipler sarkar. Fare / parmak iplerin arasından geçince hafifçe savrulur ve yavaşça
   durulur; ses açıksa imlecin tam üstünden geçtiği ip ince bir çan tınısı çalar.

   Fizik: her ip, birbirine sabit uzunlukla bağlı noktalar zinciri (Verlet entegrasyonu).
   İlk noktası abajura sabit, diğerleri yerçekimiyle sarkar. Hareket durulunca döngü uyur
   (pil / işlemci harcamaz); etkileşimle uyanır.

   Ses: dosya yok; Web Audio ile tarayıcıda sentezlenir. Uyumsuz nota çıkmasın diye
   pentatonik dizi, soldan sağa pesten tize. Ses her zaman açık; ancak tarayıcılar
   kullanıcı sayfayla ilk kez etkileşmeden (tıklama / dokunma / tuş) ses çalmaya izin
   vermez. Bu yüzden ses motoru sitedeki ilk tıklamada kendiliğinden hazır hale gelir.
   Hareketi azalt tercihinde ipler düz ve sabit çizilir. */
(function () {
  const SEGMENTS = 40;          // ip başına boncuk sayısı
  const STRANDS = 44;           // ip sayısı (ölçülen 34 noktanın arası doğrusal doldurulur)
  const GRAVITY = 1400;         // px/sn²
  const DAMPING = 0.986;
  const ITERATIONS = 8;         // uzunluk kısıtı çözüm adımı
  const RADIUS = 22;            // imlecin etki yarıçapı (px): küçük, ince bir dokunuş
  const PENTA = [0, 2, 4, 7, 9];
  const BASE_HZ = 392.0;        // Sol4: üç oktav boyunca sıcak, kulağı yormayan aralık

  /* --- Ses motoru (sayfa geçişlerinde korunur) ------------------------------------ */
  const audio = {
    ctx: null, master: null, enabled: false, recent: [],
    enable() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        const ctx = new AC();
        const master = ctx.createGain();
        master.gain.value = 0.55;
        // Basit, sıcak bir yankı: iki geri beslemeli gecikme + alçak geçiren süzgeç
        const tone = ctx.createBiquadFilter();
        tone.type = "lowpass";
        tone.frequency.value = 4200;
        const wet = ctx.createGain();
        wet.gain.value = 0.32;
        [0.137, 0.213].forEach((t) => {
          const d = ctx.createDelay(1);
          d.delayTime.value = t;
          const fb = ctx.createGain();
          fb.gain.value = 0.38;
          master.connect(d); d.connect(fb); fb.connect(d); d.connect(wet);
        });
        master.connect(tone);
        wet.connect(tone);
        tone.connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
      }
      if (this.ctx.state !== "running") {
        this.ctx.resume().catch(() => {});
        // iOS Safari: hareketin içinde kısa, sessiz bir ses çalmak ses motorunu tamamen açar.
        try {
          const s = this.ctx.createBufferSource();
          s.buffer = this.ctx.createBuffer(1, 1, 22050);
          s.connect(this.ctx.destination);
          s.start(0);
        } catch (e) { /* yok say */ }
      }
      this.enabled = true;
      return true;
    },
    disable() { this.enabled = false; },
    /** Çan: uyumsuz kısmi tonlar (gerçek çanlardaki gibi), hızlı vuruş, uzun sönüm. */
    ring(freq, velocity) {
      if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
      const now = this.ctx.currentTime;
      this.recent = this.recent.filter((t) => now - t < 0.12);
      if (this.recent.length >= 6) return;           // aynı anda en fazla 6 tını
      this.recent.push(now);
      const detune = 1 + (Math.random() - 0.5) * 0.004;
      const partials = [[1, 1, 2.6], [2.76, 0.42, 1.4], [5.4, 0.2, 0.8], [8.93, 0.09, 0.45]];
      const amp = 0.025 + 0.06 * velocity;
      partials.forEach(([ratio, gain, decay]) => {
        if (freq * ratio > 11000) return;            // duyulmayan / cızırtılı üst tonları atla
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq * ratio * detune;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(amp * gain, now + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        o.connect(g); g.connect(this.master);
        o.start(now);
        o.stop(now + decay + 0.05);
      });
    },
    /** Bıçak "şşık"ı: yükselen süzgeçli hava sesi + ardından ince çelik tınısı. */
    slice() {
      if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
      const ctx = this.ctx, now = ctx.currentTime;
      if (now - (this.lastSlice || -9) < 0.8) return;
      this.lastSlice = now;
      if (!this.noise) {
        const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.6), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
      }
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(1400, now);
      bp.frequency.exponentialRampToValueAtTime(8200, now + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.42, now + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(now);
      src.stop(now + 0.4);
      // çelik: uyumsuz yüksek kısmi tonlar, kısa
      [[2637, 0.05, 0.9], [3953, 0.032, 0.65], [5274, 0.02, 0.45], [7040, 0.012, 0.3]].forEach(([f, a, dec]) => {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        const t0 = now + 0.12;
        o.type = "sine";
        o.frequency.value = f;
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.exponentialRampToValueAtTime(a, t0 + 0.004);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + dec);
        o.connect(og); og.connect(this.master);
        o.start(t0);
        o.stop(t0 + dec + 0.05);
      });
    },
  };
  /* --- Mekân sesleri: sahne görünürken çok alçak bir ortam sesi ---------------------
     "water": çeşme (süzülmüş gürültü + yavaş dalgalanma + seyrek damla), "room": sıcak oda
     tonu (alçak geçiren kahverengi gürültü). level 0..1; değişiklikler yumuşak geçişli. */
  const amb = {};
  // Gerçek kayıtlar (Higgsfield Seed Audio, tools/higgs.py ile kesintisiz döngü): çeşme ve seans odası.
  // Kayıt inene/çözülene kadar ya da hata olursa aşağıdaki sentez devreye girer.
  const SAMPLES = { water: ["/audio/amb-water.mp3", 0.55], room: ["/audio/amb-room.mp3", 0.45] };
  const samp = {};
  function sampleAmbience(ctx, kind, level, now) {
    const def = SAMPLES[kind];
    if (!def) return false;
    let s = samp[kind];
    if (!s) {
      if (level <= 0.001) return true;
      s = samp[kind] = { state: "loading", level };
      fetch(def[0]).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => {
          const src = ctx.createBufferSource();
          src.buffer = buf; src.loop = true;
          const g = ctx.createGain();
          g.gain.value = 0;
          src.connect(g); g.connect(ctx.destination);
          src.start();
          s.g = g; s.state = "ready";
          g.gain.setTargetAtTime(def[1] * s.level, ctx.currentTime, 0.6);
        })
        .catch(() => { s.state = "fail"; });
      return true;
    }
    s.level = level;
    if (s.state === "fail") return false;
    if (s.state === "ready") {
      s.g.gain.cancelScheduledValues(now);
      s.g.gain.setTargetAtTime(def[1] * level, now, 0.6);
    }
    return true;
  }
  audio.ambience = function (kind, level) {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    const ctx = this.ctx, now = ctx.currentTime;
    if (sampleAmbience(ctx, kind, level, now)) return;
    let a = amb[kind];
    if (!a) {
      if (level <= 0.001) return;
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === "room") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f1 = ctx.createBiquadFilter();
      const g = ctx.createGain();
      g.gain.value = 0;
      if (kind === "water") {
        f1.type = "bandpass"; f1.frequency.value = 1100; f1.Q.value = 0.6;
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = 0.23; lg.gain.value = 420; lfo.connect(lg); lg.connect(f1.frequency); lfo.start();
      } else { f1.type = "lowpass"; f1.frequency.value = 240; }
      src.connect(f1); f1.connect(g); g.connect(ctx.destination);
      src.start();
      a = amb[kind] = { g, level: 0, drip: 0 };
    }
    const peak = kind === "water" ? 0.045 : 0.06;
    a.level = level;
    a.g.gain.cancelScheduledValues(now);
    a.g.gain.setTargetAtTime(peak * level, now, 0.35);
    // seyrek damlalar
    if (kind === "water" && level > 0.3 && now > a.drip) {
      a.drip = now + 0.7 + Math.random() * 2.2;
      const o = ctx.createOscillator(), og = ctx.createGain();
      const f = 1400 + Math.random() * 1300;
      o.type = "sine";
      o.frequency.setValueAtTime(f, now);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, now + 0.06);
      og.gain.setValueAtTime(0.0001, now);
      og.gain.exponentialRampToValueAtTime(0.018 * level, now + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      o.connect(og); og.connect(this.master);
      o.start(now); o.stop(now + 0.2);
    }
  };
  YULA.audio = audio;

  // --- Ses: sitedeki ilk etkileşimde kendiliğinden açılır -----------------------------
  // Tarayıcılar sesi yalnızca "etkinleştiren" bir hareketin içinde başlatır: fare tıklaması,
  // tuş, dokunmanın BİTİŞİ (touchend / pointerup). touchstart ve dokunmatik pointerdown
  // sayılmaz (telefonda ses hiç açılmıyordu); bu yüzden hepsini dinler, ses gerçekten
  // çalışır duruma geçene kadar dinlemeyi bırakmayız. Tüm site için tek sefer kurulur
  // (çanlar ve bıçak kesişi aynı motoru kullanır).
  const gestures = ["pointerdown", "pointerup", "touchend", "click", "keydown"];
  const detach = () => gestures.forEach((g) => document.removeEventListener(g, unlock, true));
  function unlock() {
    if (!audio.enable()) { detach(); return; }
    if (audio.ctx.state === "running") detach();
  }
  gestures.forEach((g) => document.addEventListener(g, unlock, { capture: true, passive: true }));

  YULA.module("chime", (root) => {
    const stage = YULA.$("[data-chime]", root);
    if (!stage) return;
    const canvas = YULA.$("canvas", stage);
    const lamp = YULA.$(".chime__lamp img", stage);
    const ctx = canvas.getContext("2d");
    const all = JSON.parse(stage.dataset.anchors);
    const anchorsN = Array.from({ length: STRANDS }, (_, i) => {
      const t = (i * (all.length - 1)) / (STRANDS - 1), k = Math.min(Math.floor(t), all.length - 2), f = t - k;
      return [all[k][0] + (all[k + 1][0] - all[k][0]) * f, all[k][1] + (all[k + 1][1] - all[k][1]) * f];
    });
    const still = YULA.reducedMotion();

    // Uzunluklar hafifçe farklı, etek organik dursun. Sabit tohum: her ziyarette aynı.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lengths = anchorsN.map(() => 0.92 + rand() * 0.08);

    let W = 0, H = 0, dpr = 1, seg = 12;
    let strands = [];               // [{ ax, ay, x[], y[], px[], py[], last, note }]
    let raf = 0, visible = false, calm = 0, lastT = 0;
    const pointer = { x: 0, y: 0, vx: 0, vy: 0, t: 0, active: false };

    // --- Yerleşim --------------------------------------------------------------------
    const layout = () => {
      const sr = stage.getBoundingClientRect();
      const lr = lamp.getBoundingClientRect();
      if (!sr.width || !lr.width) return;
      W = sr.width; H = sr.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const ox = lr.left - sr.left, oy = lr.top - sr.top;
      const anchors = anchorsN.map(([u, v]) => [ox + u * lr.width, oy + v * lr.height]);
      const top = Math.max(...anchors.map((a) => a[1]));
      seg = (H * 0.96 - top) / SEGMENTS;
      const fresh = strands.length !== anchors.length;
      strands = anchors.map(([ax, ay], i) => {
        const s = fresh ? { x: [], y: [], px: [], py: [], last: 0 } : strands[i];
        s.ax = ax; s.ay = ay; s.seg = seg * lengths[i];
        const steps = PENTA.length * 3;
        const k = Math.round((i / (anchors.length - 1)) * (steps - 1));
        s.note = BASE_HZ * Math.pow(2, (Math.floor(k / PENTA.length) * 12 + PENTA[k % PENTA.length]) / 12);
        for (let j = 0; j <= SEGMENTS; j++) {
          const yy = ay + j * s.seg;                 // ipler baştan sarkık durur
          s.x[j] = ax; s.y[j] = yy; s.px[j] = ax; s.py[j] = yy;
        }
        return s;
      });
      draw();
    };

    // --- Fizik -----------------------------------------------------------------------
    const step = (dt) => {
      const g = GRAVITY * dt * dt;
      let energy = 0;
      const pv = pointer.active;
      for (const s of strands) {
        for (let j = 1; j <= SEGMENTS; j++) {
          const vx = (s.x[j] - s.px[j]) * DAMPING;
          const vy = (s.y[j] - s.py[j]) * DAMPING;
          s.px[j] = s.x[j]; s.py[j] = s.y[j];
          s.x[j] += vx; s.y[j] += vy + g;
          if (pv) {
            const dx = s.x[j] - pointer.x, dy = s.y[j] - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d < RADIUS && d > 0.001) {
              const f = 1 - d / RADIUS;
              // imlecin hızıyla hafifçe sürüklenir; itme küçük ve yumuşak
              const v = Math.max(-900, Math.min(900, pointer.vx));
              s.x[j] += (v * dt * 0.35 + (dx / d) * (RADIUS - d) * 0.04) * f * f;
              s.y[j] += (pointer.vy * dt * 0.1) * f * f;
            }
          }
          energy += Math.abs(vx) + Math.abs(vy);
        }
        // Uzunluk kısıtı (ilk nokta abajura sabit)
        s.x[0] = s.ax; s.y[0] = s.ay;
        for (let it = 0; it < ITERATIONS; it++) {
          for (let j = 0; j < SEGMENTS; j++) {
            const dx = s.x[j + 1] - s.x[j], dy = s.y[j + 1] - s.y[j];
            const d = Math.hypot(dx, dy) || 0.0001;
            const diff = (d - s.seg) / d;
            if (j === 0) {
              s.x[1] -= dx * diff; s.y[1] -= dy * diff;
            } else {
              s.x[j] += dx * diff * 0.5; s.y[j] += dy * diff * 0.5;
              s.x[j + 1] -= dx * diff * 0.5; s.y[j + 1] -= dy * diff * 0.5;
            }
          }
        }
      }
      return energy;
    };

    // --- Çizim -----------------------------------------------------------------------
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // ipler: çok ince, yarı saydam çizgi
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "rgba(72, 31, 29, 0.28)";
      ctx.beginPath();
      for (const s of strands) {
        ctx.moveTo(s.x[0], s.y[0]);
        for (let j = 1; j <= SEGMENTS; j++) ctx.lineTo(s.x[j], s.y[j]);
      }
      ctx.stroke();
      // boncuklar: aşağı indikçe hafifçe soluklaşan küçük noktalar
      const r = Math.max(0.8, Math.min(1.5, seg * 0.12));
      for (let j = 1; j <= SEGMENTS; j++) {
        ctx.fillStyle = `rgba(72, 31, 29, ${(0.72 - 0.42 * (j / SEGMENTS)).toFixed(3)})`;
        ctx.beginPath();
        for (const s of strands) {
          ctx.moveTo(s.x[j] + r, s.y[j]);
          ctx.arc(s.x[j], s.y[j], r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }

    // --- Döngü (durulunca uyur) ----------------------------------------------------------
    const tick = (t) => {
      const dt = Math.min(0.033, lastT ? (t - lastT) / 1000 : 0.016);
      lastT = t;
      const e = step(dt / 2) + step(dt / 2);
      draw();
      calm = !pointer.active && e < strands.length * 0.05 ? calm + 1 : 0;
      raf = visible && calm < 45 ? requestAnimationFrame(tick) : 0;
      if (!raf) lastT = 0;
    };
    const wake = () => { calm = 0; if (!raf && visible && !still) raf = requestAnimationFrame(tick); };

    // --- Etkileşim -----------------------------------------------------------------------
    const local = (e) => {
      const r = stage.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    // İmlecin önceki ve şimdiki konumu arasında kalan, o yükseklikteki ipleri çal.
    const pluck = (x0, x1, y, speed) => {
      if (!audio.enabled) return;
      const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
      const now = performance.now();
      for (const s of strands) {
        if (y < s.y[0] || y > s.y[SEGMENTS]) continue;
        const j = Math.max(1, Math.min(SEGMENTS, Math.round((y - s.y[0]) / s.seg)));
        if (s.x[j] >= lo && s.x[j] <= hi && now - s.last > 200) {
          s.last = now;
          audio.ring(s.note, Math.min(1, speed / 1800));
        }
      }
    };
    const onMove = (e) => {
      const [x, y] = local(e);
      if (pointer.active) pluck(pointer.x, x, y, Math.hypot(pointer.vx, pointer.vy));
      const now = performance.now();
      const dt = Math.max(8, now - (pointer.t || now - 16)) / 1000;
      const nvx = pointer.active ? (x - pointer.x) / dt : 0;
      const nvy = pointer.active ? (y - pointer.y) / dt : 0;
      pointer.vx = pointer.vx * 0.5 + nvx * 0.5;
      pointer.vy = pointer.vy * 0.5 + nvy * 0.5;
      pointer.x = x; pointer.y = y; pointer.t = now; pointer.active = true;
      wake();
    };
    const onLeave = () => { pointer.active = false; pointer.vx = pointer.vy = 0; };

    // --- Kurulum -----------------------------------------------------------------------
    const ro = new ResizeObserver(() => layout());
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) wake();
    }, { threshold: 0.25 });

    const start = () => {
      layout();
      ro.observe(stage);
      if (still) return;
      io.observe(stage);
      stage.addEventListener("pointermove", onMove, { passive: true });
      stage.addEventListener("pointerdown", onMove, { passive: true });
      stage.addEventListener("pointerleave", onLeave);
      stage.addEventListener("pointercancel", onLeave);
    };
    const ready = () => Promise.all([
      document.fonts ? document.fonts.ready : null,
      lamp.complete ? null : new Promise((r) => { lamp.addEventListener("load", r, { once: true }); lamp.addEventListener("error", r, { once: true }); }),
    ]);
    ready().then(start);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerdown", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      stage.removeEventListener("pointercancel", onLeave);
    };
  });
})();

/* 40-lightbox.js */
/* Galeri ışık kutusu: native <dialog>, klavye (Esc, ←, →) ve dokunmatik kaydırma.
   DOM yalnızca createElement / textContent ile kurulur (Trusted Types uyumlu). */
(function () {
  YULA.module("lightbox", (root) => {
    const dialog = YULA.$("[data-lightbox]");
    const shots = YULA.$$("a.shot", root);
    if (!dialog || typeof dialog.showModal !== "function" || !shots.length) return;

    dialog.replaceChildren();
    const stage = document.createElement("div");
    stage.className = "lightbox__stage";
    const img = document.createElement("img");
    img.decoding = "async";
    stage.appendChild(img);
    const count = document.createElement("p");
    count.className = "lightbox__count label";
    count.setAttribute("aria-live", "polite");

    let index = 0;
    let opener = null;
    const show = (n) => {
      index = (n + shots.length) % shots.length;
      const a = shots[index];
      img.src = a.getAttribute("href");
      img.alt = a.querySelector("img").alt;
      count.textContent = `${index + 1} / ${shots.length}`;
    };
    const button = (cls, label, text, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.setAttribute("aria-label", label);
      b.textContent = text;
      b.addEventListener("click", (ev) => { ev.stopPropagation(); fn(); });
      return b;
    };
    dialog.append(
      stage,
      button("lightbox__close", dialog.dataset.close, "×", () => dialog.close()),
      button("lightbox__prev", dialog.dataset.prev, "‹", () => show(index - 1)),
      button("lightbox__next", dialog.dataset.next, "›", () => show(index + 1)),
      count
    );

    const open = (ev) => {
      ev.preventDefault();
      opener = ev.currentTarget;
      show(shots.indexOf(opener));
      dialog.showModal();
      YULA.lenis?.stop();   // arkadaki sayfa kaymasın
    };
    shots.forEach((a) => a.addEventListener("click", open));
    dialog.addEventListener("click", (ev) => { if (ev.target === dialog || ev.target === stage) dialog.close(); });
    dialog.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowRight") show(index + 1);
      if (ev.key === "ArrowLeft") show(index - 1);
    });
    dialog.addEventListener("close", () => { YULA.lenis?.start(); opener?.focus({ preventScroll: true }); });

    // Dokunmatik: yatay kaydırma ile önceki / sonraki
    let x0 = null;
    stage.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      x0 = null;
    });

    return () => shots.forEach((a) => a.removeEventListener("click", open));
  });
})();

/* 45-project-list.js */
/* Projeler indeksi.
   - Liste görünümü: masaüstünde imleci izleyen kapak önizlemesi (gsap.quickTo, ataletle).
   - Görsel görünüm: kapaklı ızgara. Seçim ziyaretçinin tarayıcısında hatırlanır.
   - Süzgeçler: tür ve mekân. Seçim adres satırına yazılır (?tur=…&mekan=…), böylece
     süzülmüş liste paylaşılabilir; geri / ileri gezinmeyi bozmamak için replaceState.
   Dokunmatik cihazlarda CSS her satırda küçük kapak gösterir; önizleme devreye girmez.
   Betik yoksa süzgeç çubuğu gizlidir ve liste olduğu gibi görünür. */
(function () {
  const VIEW_KEY = "yula:pview";
  const Q = { type: "tur", space: "mekan" };

  YULA.module("project-list", (root) => {
    const section = YULA.$("[data-pindex]", root);
    const list = YULA.$("[data-plist]", root);
    if (!section || !list) return;
    const gsap = window.gsap;
    const still = YULA.reducedMotion();
    const items = YULA.$$(".plist__item", list);
    const chips = YULA.$$("[data-filter]", section);
    const viewBtns = YULA.$$("[data-view-btn]", section);
    const countEl = YULA.$("[data-count]", section);
    const none = YULA.$("[data-none]", section);
    const offs = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };

    // --- Görünüm ----------------------------------------------------------------------
    const setView = (v, animate) => {
      if (v !== "grid") v = "list";
      section.dataset.view = v;
      viewBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.viewBtn === v)));
      try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* özel pencere: hatırlanmaz */ }
      if (animate && gsap && !still) {
        const shown = items.filter((i) => !i.hidden);
        gsap.fromTo(shown, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "expo.out", stagger: 0.06, clearProps: "transform,opacity,visibility" });
      }
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    };
    let saved = null;
    try { saved = localStorage.getItem(VIEW_KEY); } catch (e) { saved = null; }
    setView(saved || "list", false);
    viewBtns.forEach((b) => on(b, "click", () => setView(b.dataset.viewBtn, true)));

    // --- Süzgeçler --------------------------------------------------------------------
    const state = { type: "", space: "" };
    const params = new URLSearchParams(location.search);
    state.type = params.get(Q.type) || "";
    state.space = params.get(Q.space) || "";

    const apply = (animate) => {
      let n = 0;
      items.forEach((it) => {
        const okType = !state.type || it.dataset.type === state.type;
        const okSpace = !state.space || it.dataset.spaces.split(" ").includes(state.space);
        const show = okType && okSpace;
        it.hidden = !show;
        if (show) n += 1;
      });
      chips.forEach((c) => {
        const g = c.dataset.filter;
        const pressed = g === "all" ? !state.type && !state.space : state[g] === c.dataset.value;
        c.setAttribute("aria-pressed", String(pressed));
      });
      if (countEl) countEl.textContent = `${n} ${n === 1 ? section.dataset.one : section.dataset.many}`;
      if (none) none.hidden = n > 0;
      const u = new URL(location.href);
      u.searchParams.delete(Q.type); u.searchParams.delete(Q.space);
      if (state.type) u.searchParams.set(Q.type, state.type);
      if (state.space) u.searchParams.set(Q.space, state.space);
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
      if (animate && gsap && !still) {
        gsap.fromTo(items.filter((i) => !i.hidden), { autoAlpha: 0, y: 18 },
          { autoAlpha: 1, y: 0, duration: 0.7, ease: "expo.out", stagger: 0.05, clearProps: "transform,opacity,visibility" });
      }
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    };
    chips.forEach((c) => on(c, "click", () => {
      const g = c.dataset.filter;
      if (g === "all") { state.type = ""; state.space = ""; }
      else state[g] = state[g] === c.dataset.value ? "" : c.dataset.value;   // ikinci tık kaldırır
      apply(true);
    }));
    apply(false);

    // --- Liste görünümünde imleci izleyen kapak ----------------------------------------
    const float = YULA.$("[data-float]", root);
    if (float && gsap && YULA.finePointer()) {
      const img = float.querySelector("img");
      const xTo = gsap.quickTo(float, "x", { duration: still ? 0 : 0.6, ease: "power3" });
      const yTo = gsap.quickTo(float, "y", { duration: still ? 0 : 0.6, ease: "power3" });
      const links = YULA.$$(".plist__link", list);
      links.forEach((a) => { const i = new Image(); i.src = a.dataset.cover; });   // hover anında boşluk olmasın
      const isList = () => section.dataset.view === "list";
      on(list, "pointermove", (e) => { xTo(e.clientX); yTo(e.clientY); });
      on(list, "pointerleave", () => float.classList.remove("is-on"));
      links.forEach((a) => on(a, "pointerenter", (e) => {
        if (!isList()) return;
        const src = e.currentTarget.dataset.cover;
        if (!img.src.endsWith(src)) img.src = src;
        float.classList.add("is-on");
      }));
      viewBtns.forEach((b) => on(b, "click", () => float.classList.remove("is-on")));
    }

    return () => offs.forEach((f) => f());
  });
})();

/* 46-faz2.js */
/* Faz 2 etkileşimleri.

   Gün ışığı kaydırıcısı [data-lightx]: aynı kare gündüz / alacakaranlık / gece olarak üç ayrı
   gerçek render'dır. Kaydırıcı (ya da görsel üzerinde yatay sürükleme) katmanların saydamlığını
   ayarlar: 0 gündüz, 1 alacakaranlık, 2 gece. Bölüm ilk kez görününce ışık bir kez kendiliğinden
   alacakaranlığa kayıp geri döner (nasıl kullanılacağını göstermek için).

   Kat planı [data-pplan]: tavanı kesilmiş tepeden render üzerinde mekân noktaları; birine
   dokununca yanında o mekânın render'ı açılır. Nokta konumları CSSOM ile (CSP: satır içi stil yok).

   Malzeme büyüteci [data-lens]: imleç numunenin üzerinde gezerken yuvarlak bir merceğin içinde
   aynı numunenin 2000 px sürümü 2,6 kat büyür. */
(function () {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  YULA.module("lightx", (root) => {
    const secs = YULA.$$("[data-lightx]", root);
    if (!secs.length) return;
    const offs = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };
    secs.forEach((sec) => {
      const range = YULA.$("[data-light-range]", sec);
      const stage = YULA.$("[data-light-stage]", sec);
      const names = (range.dataset.names || "").split("|");
      let set = YULA.$("[data-light-set]:not([hidden])", sec);
      const paint = () => {
        const v = +range.value;
        if (!set) return;
        const day = YULA.$(".lightx__layer--day", set);
        const dusk = YULA.$(".lightx__layer--dusk", set);
        const night = YULA.$(".lightx__layer--night", set);
        dusk.style.opacity = clamp(v, 0, 1).toFixed(3);
        night.style.opacity = clamp(v - 1, 0, 1).toFixed(3);
        // tamamen örtülen alt katman çizilmez (daha az birleştirme işi)
        day.style.visibility = v >= 1 ? "hidden" : "";
        dusk.style.visibility = v >= 2 ? "hidden" : "";
        range.setAttribute("aria-valuetext", names[Math.round(v)] || "");
        sec.style.setProperty("--light", (v / 2).toFixed(3));
      };
      on(range, "input", paint);
      // görsel üzerinde yatay sürükleme
      let drag = null;
      on(stage, "pointerdown", (e) => { drag = { x: e.clientX, v: +range.value }; stage.setPointerCapture(e.pointerId); });
      on(stage, "pointermove", (e) => {
        if (!drag) return;
        range.value = clamp(drag.v + ((e.clientX - drag.x) / stage.clientWidth) * 2.4, 0, 2);
        paint();
      });
      const end = () => { drag = null; };
      on(stage, "pointerup", end);
      on(stage, "pointercancel", end);
      YULA.$$("[data-light-cam]", sec).forEach((b) => on(b, "click", () => {
        YULA.$$("[data-light-cam]", sec).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        YULA.$$("[data-light-set]", sec).forEach((s) => { s.hidden = s.dataset.lightSet !== b.dataset.lightCam; });
        set = YULA.$(`[data-light-set="${b.dataset.lightCam}"]`, sec);
        paint();
      }));
      paint();
      // ilk görünüşte kısa bir gösterim
      const gsap = window.gsap;
      if (gsap && window.ScrollTrigger && !YULA.reducedMotion()) {
        const st = window.ScrollTrigger.create({
          trigger: stage, start: "top 65%", once: true,
          onEnter: () => {
            const o = { v: +range.value };
            gsap.timeline()
              .to(o, { v: 1.15, duration: 2.4, ease: "sine.inOut", onUpdate: () => { range.value = o.v; paint(); } })
              .to(o, { v: 0, duration: 2.0, ease: "sine.inOut", delay: 0.6, onUpdate: () => { range.value = o.v; paint(); } });
          },
        });
        offs.push(() => st.kill());
      }
    });
    return () => offs.forEach((f) => f());
  });

  /* Eskizden odaya [data-sketchx]: eskiz katmanı soldan sağa açılır (clip-path --reveal), kaydırıcı ya da
     görsel üzerinde yatay sürükleme. İlk görünüşte bir kez eskize inip geri döner. */
  YULA.module("sketchx", (root) => {
    const secs = YULA.$$("[data-sketchx]", root);
    if (!secs.length) return;
    const offs = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };
    secs.forEach((sec) => {
      const range = YULA.$("[data-sketch-range]", sec);
      const stage = YULA.$("[data-sketch-stage]", sec);
      const paint = () => {
        stage.style.setProperty("--reveal", (+range.value).toFixed(3));
        range.setAttribute("aria-valuetext", Math.round(range.value * 100) + "%");
      };
      on(range, "input", paint);
      let drag = null;
      on(stage, "pointerdown", (e) => { drag = { x: e.clientX, v: +range.value }; stage.setPointerCapture(e.pointerId); });
      on(stage, "pointermove", (e) => {
        if (!drag) return;
        range.value = clamp(drag.v + (e.clientX - drag.x) / stage.clientWidth, 0, 1);
        paint();
      });
      const end = () => { drag = null; };
      on(stage, "pointerup", end);
      on(stage, "pointercancel", end);
      paint();
      const gsap = window.gsap;
      if (gsap && window.ScrollTrigger && !YULA.reducedMotion()) {
        const st = window.ScrollTrigger.create({
          trigger: stage, start: "top 65%", once: true,
          onEnter: () => {
            const o = { v: +range.value };
            gsap.timeline()
              .to(o, { v: 0.12, duration: 2.0, ease: "sine.inOut", onUpdate: () => { range.value = o.v; paint(); } })
              .to(o, { v: 1, duration: 2.2, ease: "sine.inOut", delay: 0.4, onUpdate: () => { range.value = o.v; paint(); } });
          },
        });
        offs.push(() => st.kill());
      }
    });
    return () => offs.forEach((f) => f());
  });

  /* Kart döngüleri [data-loop]: kart görünürken sessiz döngü oynar, görünmeyince durur. Hareketi azalt ya da
     veri tasarrufu açıksa hiç indirilmez (resim kalır). Video kare akışı başlayınca yumuşakça belirir. */
  YULA.module("loops", (root) => {
    const vids = YULA.$$("video[data-loop]", root);
    if (!vids.length || YULA.reducedMotion()) return;
    const conn = navigator.connection;
    if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ""))) return;
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) {
          if (!v.getAttribute("src")) v.src = v.dataset.loop;
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } else v.pause();
      });
    }, { threshold: 0.35 });
    const offs = [];
    vids.forEach((v) => {
      const live = () => v.classList.add("is-live");
      v.addEventListener("playing", live, { once: true });
      io.observe(v);
      offs.push(() => { v.pause(); v.removeAttribute("src"); v.load(); });
    });
    return () => { io.disconnect(); offs.forEach((f) => f()); };
  });

  /* 360° panorama [data-pano]: equirectangular render, WebGL2 ile küreye bakış. Sürükle: dön (fare: yatay + dikey,
     dokunmatik: yatay; dikey kaydırma sayfaya kalır). Görsele tıkla + tekerlek / + − tuşları: yakınlaştır. Ok tuşları:
     döndür. Görünürken yavaşça kendi kendine döner (hareketi azalt açıksa dönmez). WebGL2 yoksa ya da yükleme
     başarısızsa sabit kare kalır. */
  YULA.module("pano", (root) => {
    const sec = YULA.$("[data-pano]", root);
    if (!sec) return;
    const stage = YULA.$("[data-pano-stage]", sec);
    const canvas = YULA.$("canvas", stage);
    const offs = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };
    let gl = null, prog = null, uni = null, ready = false, visible = false, raf = 0, last = 0, started = false, dead = false;
    let yaw = 0, pitch = 0, fov = 1.3, used = false, drag = null;
    const still = YULA.reducedMotion();
    const VS = "#version 300 es\nin vec2 p;out vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}";
    const FS = "#version 300 es\nprecision highp float;in vec2 v;out vec4 o;uniform sampler2D t;uniform vec2 r;uniform vec2 a;uniform float f;"
      + "void main(){vec2 q=v*vec2(r.x/r.y,1.)*tan(f*.5);vec3 d=normalize(vec3(q,-1.));"
      + "float cp=cos(a.y),sp=sin(a.y);d=vec3(d.x,d.y*cp-d.z*sp,d.y*sp+d.z*cp);"
      + "float cy=cos(a.x),sy=sin(a.x);d=vec3(d.x*cy+d.z*sy,d.y,-d.x*sy+d.z*cy);"
      + "float lon=atan(d.x,-d.z);float lat=asin(clamp(d.y,-1.,1.));"
      + "o=vec4(texture(t,vec2(lon/6.2831853+.5,.5-lat/3.1415927)).rgb,1.);}";
    const fail = () => { dead = true; cancelAnimationFrame(raf); };

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(stage.clientWidth * dpr), h = Math.round(stage.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };
    const draw = () => {
      size();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uni.r, canvas.width, canvas.height);
      gl.uniform2f(uni.a, yaw, pitch);
      gl.uniform1f(uni.f, fov);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const frame = (now) => {
      raf = 0;
      if (dead || !visible || !ready) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (!still && !used) yaw += dt * 0.06;
      draw();
      raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && ready && visible && !dead) { last = performance.now(); raf = requestAnimationFrame(frame); } };

    const init = async () => {
      if (started) return;
      started = true;
      try {
        gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
        if (!gl) return fail();
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader"); return s; };
        prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const pl = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(pl);
        gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
        uni = { r: gl.getUniformLocation(prog, "r"), a: gl.getUniformLocation(prog, "a"), f: gl.getUniformLocation(prog, "f") };
        const hi = YULA.finePointer() && stage.clientWidth * (window.devicePixelRatio || 1) > 1400;
        const res = await fetch(hi ? stage.dataset.hi : stage.dataset.lo);
        if (!res.ok) throw new Error("img");
        const bmp = await createImageBitmap(await res.blob());
        if (dead) return;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        bmp.close();
        ready = true;
        draw();
        stage.classList.add("is-live");
        kick();
      } catch (e) { fail(); }
    };

    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible) { init(); kick(); } else { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0.15 });
    io.observe(stage);
    offs.push(() => io.disconnect());

    const touch = () => { used = true; stage.classList.add("is-used"); };
    const clampP = () => { pitch = Math.max(-1.45, Math.min(1.45, pitch)); fov = Math.max(0.6, Math.min(1.8, fov)); };
    on(stage, "pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, t: e.pointerType }; stage.classList.add("is-armed"); stage.setPointerCapture(e.pointerId); touch(); });
    on(stage, "pointermove", (e) => {
      if (!drag) return;
      const k = fov / Math.max(1, stage.clientHeight);
      yaw -= (e.clientX - drag.x) * k;
      if (drag.t !== "touch") pitch += (e.clientY - drag.y) * k;
      drag.x = e.clientX; drag.y = e.clientY;
      clampP();
      if (ready && !raf) draw();
    });
    const end = () => { drag = null; };
    on(stage, "pointerup", end);
    on(stage, "pointercancel", end);
    on(stage, "pointerleave", () => stage.classList.remove("is-armed"));
    on(stage, "blur", () => stage.classList.remove("is-armed"));
    on(stage, "wheel", (e) => {
      if (!e.ctrlKey && !stage.classList.contains("is-armed")) return;
      e.preventDefault();
      fov += e.deltaY * 0.0012;
      clampP(); touch();
      if (ready && !raf) draw();
    }, { passive: false });
    on(stage, "keydown", (e) => {
      const s = 0.08;
      const m = { ArrowLeft: () => (yaw -= s), ArrowRight: () => (yaw += s), ArrowUp: () => (pitch += s), ArrowDown: () => (pitch -= s), "+": () => (fov -= 0.08), "=": () => (fov -= 0.08), "-": () => (fov += 0.08) }[e.key];
      if (!m) return;
      e.preventDefault(); m(); clampP(); touch();
      if (ready && !raf) draw();
    });
    on(window, "resize", () => { if (ready && !raf) draw(); });
    return () => {
      dead = true; cancelAnimationFrame(raf); offs.forEach((f) => f());
      if (gl) { const x = gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); }
    };
  });

  YULA.module("pplan", (root) => {
    const sec = YULA.$("[data-pplan]", root);
    if (!sec) return;
    const offs = [];
    const dots = YULA.$$("[data-room]", sec);
    const views = YULA.$$("[data-view-room]", sec);
    dots.forEach((d) => { d.style.left = (+d.dataset.u * 100).toFixed(2) + "%"; d.style.top = (+d.dataset.v * 100).toFixed(2) + "%"; });
    sec.classList.add("is-ready");
    const pick = (key) => {
      dots.forEach((d) => d.setAttribute("aria-pressed", String(d.dataset.room === key)));
      views.forEach((v) => v.classList.toggle("is-on", v.dataset.viewRoom === key));
    };
    dots.forEach((d) => {
      const f = () => pick(d.dataset.room);
      d.addEventListener("click", f);
      if (YULA.finePointer()) d.addEventListener("pointerenter", f);
      offs.push(() => { d.removeEventListener("click", f); d.removeEventListener("pointerenter", f); });
    });
    return () => offs.forEach((f) => f());
  });

  YULA.module("lens", (root) => {
    const shots = YULA.$$("[data-lens]", root);
    if (!shots.length || !YULA.finePointer()) return;
    const ZOOM = 2.6;
    const offs = [];
    shots.forEach((a) => {
      const lens = YULA.$(".mat__lens", a);
      if (!lens) return;
      let loaded = false;
      const enter = () => {
        if (!loaded) { lens.style.backgroundImage = `url("${a.dataset.lens}")`; loaded = true; }
        a.classList.add("is-lens");
      };
      const move = (e) => {
        const r = a.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        lens.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        lens.style.backgroundSize = `${r.width * ZOOM}px ${r.height * ZOOM}px`;
        lens.style.backgroundPosition = `${-(x * ZOOM - lens.offsetWidth / 2)}px ${-(y * ZOOM - lens.offsetHeight / 2)}px`;
      };
      const leave = () => a.classList.remove("is-lens");
      a.addEventListener("pointerenter", enter);
      a.addEventListener("pointermove", move);
      a.addEventListener("pointerleave", leave);
      offs.push(() => { a.removeEventListener("pointerenter", enter); a.removeEventListener("pointermove", move); a.removeEventListener("pointerleave", leave); });
    });
    return () => offs.forEach((f) => f());
  });
})();

/* 47-search.js */
/* Hızlı arama (Cmd/Ctrl+K ya da "/"): projeler, mekânlar, fikirler ve sayfalar.
   Dizin /search.json ilk açılışta bir kez iner (connect-src 'self'), sayfa geçişlerinde korunur.
   Sonuçlar yalnızca DOM API'leriyle kurulur (innerHTML yok, Trusted Types uyumlu).
   Bir sonuca gidildiğinde bağlantı tıklanmış gibi davranılır; böylece yönlendiricinin
   perde geçişi aynen çalışır. Türkçe karakterler aramada eşitlenir (ı=i, ş=s, ğ=g …). */
(function () {
  let index = null;          // { tr: [...], en: [...] }
  let loading = null;

  const fold = (s) => (s || "").toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

  const load = (url) => {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch(url, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("search index"))))
        .then((d) => {
          index = {};
          Object.keys(d).forEach((lang) => {
            index[lang] = d[lang].map((it) => ({ ...it, _t: fold(it.t), _s: fold(it.s), _q: fold(it.q) }));
          });
          return index;
        })
        .catch((e) => { loading = null; throw e; });
    }
    return loading;
  };

  const score = (it, terms) => {
    let total = 0;
    for (const term of terms) {
      let s = 0;
      if (it._t.startsWith(term)) s = 100;
      else if (it._t.includes(" " + term)) s = 70;
      else if (it._t.includes(term)) s = 55;
      else if (it._s.includes(term)) s = 25;
      else if (it._q.includes(term)) s = 10;
      if (!s) return 0;                 // her sözcük bir yerde geçmeli
      total += s;
    }
    return total + (it.k === "project" ? 8 : it.k === "page" ? 4 : 0);
  };

  YULA.module("search", (root) => {
    const dlg = YULA.$("[data-search]", root);
    if (!dlg || typeof dlg.showModal !== "function") return;
    const input = YULA.$("[data-search-input]", dlg);
    const listEl = YULA.$("[data-search-list]", dlg);
    const lang = document.documentElement.lang === "en" ? "en" : "tr";
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    YULA.$$("[data-kbd]", root).forEach((k) => { k.textContent = mac ? "⌘ K" : "Ctrl K"; });

    let results = [];
    let active = 0;
    const offs = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };

    const render = () => {
      listEl.replaceChildren();
      if (!results.length) {
        const li = document.createElement("li");
        li.className = "search__empty";
        li.textContent = dlg.dataset.empty;
        listEl.append(li);
        input.removeAttribute("aria-activedescendant");
        return;
      }
      results.forEach((it, i) => {
        const li = document.createElement("li");
        li.className = "search__item";
        li.id = `sr-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === active));
        const kind = document.createElement("span");
        kind.className = "label search__kind";
        kind.textContent = dlg.getAttribute(`data-k-${it.k}`) || "";
        const title = document.createElement("span");
        title.className = "search__title";
        title.textContent = it.t;
        const sub = document.createElement("span");
        sub.className = "search__sub";
        sub.textContent = it.s || "";
        li.append(kind, title, sub);
        li.addEventListener("pointermove", () => { if (active !== i) { active = i; mark(); } });
        li.addEventListener("click", () => go(it));
        listEl.append(li);
      });
      mark();
    };
    const mark = () => {
      YULA.$$(".search__item", listEl).forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
      const cur = listEl.children[active];
      if (cur && cur.id) { input.setAttribute("aria-activedescendant", cur.id); cur.scrollIntoView({ block: "nearest" }); }
    };

    const query = () => {
      const items = (index && index[lang]) || [];
      const terms = fold(input.value).split(/\s+/).filter(Boolean);
      if (!terms.length) {
        results = items.filter((it) => it.k === "project" || it.k === "page").slice(0, 8);
      } else {
        const seen = new Set();
        results = items.map((it) => ({ it, s: score(it, terms) }))
          .filter((r) => r.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((r) => r.it)
          .filter((it) => { const key = it.t + "|" + it.u; if (seen.has(key)) return false; seen.add(key); return true; })
          .slice(0, 9);
      }
      active = 0;
      render();
    };

    const open = () => {
      if (dlg.open) return;
      const btn = YULA.$("[data-menu-btn]");
      if (btn && btn.getAttribute("aria-expanded") === "true") btn.click();   // mobil menü açıksa kapat
      dlg.showModal();
      if (YULA.lenis) YULA.lenis.stop();
      input.value = "";
      load(dlg.dataset.index).then(query).catch(() => { results = []; render(); });
      requestAnimationFrame(() => input.focus());
    };
    const close = () => { if (dlg.open) dlg.close(); };
    const go = (it) => {
      close();
      const a = document.createElement("a");
      a.href = it.u;
      a.hidden = true;
      document.body.append(a);
      a.click();                 // yönlendirici yakalar: perde geçişi
      a.remove();
    };

    on(dlg, "close", () => { if (YULA.lenis) YULA.lenis.start(); });
    on(dlg, "click", (e) => { if (e.target === dlg) close(); });       // arka plana tık
    on(input, "input", query);
    on(input, "keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (results.length) { active = (active + 1) % results.length; mark(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (results.length) { active = (active - 1 + results.length) % results.length; mark(); } }
      else if (e.key === "Enter") { e.preventDefault(); if (results[active]) go(results[active]); }
    });
    on(document, "keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); dlg.open ? close() : open(); }
      else if (e.key === "/" && !typing && !dlg.open) { e.preventDefault(); open(); }
    });
    on(document, "click", (e) => { const b = e.target.closest && e.target.closest("[data-search-open]"); if (b) { e.preventDefault(); open(); } });

    return () => { close(); offs.forEach((f) => f()); };
  });
})();

/* 48-print.js */
/* Proje künyesi (yazdır / PDF olarak kaydet).
   Tembel yüklenen görseller önce zorla indirilir (en fazla 4 sn beklenir), sonra yazdırma
   penceresi açılır. Tarayıcının kendi Ctrl+P'sinde beklenemez; o durumda da görseller
   hemen istenir. Sayfa düzeni @media print kurallarında (08-print.css). */
(function () {
  const eager = (root) => {
    const imgs = YULA.$$("img", root);
    imgs.forEach((img) => { if (img.loading === "lazy") img.loading = "eager"; });
    return imgs;
  };
  const ready = (imgs, ms) => Promise.race([
    Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => {
      img.addEventListener("load", r, { once: true });
      img.addEventListener("error", r, { once: true });
    })))),
    new Promise((r) => setTimeout(r, ms)),
  ]);

  YULA.module("print", (root) => {
    const btns = YULA.$$("[data-print]", root);
    const before = () => eager(root);
    window.addEventListener("beforeprint", before);
    const click = () => {
      document.documentElement.classList.add("is-printing");
      ready(eager(root), 4000).then(() => {
        window.print();
        document.documentElement.classList.remove("is-printing");
      });
    };
    btns.forEach((b) => b.addEventListener("click", click));
    return () => {
      window.removeEventListener("beforeprint", before);
      btns.forEach((b) => b.removeEventListener("click", click));
    };
  });
})();

/* 49-brief.js */
/* Adım adım proje başvurusu [data-brief].
   Her adım bir <fieldset>; İleri yalnızca adımdaki zorunlu alanlar doluysa geçer. Sunucu
   olmadığı için (CSP form-action 'none') form hiçbir yere gönderilmez: Gönder'e basınca
   yanıtlar düz metne çevrilir ve e-posta uygulaması hazır mesajla açılır. */
(function () {
  YULA.module("brief", (root) => {
    const form = YULA.$("[data-brief]", root);
    if (!form) return;
    const steps = YULA.$$("[data-brief-step]", form);
    const prev = YULA.$("[data-brief-prev]", form);
    const next = YULA.$("[data-brief-next]", form);
    const send = YULA.$("[data-brief-send]", form);
    const bar = YULA.$("[data-brief-bar]", form);
    const status = YULA.$("[data-brief-status]", form);
    let at = 0;

    const show = (i, focus) => {
      at = i;
      steps.forEach((s, n) => { s.hidden = n !== i; });
      prev.hidden = i === 0;
      next.hidden = i === steps.length - 1;
      send.hidden = i !== steps.length - 1;
      bar.style.transform = `scaleX(${(i + 1) / steps.length})`;
      status.textContent = "";
      if (focus) {
        const first = YULA.$("input, textarea", steps[i]);
        if (first) first.focus({ preventScroll: true });
      }
    };

    // adımdaki ilk geçersiz alanı göster
    const valid = (i) => {
      const bad = YULA.$$("input, textarea", steps[i]).find((el) => !el.checkValidity());
      if (!bad) return true;
      status.textContent = form.dataset.required;
      bad.focus();
      return false;
    };

    const onNext = () => { if (valid(at)) show(at + 1, true); };
    const onPrev = () => show(at - 1, true);
    // seçenek işaretlenince kendiliğinden sonraki adıma geç
    const onChange = (e) => {
      if (e.target.type === "radio" && at < steps.length - 1) setTimeout(() => show(at + 1, true), 260);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      for (let i = 0; i < steps.length; i++) if (!valid(i)) { show(i); valid(i); return; }
      const lines = YULA.$$("fieldset", form).map((fs) => {
        const q = YULA.$("legend", fs).lastChild.textContent.trim();
        const vals = YULA.$$("input, textarea", fs)
          .filter((el) => el.name !== "consent" && (el.type !== "radio" || el.checked) && el.value.trim())
          .map((el) => {
            const lab = el.closest(".brief__field");
            const name = lab ? YULA.$(".label", lab).textContent : "";
            return (name ? name + ": " : "") + el.value.trim();
          });
        return vals.length ? `${q}\n${vals.join("\n")}` : "";
      }).filter(Boolean);
      const a = document.createElement("a");
      a.href = `mailto:${form.dataset.to}?subject=${encodeURIComponent(form.dataset.subject)}&body=${encodeURIComponent(lines.join("\n\n"))}`;
      a.click();
      status.textContent = form.dataset.done;
    };

    prev.addEventListener("click", onPrev);
    next.addEventListener("click", onNext);
    form.addEventListener("change", onChange);
    form.addEventListener("submit", onSubmit);
    form.classList.add("is-live");
    show(0);
    return () => {
      prev.removeEventListener("click", onPrev);
      next.removeEventListener("click", onNext);
      form.removeEventListener("change", onChange);
      form.removeEventListener("submit", onSubmit);
    };
  });
})();

/* 50-router.js */
/* Sayfa geçişleri: kendi küçük yönlendiricimiz (her tarayıcıda birebir aynı geçiş).

   Akış: bağlantıya tıklanır → gece rengi perde aşağıdan yükselir (bu sırada yeni sayfa
   zaten iniyor; üzerine gelince önceden çekilir) → modüller temizlenir (YULA.destroy) →
   <body> içeriği, başlık, dil ve meta etiketleri değiştirilir → modüller yeniden kurulur
   (YULA.init) → perde yukarı çekilir. Perdede gidilen sayfanın başlığı görünür.

   Güvenlik: HTML ayrıştırma bir Trusted Types "sink"idir; yalnızca kendi kökenimizden
   gelen sayfalar için "yula-router" adlı politika kullanılır (CSP'de izinli). Fetch için
   CSP'de connect-src 'self' gerekir. Herhangi bir hata olursa normal gezinmeye düşer. */
(function () {
  if (!window.fetch || !window.history.pushState || !window.DOMParser) return;

  const policy = window.trustedTypes
    ? window.trustedTypes.createPolicy("yula-router", { createHTML: (s) => s })
    : { createHTML: (s) => s };
  const cache = new Map();
  let busy = false;

  const isInternal = (a) => {
    if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return false;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return false;
    if (/\.(jpe?g|png|webp|avif|pdf|xml|txt)$/i.test(url.pathname)) return false;
    // Aynı sayfada yalnızca hash değişiyorsa tarayıcı / Lenis halletsin.
    if (url.pathname === location.pathname && url.hash) return false;
    return true;
  };

  const fetchPage = (url) => {
    const key = url.split("#")[0];
    if (!cache.has(key)) {
      cache.set(key, fetch(key, { credentials: "same-origin" }).then((r) => {
        if (!r.ok || !(r.headers.get("content-type") || "").includes("text/html")) throw new Error("not html");
        return r.text();
      }).catch((e) => { cache.delete(key); throw e; }));
    }
    return cache.get(key);
  };

  // Perde (bir kez oluşturulur, body değişse de korunur)
  const curtain = document.createElement("div");
  curtain.className = "pt-curtain";
  curtain.setAttribute("aria-hidden", "true");
  const curtainTitle = document.createElement("span");
  curtainTitle.className = "pt-curtain__title";
  curtain.append(curtainTitle);
  const live = document.createElement("div");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");

  let doorActive = false;          // kapı geçişi sürerken body değişse de kapı ekranda kalmalı
  const ensureChrome = () => {
    if (!curtain.isConnected) document.body.append(curtain);
    if (!live.isConnected) document.body.append(live);
    if (doorActive && !door.isConnected) document.body.append(door);
  };

  const swap = (html, url, restoreY) => {
    const doc = new DOMParser().parseFromString(policy.createHTML(html), "text/html");
    // DOMParser betik kapalıyken ayrıştırır: <noscript> içindeki yedek görseller gerçek öğe olur
    // ve gereksiz yere indirilirdi. Betik çalıştığı için bunlara ihtiyaç yok.
    doc.querySelectorAll("noscript").forEach((n) => n.remove());
    document.title = doc.title;
    document.documentElement.lang = doc.documentElement.lang;
    // head: açıklama, alternatif dil bağlantıları ve sayfaya özel ön yüklemeler
    ["meta[name=description]", 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:locale"]']
      .forEach((sel) => {
        const a = document.head.querySelector(sel), b = doc.head.querySelector(sel);
        if (a && b) a.setAttribute("content", b.getAttribute("content"));
      });
    document.head.querySelectorAll("link[rel=alternate]").forEach((l) => l.remove());
    doc.head.querySelectorAll("link[rel=alternate]").forEach((l) => document.head.append(document.importNode(l, true)));
    document.body.className = doc.body.className;
    document.body.replaceChildren(...Array.from(doc.body.childNodes, (n) => document.importNode(n, true)));
    ensureChrome();
    const hash = url.split("#")[1];
    const target = hash && document.getElementById(decodeURIComponent(hash));
    // Geri / ileri: ayrılırken kaydedilen konuma dön; yeni sayfada en üst (ya da #bölüm).
    const y = typeof restoreY === "number" ? restoreY : target ? target.getBoundingClientRect().top + window.scrollY : 0;
    window.scrollTo(0, y);
  };

  // GSAP animasyonunun bitişini güvenle bekle (tween'leri doğrudan await etmek bazı
  // durumlarda çözülmüyor; onComplete her zaman çalışır).
  const done = (anim) => new Promise((resolve) => anim.eventCallback("onComplete", resolve));

  const mark = (m) => { if (window.YULA_DEBUG) (window.YULA_DEBUG.steps ||= []).push(m); };

  /* "Kapıdan geçiş": bir projeye giderken tıklanan kapak büyüyüp ekranı kaplar (kamera
     içeri girer), yeni sayfa aynı görüntüyle başlar. Kapağı olmayan bağlantılar perdeyi
     kullanır. Kaynak: proje kartı, listedeki satır (önizleme), "sonraki proje" bloğu. */
  const doorSource = (a) => {
    if (!a) return null;
    let img = null, box = null;
    if (a.matches(".card__link")) { box = a.querySelector(".card__shot"); img = box && box.querySelector("img"); }
    else if (a.matches(".pnext")) { box = a.querySelector(".pnext__media"); img = box && box.querySelector("img"); }
    else if (a.matches(".plist__link")) {
      const f = YULA.$("[data-float]");
      box = f && f.classList.contains("is-on") ? f : a;
      img = f && f.querySelector("img");
    }
    if (!img || !(img.currentSrc || img.src)) return null;
    const r = box.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return { src: img.currentSrc || img.src, rect: r };
  };

  const door = document.createElement("div");
  door.className = "pt-door";
  door.setAttribute("aria-hidden", "true");
  const doorImg = document.createElement("img");
  doorImg.alt = "";
  door.append(doorImg);

  let pending = null;              // geçiş sürerken gelen geri / ileri isteği (sonra uygulanır)
  const navigate = async (url, { push = true, source = null, restoreY } = {}) => {
    mark("nav:" + busy);
    if (busy) { if (!push) pending = { url, restoreY }; return; }
    busy = true;
    const gsap = window.gsap;
    const still = YULA.reducedMotion() || !gsap;
    ensureChrome();
    curtainTitle.textContent = "";
    const via = still ? null : doorSource(source);
    try {
      const htmlP = fetchPage(url);
      if (via) {
        doorActive = true;
        if (!door.isConnected) document.body.append(door);
        doorImg.src = via.src;
        const r = via.rect;
        await done(gsap.timeline()
          .set(door, { visibility: "visible", opacity: 1, left: r.left, top: r.top, width: r.width, height: r.height })
          .set(doorImg, { scale: 1 })
          .to(door, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, duration: 1.05, ease: "expo.inOut" })
          .to(doorImg, { scale: 1.12, duration: 1.05, ease: "expo.inOut" }, 0));
        mark("door-in");
      } else if (!still) {
        await done(gsap.timeline()
          .set(curtain, { visibility: "visible", clipPath: "inset(100% 0% 0% 0%)" })
          .to(curtain, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.85, ease: "expo.inOut" }));
        mark("curtain-in");
      }
      const html = await htmlP;
      mark("html");
      // Perdede yeni sayfanın başlığı
      const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      curtainTitle.textContent = m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
      if (!still && !via) await done(gsap.timeline().fromTo(curtainTitle, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "expo.out" }));

      mark("fetched");
      if (push) history.pushState({ y: 0 }, "", url);
      YULA.destroy();
      mark("destroyed");
      swap(html, url, restoreY);
      mark("swapped");
      YULA.init();
      mark("init");
      document.dispatchEvent(new CustomEvent("yula:navigated"));
      live.textContent = document.title;
      document.getElementById("main")?.focus({ preventScroll: true });

      if (via) {
        // Yeni sayfanın kapağı zaten aynı görüntü: kapı yumuşakça açılır.
        await done(gsap.timeline()
          .to(doorImg, { scale: 1, duration: 1.1, ease: "expo.out" }, 0)
          .to(door, { opacity: 0, duration: 0.9, ease: "power2.inOut" }, 0.1)
          .set(door, { visibility: "hidden" }));
        doorActive = false;
        door.remove();
      } else if (!still) {
        await done(gsap.timeline()
          .to(curtainTitle, { autoAlpha: 0, y: -20, duration: 0.4, ease: "power2.in" })
          .to(curtain, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.95, ease: "expo.inOut" }, "-=0.1")
          .set(curtain, { visibility: "hidden" }));
      }
    } catch (e) {
      console.error("[YULA router]", e);
      if (window.YULA_DEBUG) { window.YULA_DEBUG.error = String(e && e.stack || e); return; }
      location.href = url;        // her ihtimale karşı normal gezinme
      return;
    } finally {
      busy = false;
      doorActive = false;
    }
    // Geçiş sürerken kullanıcı geri / ileri bastıysa adres ile içerik ayrışmasın.
    if (pending) {
      const p = pending;
      pending = null;
      if (p.url !== location.href || location.pathname !== shownPath) navigate(p.url, { push: false, restoreY: p.restoreY });
    }
  };

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a");
    if (!isInternal(a)) return;
    e.preventDefault();
    if (a.href === location.href) return;
    history.replaceState({ y: window.scrollY }, "");
    navigate(a.href, { source: a });
  });

  // Üzerine gelince önceden çek (tıklanana kadar sayfa çoğu zaman inmiş olur).
  document.addEventListener("pointerover", (e) => {
    const a = e.target.closest && e.target.closest("a");
    if (isInternal(a)) fetchPage(a.href).catch(() => {});
  }, { passive: true });

  // Geri/ileri: yalnızca sayfa yolu değiştiyse (aynı sayfadaki #bölüm geçişleri değil);
  // ayrılırken kaydedilen kaydırma konumuna dönülür.
  let shownPath = location.pathname;
  window.addEventListener("popstate", (e) => {
    const y = e.state && typeof e.state.y === "number" ? e.state.y : 0;
    if (location.pathname !== shownPath) navigate(location.href, { push: false, restoreY: y });
  });
  document.addEventListener("yula:navigated", () => { shownPath = location.pathname; });
  history.scrollRestoration = "manual";
})();

/* 55-menu-cursor.js */
/* Mobil tam ekran menü + masaüstü imleç etiketi. */
(function () {
  /* --- Mobil menü --------------------------------------------------------------
     Düğme aria-expanded ile durumu bildirir; açıkken Esc kapatır, odak menüde kalır,
     arkadaki sayfa kaymaz. Bağlantılar sırayla maskeden yükselir. */
  YULA.module("menu", () => {
    const btn = YULA.$("[data-menu-btn]");
    const menu = YULA.$("[data-menu]");
    if (!btn || !menu) return;
    const gsap = window.gsap;
    const links = YULA.$$(".mmenu__link", menu);
    let open = false;

    const set = (state) => {
      open = state;
      btn.setAttribute("aria-expanded", String(state));
      btn.querySelector("[data-label]").textContent = state ? btn.dataset.close : btn.dataset.open;
      document.documentElement.classList.toggle("menu-open", state);
      menu.inert = !state;
      if (state) {
        YULA.lenis?.stop();
        if (gsap && !YULA.reducedMotion()) {
          gsap.timeline()
            .fromTo(menu, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "expo.inOut" })
            .fromTo(links, { yPercent: 110 }, { yPercent: 0, duration: 1, ease: "expo.out", stagger: 0.06 }, 0.35);
        }
        links[0]?.focus({ preventScroll: true });
      } else {
        YULA.lenis?.start();
        if (gsap && !YULA.reducedMotion()) gsap.to(menu, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.6, ease: "expo.inOut" });
      }
    };
    menu.inert = true;
    const toggle = () => set(!open);
    const onKey = (e) => {
      if (!open) return;
      if (e.key === "Escape") { set(false); btn.focus(); }
      if (e.key === "Tab") {             // odak tuzağı: düğme + menü bağlantıları
        const items = [btn, ...links];
        const i = items.indexOf(document.activeElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
        e.preventDefault();
        items[next].focus();
      }
    };
    const onLink = () => set(false);
    btn.addEventListener("click", toggle);
    document.addEventListener("keydown", onKey);
    links.forEach((l) => l.addEventListener("click", onLink));
    return () => {
      document.documentElement.classList.remove("menu-open");
      btn.removeEventListener("click", toggle);
      document.removeEventListener("keydown", onKey);
    };
  });

  /* --- İmleç etiketi (yalnızca fare/trackpad) ----------------------------------
     Görsel ve proje bağlantılarının üzerinde imlecin yanında küçük bir daire içinde
     "Görüntüle" / "Projeyi aç" yazar. Sistem imleci gizlenmez (erişilebilirlik). */
  YULA.module("cursor", (root) => {
    const gsap = window.gsap;
    if (!gsap || !YULA.finePointer()) return;
    const el = document.createElement("div");
    el.className = "cursor-tag";
    el.setAttribute("aria-hidden", "true");
    document.body.append(el);
    const xTo = gsap.quickTo(el, "x", { duration: 0.45, ease: "power3" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.45, ease: "power3" });
    const labels = { view: document.body.dataset.cursorView, open: document.body.dataset.cursorOpen };

    const move = (e) => { xTo(e.clientX); yTo(e.clientY); };
    const over = (e) => {
      const t = e.target.closest("a.shot, .card__link, .pnext, .plist__link");
      if (!t) { el.classList.remove("is-on"); return; }
      el.textContent = t.matches("a.shot") ? labels.view : labels.open;
      el.classList.add("is-on");
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerover", over, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerover", over);
      el.remove();
    };
  });
})();

/* 60-fx.js */
/* Ödüllü stüdyo sitelerinden uyarlanan hareket katmanı. Hepsi hareketi azalt tercihinde kapalı,
   dokunmatikte imleçle ilgili olanlar kurulmaz. Stiller CSSOM ile (CSP: satır içi stil yok).

   [data-footer]   perde footer: içerik yukarı kalkarken altında açılır; logo kendi çizgileriyle yazılır
   .nav__link      harf yuvarlanması: imleç gelince harfler sırayla yukarı dönüp yenisi gelir
   .cta vb.        mıknatıs: imleç yaklaşınca düğme hafifçe ona doğru çekilir
   [data-hero] / .phero  açıklık: kaydırdıkça görsel çerçeveye daralır, içi yakınlaşır
   .shot (kartlar, akış)  hız eğilmesi: hızlı kaydırmada görseller hafifçe eğilip esner */
(function () {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const motionOK = () => window.gsap && !YULA.reducedMotion();

  // Lenis hızını (yoksa yerel kaydırma farkını) tek yerden okur
  let lastY = window.scrollY, lastT = performance.now(), nativeVel = 0;
  const velocity = () => {
    if (YULA.lenis) return YULA.lenis.velocity || 0;
    const t = performance.now(), y = window.scrollY;
    nativeVel = ((y - lastY) / Math.max(1, t - lastT)) * 16;
    lastY = y; lastT = t;
    return nativeVel;
  };

  YULA.module("fx-footer", (root) => {
    const foot = YULA.$("[data-footer]");
    if (!foot) return;
    const fit = () => foot.classList.toggle("is-static", foot.offsetHeight > window.innerHeight);
    fit();
    window.addEventListener("resize", fit);
    if (!motionOK() || !window.ScrollTrigger) return () => window.removeEventListener("resize", fit);
    const gsap = window.gsap;
    // her harf kendi kutusunda: aynı çizgi yolları, ilgili harfin sırasıyla yazılır
    const all = (k) => YULA.$$(`[data-fstroke="${k}"]`, foot);
    const main = YULA.$("main");
    const ctx = gsap.context(() => {
      const w = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: main, start: "bottom bottom", end: () => `bottom+=${foot.offsetHeight} bottom`, scrub: 0.8 },
      });
      const pen = { attr: { "stroke-dashoffset": 0 } };
      w.to(all("y1"), { ...pen, duration: 1.15 }, 0)
        .to(all("y2"), { ...pen, duration: 0.55 }, 0.55)
        .to(all("u"), { ...pen, duration: 1.15 }, 0.7)
        .to(all("l"), { ...pen, duration: 0.8 }, 1.35)
        .to(all("a"), { ...pen, duration: 1.15 }, 1.7)
        .to(all("a2"), { ...pen, duration: 0.45 }, 2.6);
      gsap.fromTo(YULA.$(".site-footer__inner", foot), { yPercent: -18 }, {
        yPercent: 0, ease: "none",
        scrollTrigger: { trigger: main, start: "bottom bottom", end: () => `bottom+=${foot.offsetHeight} bottom`, scrub: true },
      });
    });
    return () => { ctx.revert(); window.removeEventListener("resize", fit); };
  });

  YULA.module("fx-roll", (root) => {
    if (!YULA.finePointer() || YULA.reducedMotion()) return;
    const links = YULA.$$(".nav__link, .site-footer__nav a", document);
    const undo = [];
    links.forEach((a) => {
      if (a.dataset.roll) return;
      const text = a.textContent;
      a.dataset.roll = "1";
      a.setAttribute("aria-label", text);
      const wrap = document.createElement("span");
      wrap.className = "roll";
      wrap.setAttribute("aria-hidden", "true");
      [...text].forEach((ch, i) => {
        const s = document.createElement("span");
        s.className = "roll__ch";
        s.textContent = ch === " " ? " " : ch;
        s.style.transitionDelay = `${(i * 0.022).toFixed(3)}s`;
        wrap.append(s);
      });
      a.textContent = "";
      a.append(wrap);
      undo.push(() => { a.textContent = text; a.removeAttribute("aria-label"); delete a.dataset.roll; });
    });
    return () => undo.forEach((f) => f());
  });

  YULA.module("fx-magnet", (root) => {
    if (!YULA.finePointer() || !motionOK()) return;
    const gsap = window.gsap;
    const els = YULA.$$(".cta, .nav__lang, .menu-btn, .brief__btn, .nav__search, .pprint", document);
    const offs = [];
    els.forEach((el) => {
      const qx = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
      const qy = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
      const move = (e) => {
        const r = el.getBoundingClientRect();
        qx(clamp((e.clientX - (r.left + r.width / 2)) * 0.22, -10, 10));
        qy(clamp((e.clientY - (r.top + r.height / 2)) * 0.3, -7, 7));
      };
      const leave = () => { qx(0); qy(0); };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      offs.push(() => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); gsap.set(el, { x: 0, y: 0 }); });
    });
    return () => offs.forEach((f) => f());
  });

  YULA.module("fx-aperture", (root) => {
    if (!motionOK() || !window.ScrollTrigger) return;
    const gsap = window.gsap;
    const heroes = YULA.$$(".hero__stage, .phero__media", root);
    if (!heroes.length) return;
    const ctx = gsap.context(() => {
      heroes.forEach((stage) => {
        const sec = stage.closest("section, header") || stage.parentElement;
        gsap.fromTo(stage, { clipPath: "inset(0% 0% 0% 0% round 0px)" }, {
          clipPath: "inset(7% 5% 12% 5% round 6px)", ease: "none",
          scrollTrigger: { trigger: sec, start: "top top", end: "bottom top", scrub: true },
        });
        const img = YULA.$$("img, canvas", stage);
        gsap.fromTo(img, { scale: 1 }, {
          scale: 1.1, ease: "none",
          scrollTrigger: { trigger: sec, start: "top top", end: "bottom top", scrub: true },
        });
      });
    });
    return () => ctx.revert();
  });

  YULA.module("fx-hgal", (root) => {
    const sec = YULA.$("[data-hgal]", root);
    if (!sec || !motionOK() || !window.ScrollTrigger) return;
    const gsap = window.gsap;
    const track = YULA.$(".hgal__track", sec);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 64rem)", () => {
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const tw = gsap.to(track, {
        x: () => -dist(), ease: "none",
        // refreshPriority: sabitleme boşluğu, sayfada AŞAĞIDAKİ bölümlerin (Hizmetler vb.) tetik
        // noktalarından önce hesaplanmalı; yoksa onların tetikleri galeri uzunluğu kadar kayar
        scrollTrigger: { trigger: sec, start: "top top", end: () => `+=${dist()}`, pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1, refreshPriority: 1 },
      });
      // her görselin içi şeritle ters yönde hafifçe kayar (derinlik)
      const imgs = YULA.$$(".hgal__shot img", sec);
      gsap.set(imgs, { scale: 1.12 });
      const par = imgs.map((img) => gsap.fromTo(img, { xPercent: -5 }, {
        xPercent: 5, ease: "none",
        scrollTrigger: { trigger: img.closest(".hgal__item"), containerAnimation: tw, start: "left right", end: "right left", scrub: true },
      }));
      window.ScrollTrigger.sort();
      window.ScrollTrigger.refresh();
      return () => { par.forEach((p) => p.kill()); gsap.set(imgs, { clearProps: "all" }); };
    });
    return () => mm.revert();
  });

  YULA.module("fx-skew", (root) => {
    if (!motionOK() || YULA.lite()) return;
    const gsap = window.gsap;
    const shots = YULA.$$(".card__shot, .flow .shot, .jpost__media, .jteaser__media, .pnext__media, .hgal__shot", root);
    if (!shots.length) return;
    const set = gsap.quickSetter(shots, "skewY", "deg");
    const proxy = { skew: 0 };
    const tick = () => {
      const target = clamp(velocity() * -0.12, -3.5, 3.5);
      proxy.skew += (target - proxy.skew) * 0.12;
      if (Math.abs(proxy.skew) < 0.01) proxy.skew = 0;
      set(proxy.skew);
    };
    gsap.ticker.add(tick);
    return () => { gsap.ticker.remove(tick); gsap.set(shots, { skewY: 0 }); };
  });
})();

/* 99-init.js */
/* Tüm modülleri başlatır ve temizleme fonksiyonlarını saklar
   (faz e: sayfa geçişinde YULA.destroy() → yeni sayfada YULA.init()). */
(function () {
  let cleanups = [];
  YULA.init = (root = document) => {
    cleanups = YULA.modules.map(({ name, init }) => {
      try { return init(root); } catch (err) { console.error(`[YULA] ${name}`, err); return null; }
    }).filter((fn) => typeof fn === "function");
  };
  YULA.destroy = () => { cleanups.forEach((fn) => fn()); cleanups = []; };
  YULA.init();
})();
