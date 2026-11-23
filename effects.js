"use strict";

const DawnEffects = (() => {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const asset = name => `assets/${name}.webp`;
  const wait = ms => new Promise(done => setTimeout(done, motion.matches ? Math.min(ms, 65) : ms));

  function animate(node, frames, duration, easing = "cubic-bezier(.19,.71,.35,1)") {
    if (!node || motion.matches || !node.animate) return wait(duration);
    return node.animate(frames, { duration, easing }).finished.catch(() => {});
  }

  const gait = { n:"back", s:"front", e:"side", w:"side" };

  function tween(duration, update, reducedDuration = 90) {
    const span = motion.matches ? reducedDuration : duration;
    const started = performance.now();
    return new Promise(done => {
      function frame(now) {
        const progress = Math.min(1, (now - started) / span);
        update(progress);
        if (progress === 1) done();
        else requestAnimationFrame(frame);
      }
      update(0);
      requestAnimationFrame(frame);
    });
  }

  function setPose(sprite, name) {
    const source = asset(name);
    if (sprite.getAttribute("src") !== source) sprite.setAttribute("src", source);
  }

  function fieldPose(sprite, direction, index = 1) {
    sprite.style.setProperty("--facing", direction === "w" ? -1 : 1);
    setPose(sprite, `walk-${gait[direction]}-${index}`);
  }

  function walkField(sprite, from, to, direction, step) {
    const horizontal = direction === "e" || direction === "w";
    return tween(horizontal ? 194 : 156, progress => {
      if (!sprite.isConnected) return;
      sprite.style.left = `${from[0] + (to[0] - from[0]) * progress}%`;
      sprite.style.top = `${from[1] + (to[1] - from[1]) * progress}%`;
      const stride = motion.matches ? 1 : (step * 2 + (progress >= .52 ? 1 : 0)) % 4;
      fieldPose(sprite, direction, stride);
    });
  }

  function run(sprite, from, to, duration, backwards = false) {
    if (motion.matches) return wait(70);
    return tween(duration, progress => {
      const elapsed = progress * duration;
      const index = Math.floor(elapsed / 68) % 4;
      setPose(sprite, `hero-run-${backwards ? 3-index : index}`);
      const dx = from.x + (to.x - from.x) * progress;
      const dy = from.y + (to.y - from.y) * progress;
      const bob = Math.sin(Math.PI * progress) * Math.sin(elapsed / 24) * 1.6;
      sprite.style.transform = shift(dx,dy+bob);
    });
  }

  function relative(node, stage) {
    const origin = stage.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    return { x:rect.left-origin.left, y:rect.top-origin.top, w:rect.width, h:rect.height };
  }

  const shift = (x,y,scale=1) => `translate(${x}px,${y}px) scale(${scale})`;

  async function consumeCard(stage, card) {
    if (!card) return;
    const original = relative(card,stage);
    const effect = card.cloneNode(true);
    effect.disabled = false;
    effect.removeAttribute("data-action");
    effect.removeAttribute("data-value");
    effect.removeAttribute("aria-disabled");
    effect.removeAttribute("aria-pressed");
    effect.setAttribute("aria-hidden","true");
    effect.tabIndex = -1;
    effect.className = "card played-card";
    effect.style.cssText = `left:${original.x}px;top:${original.y}px;width:${original.w}px;height:${original.h}px;`;
    card.classList.add("vacated");
    stage.append(effect);
    const lift = original.h * .24;
    const raised = shift(0,-lift,1.08) + " rotate(-4deg)";
    try {
      await animate(effect, [
        {transform:shift(0,0),opacity:1},
        {transform:raised,opacity:1},
      ],170);
      effect.style.transform = raised;
      await wait(80);
      const center = {x:original.x + original.w*.5,y:original.y + original.h*.44-lift};
      await Promise.all([
        animate(effect, [
          {transform:raised,opacity:1,clipPath:"inset(0% 0% 0% 0%)"},
          {transform:shift(0,-lift-20,.74)+" rotate(9deg)",opacity:.76,clipPath:"inset(9% 13% 17% 13%)",offset:.48},
          {transform:shift(0,-lift-40,.3)+" rotate(19deg)",opacity:0,clipPath:"inset(48% 49% 49% 49%)"},
        ],295,"linear"),
        paint(stage,(ctx,t,unit) => {
          sparks(ctx,center,t,unit*.52,"#ffdc9b");
          ctx.save();
          ctx.translate(center.x,center.y);
          ctx.globalAlpha=(1-t)*.8;
          for (let i=0;i<10;i++) {
            const angle=(i*.73+1.5);
            const r=unit*t*(.015+.002*i);
            ctx.save();
            ctx.translate(Math.cos(angle)*r,Math.sin(angle)*r-unit*.037*t);
            ctx.rotate(angle+t*4);
            ctx.fillStyle=i%4===0?"#fbe1ad":"#a8845b";
            const d=unit*(.0028+.002*(i%3))*(1-t*.7);
            ctx.fillRect(-d/2,-d/2,d,d*.58);
            ctx.restore();
          }
          ctx.restore();
        },310),
      ]);
    } finally {
      effect.remove();
    }
  }

  async function drawCard(stage, slot) {
    const card = stage.querySelectorAll(".hand button")[slot];
    if (!card) return;
    const to = relative(card,stage);
    const from = relative(stage.querySelector(".battle-left"),stage);
    card.classList.add("arriving");
    await animate(card, [
      {transform:shift(from.x + from.w*.45 - to.x, from.y - to.y, .18),opacity:.18},
      {transform:shift(8,-16,1.03),opacity:1,offset:.82},
      {transform:shift(0,0),opacity:1},
    ], 285);
    card.classList.remove("arriving");
  }

  function point(node, stage, vertical = .75) {
    const box = node.getBoundingClientRect();
    const origin = stage.getBoundingClientRect();
    return { x: box.left - origin.left + box.width * .5, y: box.top - origin.top + box.height * vertical };
  }

  function paint(stage, draw, ms) {
    const canvas = stage.querySelector("canvas");
    const { width, height } = canvas.getBoundingClientRect();
    const density = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round(height * density));
    const context = canvas.getContext("2d");
    context.setTransform(density, 0, 0, density, 0, 0);
    const start = performance.now();
    const duration = motion.matches ? Math.min(ms, 170) : ms;
    return new Promise(done => {
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        context.clearRect(0, 0, width, height);
        if (t >= 1 || !stage.isConnected) {
          done();
          return;
        }
        draw(context, t, width);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function trace(ctx, p, t, unit, type, empowered) {
    const gain = type === "sweep" ? 1.35 : type === "heavy" ? 1.13 : .85;
    const length = unit * .128 * gain;
    const tilt = type === "heavy" ? 1.04 : type === "sweep" ? -.2 : -.7;
    const fade = Math.max(0, 1 - t * 1.42);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(tilt);
    ctx.scale(.72 + Math.min(1, t * 5) * .3, 1);
    ctx.globalAlpha = fade;
    const gradient = ctx.createLinearGradient(-length * .65, 0, length * .65, 0);
    gradient.addColorStop(0, "#f5cb8f00");
    gradient.addColorStop(.44, empowered ? "#f1b66d" : "#e2ded0");
    gradient.addColorStop(.8, "#fff4d9");
    gradient.addColorStop(1, "#ffedc150");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-length * .68, -length * .12);
    ctx.quadraticCurveTo(-length * .08, length * .32, length * .65, -length * .12);
    ctx.quadraticCurveTo(length * .07, length * .07, -length * .68, -length * .12);
    ctx.fill();
    ctx.restore();
  }

  function sparks(ctx, at, t, unit, light) {
    ctx.save();
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(1, unit * .002 * (1 - t));
    ctx.lineCap = "round";
    ctx.globalAlpha = (1 - t) * .85;
    for (let index = 0; index < 9; index++) {
      const angle = index * Math.PI * 2 / 9;
      const r = unit * t * (.024 + index * .0035);
      const reach = Math.max(1, unit * (.009 - t * .005));
      const x = at.x + Math.cos(angle) * r;
      const y = at.y + Math.sin(angle) * r + unit * .017 * t * t;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
      ctx.stroke();
    }
    ctx.restore();
  }

  function floating(ctx, text, p, t, unit, color = "#fff0d6") {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.round(unit * .028)}px system-ui,sans-serif`;
    ctx.globalAlpha = t < .64 ? 1 : (1 - t) / .36;
    const y = p.y - unit * (.019 + .055 * t);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#151a1b";
    ctx.strokeText(text, p.x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, p.x, y);
    ctx.restore();
  }

  function flash(node, dx, dead = false) {
    const img = node.querySelector("img");
    return animate(img, [
      { transform: "translateX(0)", opacity: 1, filter: "brightness(1)" },
      { transform: `translateX(${dx}px) rotate(${dx > 0 ? 3 : -3}deg)`, opacity: dead ? .58 : 1, filter: "brightness(1.65)", offset: .19 },
      { transform: "translateX(0)", opacity: dead ? .18 : 1, filter: "brightness(1)" },
    ], 270);
  }

  // Contact points are measured at the visible blade tip in the generated pose.
  const strikes = {
    slash: { contact:3, tip:[.916,.735], before:[138,80,84] },
    heavy: { contact:2, tip:[.943,.793], before:[163,106], follow:3 },
  };
  const home = {x:0,y:0};

  async function attack(stage, event, impact) {
    const hero = stage.querySelector(".hero img");
    const targets = event.hits.map(hit => ({ ...hit, node: stage.querySelector(`[data-foe="${hit.id}"]`) }));
    const move = event.move === "heavy" ? "heavy" : "slash";
    const strike = strikes[move];
    const centers = targets.map(hit => ({
      ...hit,
      position:point(hit.node,stage,hit.node.dataset.type === "bat" ? .72 : .82),
    }));
    const {position:contact} = centers[0];
    const box = relative(hero,stage);
    const spriteSide = Math.min(box.w,box.h);
    const blade = {
      x:box.x+(box.w-spriteSide)/2+spriteSide*strike.tip[0],
      y:box.y+box.h-spriteSide+spriteSide*strike.tip[1],
    };
    const reach = motion.matches ? home : {
      x:Math.max(0,contact.x-blade.x),
      y:Math.max(-stage.clientHeight*.105,Math.min(stage.clientHeight*.085,contact.y-blade.y)),
    };
    const plant = {x:Math.max(0,reach.x-stage.clientWidth*.028),y:reach.y*.78};
    const sprint = Math.max(340,Math.min(552,850*reach.x/stage.clientWidth+145));
    await run(hero,home,plant,sprint);
    hero.style.transform = shift(plant.x,plant.y);
    for (const [index,ms] of strike.before.entries()) {
      setPose(hero,`hero-${move}-${index}`);
      if (index === 0) await wait(ms);
      else await tween(ms,t => {
        const reachProgress=(index-.55+t*.55)/strike.contact;
        hero.style.transform = shift(plant.x+(reach.x-plant.x)*reachProgress,plant.y+(reach.y-plant.y)*reachProgress);
      },45);
    }
    hero.style.transform = shift(reach.x,reach.y);
    setPose(hero,`hero-${move}-${strike.contact}`);
    impact();
    const curve = event.move === "sweep"
      ? {x:(centers[0].position.x+centers.at(-1).position.x)/2,y:contact.y}
      : contact;
    await Promise.all([
      paint(stage,(ctx,t,unit) => {
        trace(ctx,curve,t,unit,event.move,Boolean(event.skill));
        for (const hit of centers) {
          sparks(ctx,hit.position,t,unit,event.skill ? "#ffd696" : "#eee1ca");
          floating(ctx,`−${hit.amount}`,hit.position,t,unit);
        }
      },430),
      ...targets.map(hit => flash(hit.node,stage.clientWidth*.019,hit.killed)),
      (async () => {
        await wait(142);
        if (strike.follow) setPose(hero,`hero-${move}-${strike.follow}`);
        await wait(113);
        await run(hero,reach,home,Math.min(390,sprint),true);
        hero.style.transform = "";
        setPose(hero,"hero-idle");
      })(),
    ]);
  }

  async function bite(stage, event, impact) {
    const attacker = stage.querySelector(`[data-foe="${event.id}"] img`);
    const hero = stage.querySelector(".hero");
    const left = point(hero, stage);
    const distance = motion.matches ? 0 : Math.min(0,left.x-point(attacker,stage).x+stage.clientWidth*.098);
    await tween(255, t => {
      const lunge = t * t * (3 - 2 * t);
      attacker.style.transform = shift(distance*lunge,-Math.sin(Math.PI*t)*6);
    });
    impact();
    await Promise.all([
      flash(hero, -stage.clientWidth * .012),
      (async () => {
        await wait(95);
        await tween(220, t => { attacker.style.transform = shift(distance*(1-t),-Math.sin(Math.PI*t)*3); });
        attacker.style.transform = "";
      })(),
      paint(stage, (ctx, t, unit) => {
        sparks(ctx, left, t, unit, event.amount ? "#efa578" : "#cbd5df");
        floating(ctx, event.amount ? `−${event.amount}` : "防いだ", left, t, unit);
      }, 320),
    ]);
  }

  function pulse(stage, target, label, color, kind = "circle") {
    const p = point(target, stage);
    return paint(stage, (ctx, t, unit) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t * 1.15);
      ctx.lineWidth = Math.max(1, unit * .002);
      ctx.strokeStyle = color;
      ctx.beginPath();
      if (kind === "shield") ctx.arc(p.x, p.y - unit * .02, unit * (.037 + t * .036), -.84, .84);
      else ctx.ellipse(p.x, p.y + unit * .045, unit * (.035 + t * .055), unit * (.013 + t * .025), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      sparks(ctx, p, t, unit, color);
      floating(ctx, label, p, t, unit, color);
    }, 385);
  }

  async function play(stage, event, impact = () => {}) {
    if (event.type === "attack") return attack(stage, event, impact);
    if (event.type === "enemy") return bite(stage, event, impact);
    impact();
    const hero = stage.querySelector(".hero");
    if (event.type === "guard") return pulse(stage, hero, "防御", "#d0dbeb", "shield");
    if (event.type === "counter") {
      const target = stage.querySelector(`[data-foe="${event.id}"]`);
      return Promise.all([
        flash(target, stage.clientWidth * .005, event.killed),
        pulse(stage, target, `反撃 −${event.amount}`, "#ffcd98", "shield"),
      ]);
    }
    if (event.type === "magic") return pulse(stage, hero, "MP +1", "#b9d8e5");
    if (event.type === "item") return pulse(stage, hero, `+${event.amount} ${event.id === "heal" ? "HP" : "MP"}`, event.id === "heal" ? "#c8d99c" : "#b9d8e5");
    return wait(100);
  }

  return { play, animate, wait, fieldPose, walkField, consumeCard, drawCard };
})();
