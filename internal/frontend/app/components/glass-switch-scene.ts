// Preserves the uploaded glass-switch geometry, OKLab palette and light/dot motion.
// The original 320x164 track is cropped into the compact navigation canvas.
type Dot = { x: number; y: number; a: number; star?: boolean };

export function createGlassSwitchScene(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return null;
  const ctx: CanvasRenderingContext2D = context;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");

  const track = { x: 60, y: 58, w: 320, h: 164, r: 58 };
  const knob = { y: 70, size: 140, radius: 46, left: 72, travel: 156 };
  const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const ease = (t: number) => t * t * (3 - 2 * t);
  const rgba = (c: number[], a = 1) => `rgba(${c.map(x => Math.round(clamp(x, 0, 255))).join(',')},${a})`;

  // All palette anchors are converted to OKLab once. Interpolation is never done in RGB.
  function toLab(hex: string) {
    const srgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = srgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
    const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
    const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
    return [.2104542553*l + .793617785*m - .0040720468*s,
            1.9779984951*l - 2.428592205*m + .4505937099*s,
            .0259040371*l + .7827717662*m - .808675766*s];
  }
  function fromLab([L, a, b]: number[]) {
    const l = (L + .3963377774*a + .2158037573*b) ** 3;
    const m = (L - .1055613458*a - .0638541728*b) ** 3;
    const s = (L - .0894841775*a - 1.2914855480*b) ** 3;
    return [4.0767416621*l - 3.3077115913*m + .2309699292*s,
           -1.2684380046*l + 2.6097574011*m - .3413193965*s,
           -.0041960863*l - .7034186147*m + 1.7076147010*s]
      .map(v => clamp(v, 0, 1))
      .map(v => 255 * (v <= .0031308 ? 12.92*v : 1.055*v**(1/2.4) - .055));
  }
  const stops = [0, .24, .49, .73, 1];
  const palettes: Record<string, number[][]> = Object.fromEntries(Object.entries({
    page:       ['#0d1423','#222b46','#7685a6','#d8d8df','#f2f0eb'],
    trackTop:   ['#111827','#2a304c','#61728f','#b6bcc8','#d3d2d0'],
    trackBot:   ['#080e19','#171d36','#4d5a7c','#a8abb8','#c1bfbd'],
    glassTop:   ['#596b88','#747b9f','#b1b8d4','#f8f7ed','#ffffff'],
    glassBot:   ['#28364d','#4d577c','#8193b2','#c6c7c5','#ddd6cb'],
    light:      ['#64baff','#bcadff','#ffffff','#ffe2a1','#ffb65f'],
    points:     ['#ecfaff','#f5edff','#fffaf7','#d9ae74','#a97643']
  }).map(([key, hexes]) => [key, hexes.map(toLab)]));
  function color(key: string, t: number) {
    const palette = palettes[key];
    let i = stops.findIndex((_, index) => index < stops.length - 1 && t <= stops[index + 1]);
    if (i < 0) i = stops.length - 2;
    const f = clamp((t - stops[i]) / (stops[i + 1] - stops[i]));
    return fromLab(palette[i].map((v, n) => mix(v, palette[i + 1][n], f)));
  }
  function rounded(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }
  function linear(y0: number, y1: number, top: number[], bottom: number[]) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(top)); g.addColorStop(1, rgba(bottom));
    return g;
  }
  function radial(x: number, y: number, radius: number, rgb: number[], alpha: number) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, rgba(rgb, alpha));
    g.addColorStop(.4, rgba(rgb, alpha * .42));
    g.addColorStop(1, rgba(rgb, 0));
    return g;
  }

  // Clockwise rounded-rectangle perimeter, parameter zero at the top midpoint.
  function perimeter(x: number, y: number, size: number, r: number, u: number): [number, number] {
    const straight = size - 2*r, corner = Math.PI*r/2;
    const lengths = [straight/2,corner,straight,corner,straight,corner,straight,corner,straight/2];
    const total = lengths.reduce((a,b) => a+b, 0);
    let d = ((u % 1) + 1) % 1 * total;
    let i = 0;
    while (i < lengths.length - 1 && d > lengths[i]) d -= lengths[i++];
    const f = d / lengths[i];
    const X = x + size, Y = y + size;
    switch (i) {
      case 0: return [x + size/2 + d, y];
      case 1: return [X-r + r*Math.cos(-Math.PI/2 + f*Math.PI/2), y+r + r*Math.sin(-Math.PI/2 + f*Math.PI/2)];
      case 2: return [X, y+r + d];
      case 3: return [X-r + r*Math.cos(f*Math.PI/2), Y-r + r*Math.sin(f*Math.PI/2)];
      case 4: return [X-r - d, Y];
      case 5: return [x+r + r*Math.cos(Math.PI/2 + f*Math.PI/2), Y-r + r*Math.sin(Math.PI/2 + f*Math.PI/2)];
      case 6: return [x, Y-r - d];
      case 7: return [x+r + r*Math.cos(Math.PI + f*Math.PI/2), y+r + r*Math.sin(Math.PI + f*Math.PI/2)];
      default: return [x+r + d, y];
    }
  }

  // Deterministic pseudo-random offsets keep the dot layout stable at every drag position.
  const hash = (n: number) => { const x = Math.sin(n*127.1 + 78.233)*43758.5453; return x - Math.floor(x); };
  const moon: Dot[] = [], sun: Dot[] = [];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
    const disk = Math.hypot(x-6.6, y-7.4) <= 5.6;
    const cut = Math.hypot(x-9.2, y-5.0) < 4.9;
    if (disk) moon.push({x,y,a:cut ? .16 : 1});
    if (Math.hypot(x-7, y-7) <= 3.3) sun.push({x,y,a:1});
  }
  // The small cross is independent of the moon's silhouette.
  moon.push({x:12.5,y:1.5,a:1,star:true});
  for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])
    moon.push({x:12.5+dx,y:1.5+dy,a:.6,star:true});
  for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]])
    for (const radius of [5,6]) sun.push({x:7+dx*radius,y:7+dy*radius,a:1});
  for (const [dx,dy] of [[1,1],[-1,1],[-1,-1],[1,-1]])
    sun.push({x:7+dx*4.6/Math.SQRT2,y:7+dy*4.6/Math.SQRT2,a:1});
  const angle = (p: Dot) => Math.atan2(p.y-7, p.x-7);
  moon.sort((a,b) => angle(a)-angle(b));
  sun.sort((a,b) => angle(a)-angle(b));
  const paired: [Dot, Dot][] = [], matched = Math.min(moon.length,sun.length);
  const usedMoon = new Set(), usedSun = new Set();
  for (let i = 0; i < matched; i++) {
    const mi = Math.floor((i+.5)*moon.length/matched);
    const si = Math.floor((i+.5)*sun.length/matched);
    usedMoon.add(mi); usedSun.add(si);
    paired.push([moon[mi],sun[si]]);
  }
  moon.forEach((p,i) => { if (!usedMoon.has(i)) paired.push([p,{...p,a:0}]); });
  sun.forEach((p,i) => { if (!usedSun.has(i)) paired.push([{...p,a:0},p]); });

  // Random offsets and perimeter points are invariant during every drag frame.
  const grains = paired.map(([m, s], i) => ({
    m, s,
    delay: hash(i+11)*.25,
    spin: .6+hash(i+43)*.8,
    driftX: 2*hash(i+71)-1,
    driftY: 2*hash(i+93)-1,
  }));
  // The compact ~60px track does not resolve the original 90 blurred segments.
  const edgeSteps = 40;
  const edgePoints = Array.from({ length: edgeSteps + 1 }, (_, i) =>
    perimeter(0, 0, 143, 47.5, i / edgeSteps),
  );

  let width = 0, height = 0;
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    width = Math.round(bounds.width * ratio);
    height = Math.round(bounds.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function render(position: number, now: number) {
    const p = clamp(position), a = ease(p), cx = knob.left + knob.travel*p;
    const light = color('light',p), pointColor = color('points',p);
    const u0 = .60 + .53*a, haloPoint = perimeter(cx-1.5,knob.y-1.5,143,47.5,u0);
    if (!width || !height) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.setTransform(width / 350, 0, 0, height / 190, 0, 0);
    ctx.translate(-45, -43);
    // The capsule is the entire visual boundary: nothing may paint outside it.
    rounded(track.x, track.y, track.w, track.h, track.r);
    ctx.clip();

    // The recessed track keeps its inset shading; exterior drop shadows are removed.
    rounded(track.x,track.y,track.w,track.h,track.r);
    ctx.fillStyle = linear(track.y,track.y+track.h,color('trackTop',p),color('trackBot',p));
    ctx.fill();

    ctx.save();
    rounded(track.x,track.y,track.w,track.h,track.r); ctx.clip();
    // Stroke shadow is clipped inward, creating a genuine inset bevel.
    rounded(track.x+3,track.y+3,track.w-6,track.h-6,track.r-3);
    ctx.strokeStyle = `rgba(0,5,18,${mix(.85,.22,a)})`;
    ctx.lineWidth = 12; ctx.shadowColor = `rgba(0,4,16,${mix(.85,.22,a)})`;
    ctx.shadowBlur = 17; ctx.shadowOffsetY = 6; ctx.stroke();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = radial(haloPoint[0],haloPoint[1],110,light,mix(.38,.28,a));
    ctx.fillRect(track.x,track.y,track.w,track.h);
    ctx.restore();
    rounded(track.x+.5,track.y+.5,track.w-1,track.h-1,track.r-.5);
    ctx.strokeStyle = `rgba(255,255,255,${mix(.06,.55,a)})`;
    ctx.lineWidth = 1; ctx.stroke();

    // Matte glass key, with colored subsurface diffusion.
    ctx.save();
    rounded(cx,knob.y,knob.size,knob.size,knob.radius);
    ctx.fillStyle = linear(knob.y,knob.y+knob.size,color('glassTop',p),color('glassBot',p));
    ctx.shadowColor = `rgba(0,7,23,${mix(.62,.22,a)})`;
    ctx.shadowBlur = mix(22,16,a); ctx.shadowOffsetY = mix(10,7,a);
    ctx.fill(); ctx.restore();
    ctx.save();
    rounded(cx,knob.y,knob.size,knob.size,knob.radius); ctx.clip();
    ctx.fillStyle = radial(haloPoint[0],haloPoint[1],105,light,mix(.42,.26,a));
    ctx.fillRect(cx,knob.y,knob.size,knob.size);
    const gloss = ctx.createLinearGradient(0,knob.y,0,knob.y+knob.size*.7);
    gloss.addColorStop(0,`rgba(255,255,255,${mix(.10,.65,a)})`);
    gloss.addColorStop(.56,`rgba(255,255,255,${mix(.035,.10,a)})`);
    gloss.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = gloss; ctx.fillRect(cx,knob.y,knob.size,knob.size*.7);
    ctx.restore();
    rounded(cx+.5,knob.y+.5,knob.size-1,knob.size-1,knob.radius-.5);
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,255,255,${mix(.14,.90,a)})`; ctx.stroke();

    // Pixel grains morph continuously; no self-running transition animation.
    const dotSpacing = 5.6;
    const centerX = cx+70, centerY = knob.y+70;
    const starPulse = media.matches ? 1 : .87 + .13*Math.sin(now*.0031);
    ctx.save();
    if (p < .6) {
      ctx.shadowColor = rgba([212,239,255], mix(.52,0,p/.6));
      ctx.shadowBlur = mix(5,0,p/.6);
    }
    grains.forEach(({m,s,delay,spin,driftX,driftY}) => {
      const f = ease(clamp((p-delay)/(1-delay)));
      const x = mix(m.x,s.x,f)-7, y = mix(m.y,s.y,f)-7;
      const theta = Math.sin(Math.PI*f)*1.1*spin;
      const c = Math.cos(theta), sn = Math.sin(theta);
      const drift = Math.sin(Math.PI*f)*2.2;
      const px = (x*c-y*sn+drift*driftX)*dotSpacing;
      const py = (x*sn+y*c+drift*driftY)*dotSpacing;
      const alpha = mix(m.a,s.a,f)*(m.star ? mix(starPulse,1,f) : 1);
      if (alpha <= .007) return;
      const size = 4.3*(1-.15*Math.sin(Math.PI*f));
      ctx.fillStyle = rgba(pointColor,alpha);
      ctx.fillRect(centerX+px-size/2,centerY+py-size/2,size,size);
    });
    ctx.restore();

    // Screen-resolution-adaptive rim, with the original soft aura and white core.
    const half = mix(.22,.19,a);
    for (let pass = 0; pass < 2; pass++) {
      ctx.save();
      if (p < .6) ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineWidth = pass ? 2.2 : 4.2;
      ctx.shadowBlur = pass ? 8 : 26;
      ctx.shadowColor = pass ? 'rgba(255,255,255,.78)' : rgba(light,.85);
      for (let i = 0; i < edgeSteps; i++) {
        const u = (i+.5)/edgeSteps;
        const d = ((u-u0+.5)%1+1)%1-.5;
        if (Math.abs(d) > half) continue;
        const fade = Math.exp(-2.6*(d/half)**2);
        ctx.strokeStyle = pass ? `rgba(255,255,255,${fade*mix(.90,.55,a)})`
                               : rgba(light,fade*.72);
        const one = edgePoints[i], two = edgePoints[i + 1];
        ctx.beginPath();
        ctx.moveTo(cx - 1.5 + one[0], knob.y - 1.5 + one[1]);
        ctx.lineTo(cx - 1.5 + two[0], knob.y - 1.5 + two[1]);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }


  return { resize, render };
}
