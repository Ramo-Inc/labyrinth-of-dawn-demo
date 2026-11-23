"use strict";

(() => {
  const game = document.querySelector("#game");
  const { cards, gear, items, skills, rooms, enemy } = Dawn;
  const asset = name => `assets/${name}.webp`;
  const art = name => `<img class="bg" src="${asset(name)}" alt="">`;
  const button = (name, action, value = "", extra = "") => `<button type="button" class="btn ${extra}" data-action="${action}" data-value="${value}">${name}</button>`;
  const screen = (name, body) => `<section class="screen ${name}">${body}</section>`;
  const directions = { n: [0,-1], w: [-1,0], e: [1,0], s: [0,1] };
  const directionNames = { n:"北", w:"西", e:"東", s:"南" };
  const opposite = { n:"s", w:"e", e:"w", s:"n" };
  const mapPositions = { A:[50,83], B:[50,57], C:[31,57], D:[12,57], E:[69,57], F:[88,57], G:[50,29] };
  const allLoot = { ...items, ...gear };
  let run = Dawn.start();
  let location = "title";
  let fight = null;
  let position = [4,3];
  let heading = "n";
  let pendingWalk = 0;
  let walking = false;
  let route = null;
  let stride = 0;
  let transitioning = false;
  let deckId = 2;
  let option = null;
  let transferMode = false;
  let selectedCard = null;
  let pickingWaste = false;
  let resolving = false;
  let toastToken = 0;
  let ready = false;
  let loadingError = null;
  const artNames = [
    "title","departure","desk","arena","hero-idle",
    ...["run","slash","heavy"].flatMap(move => Array.from({length:4},(_,i) => `hero-${move}-${i}`)),
    ...["front","back","side"].flatMap(dir => Array.from({length:4},(_,i) => `walk-${dir}-${i}`)),
    "rat","gray","bat","large","lantern","chest","chest-open",
    ...Object.keys(rooms).map(id => `room-${id.toLowerCase()}`),
    ...Object.keys(cards).map(id => `card-${id}`),
    ...Object.values(allLoot).map(item => item.art),
  ];

  function loadArt() {
    loadingError = null;
    Promise.all([...new Set(artNames)].map(async name => {
      const image = new Image();
      image.src = asset(name);
      try { await image.decode(); } catch { throw Error(name); }
    })).then(() => { ready = true; }).catch(error => { loadingError = error.message; })
      .finally(() => { if (location === "departure") { render(); focusPrimary(); } });
  }

  function focusPrimary() {
    game.querySelector("[data-focus]")?.focus({ preventScroll: true });
  }

  function show(name) {
    pendingWalk++;
    route = null;
    walking = false;
    location = name;
    render();
    focusPrimary();
  }

  async function transition(name, onSwitch, after) {
    if (transitioning) return;
    transitioning = true;
    const old = game.querySelector(".screen");
    old.inert = true;
    await DawnEffects.animate(old,[{opacity:1},{opacity:0}],210);
    onSwitch?.();
    show(name);
    const next = game.querySelector(".screen");
    next.inert = true;
    await DawnEffects.animate(next,[{opacity:0},{opacity:1}],230);
    next.inert = false;
    transitioning = false;
    focusPrimary();
    after?.();
  }

  function status() {
    const xpTarget = [0,5,12][run.level];
    const xp = xpTarget ? `${run.xp}/${xpTarget}` : `${run.xp}`;
    return `<p class="status"><b>Lv${run.level}</b><span>HP <b>${run.hp}/${run.maxHp}</b></span><span>MP <b>${run.mp}/${run.maxMp}</b></span><span>EXP <b>${xp}</b></span><strong>${run.gold}G</strong></p>`;
  }

  function title() {
    return screen("title", art("title") + `<div class="intro"><h1 class="display">黎明の迷宮</h1><button data-focus class="btn" data-action="departure">はじめる　›</button></div>`);
  }

  function departure() {
    return screen("departure", art("departure") + `<div class="mission"><p class="subtitle">第1章　地下1階</p><h1 class="display">旧坑道</h1><p>町の灯を取り戻すため、旧坑道へ。<br>通路を歩き、拾った装備と手札で奥へ進もう。</p>${loadingError ? `<p>画像「${loadingError}」を読み込めませんでした。</p>${button("読み込み直す","preload")}` : `<button data-focus class="btn accent" data-action="start" ${ready ? "" : "disabled"}>${ready ? "旧坑道に入る　›" : "坑道の素材を準備中"}</button>`}${status()}</div>`);
  }

  function cellPosition([x,y]) {
    return [8 + x * 10.5, 30 + y * 12.6];
  }

  function cellStyle(cell) {
    const [x,y] = cellPosition(cell);
    return `left:${x}%;top:${y}%`;
  }

  function edgeCell(room, dir) {
    if (dir === "n") return [4,0];
    if (dir === "s") return [4,4];
    return [dir === "w" ? 0 : 8, room === "B" ? 1 : 2];
  }

  function reachableCell(x, y) {
    if (x < 0 || x > 8 || y < 0 || y > 4) return false;
    const room = rooms[run.room];
    if ((x === 5 && y === 2 && (room.chest || (room.foes && !run.cleared.has(run.room))))
      || (x === 6 && y === 3 && room.shop)) return false;
    if (x > 0 && x < 8 && y > 0 && y < 4) return true;
    return Object.keys(rooms[run.room].exits).some(dir => {
      const [ex,ey] = edgeCell(run.room, dir);
      return x === ex && y === ey;
    });
  }

  function neighbors(cell) {
    return Object.entries(directions).map(([dir,[x,y]]) => ({dir, cell:[cell[0]+x,cell[1]+y]})).filter(({cell:[x,y]}) => reachableCell(x,y));
  }

  function blocked(dir) {
    return !run.cleared.has(run.room) && ((run.room === "A" && dir === "n") || (["C","E"].includes(run.room) && rooms[run.room].exits[dir] !== "B"));
  }

  function routeLabel(destination, dir) {
    if (run.seen.has(destination)) return `${directionNames[dir]}　${rooms[destination].name}`;
    const next = rooms[destination];
    const clue = next.foes ? "敵の気配" : next.chest ? "物置の灯り" : next.shop ? "補給の灯り" : next.name;
    return `${directionNames[dir]}　${clue}`;
  }

  function hotspots() {
    const room = rooms[run.room];
    const exits = Object.entries(room.exits).map(([dir, target]) => ({ id: dir, cell:edgeCell(run.room,dir), text: routeLabel(target,dir), disabled: blocked(dir) }));
    if (room.foes && !run.cleared.has(run.room)) exits.push({ id:"foes", cell:[5,2], text:room.foes.length > 1 ? `${enemy[room.foes[0][0]].name} ×2` : enemy[room.foes[0][0]].name, img:room.foes[0][0] });
    if (room.chest) exits.push({ id:"chest", cell:[5,2], text:run.opened.has(run.room) ? "開けた箱" : run.room === "D" ? "道具箱を開ける" : "宝箱を開ける", img:run.opened.has(run.room) ? "chest-open" : "chest" });
    if (room.shop) exits.push({ id:"shop", cell:[6,3], text:"補給棚", img:"lantern" });
    return exits;
  }

  function minimap() {
    const known = new Set(run.seen);
    for (const key of run.seen) Object.values(rooms[key].exits).forEach(id => known.add(id));
    const lines = [];
    for (const key of run.seen) {
      for (const id of Object.values(rooms[key].exits)) {
        if (run.seen.has(id) && key > id) continue;
        const [x,y] = mapPositions[key];
        const [xx,yy] = mapPositions[id];
        const length = xx === x ? `calc(${Math.abs(yy-y)}% * .653)` : `${Math.abs(xx-x)}%`;
        const angle = xx === x ? (yy > y ? 90 : -90) : xx > x ? 0 : 180;
        lines.push(`<i class="map-line" style="left:${x}%;top:${y}%;width:${length};transform:rotate(${angle}deg)"></i>`);
      }
    }
    const nodes = [...known].map(key => {
      const [x,y] = mapPositions[key];
      const here = key === run.room;
      return `<span style="left:${x}%;top:${y}%" title="${run.seen.has(key) ? rooms[key].name : "未探索"}" class="map-node ${here ? "here" : run.seen.has(key) ? "seen" : ""}">${here ? "◆" : run.seen.has(key) ? (run.cleared.has(key) || run.opened.has(key) ? "✓" : "") : "?"}</span>`;
    });
    return `<div class="map" aria-label="地下1階の地図"><h2>地下1階の地図</h2>${lines.join("")}${nodes.join("")}</div>`;
  }

  function field() {
    const room = rooms[run.room];
    const tiles = [];
    for (let y = 0; y <= 4; y++) for (let x = 0; x <= 8; x++) if (reachableCell(x,y)) {
      tiles.push(`<button type="button" tabindex="-1" class="tile" aria-label="歩く" data-action="tile" data-value="${x},${y}" style="${cellStyle([x,y])}"></button>`);
    }
    const objects = hotspots().map(target => {
      const sprite = target.img ? `<img class="field-object ${target.img}" src="${asset(target.img)}" alt="" style="${cellStyle(target.cell)}">` : "";
      return sprite + `<button type="button" class="hotspot" data-action="interact" data-value="${target.id}" aria-disabled="${Boolean(target.disabled)}" style="${cellStyle(target.cell)}">${target.text}</button>`;
    }).join("");
    return screen("field", art(`room-${run.room.toLowerCase()}`) + `
      <div class="tile-plane">${tiles.join("")}<img class="field-actor" src="${asset(`walk-${{n:"back",s:"front",e:"side",w:"side"}[heading]}-1`)}" alt="剣士" style="${cellStyle(position)};--facing:${heading === "w" ? -1 : 1}">${objects}</div>
      <header class="field-top"><h1 class="display">旧坑道　地下1階 <span>・</span> ${room.name}</h1>${status()}</header>
      <div class="field-side">${minimap()}<div class="field-controls">${button(`デッキ${run.points ? ` <span class="copper">＋${run.points}</span>` : ""}`,"deck")}${button("持ち物","inventory")}${button("遠征","pause")}</div></div>
      <p class="field-tip"><span>移動</span> クリック / 矢印　 <span>調べる</span> 対象をクリック / Enter</p>`);
  }

  const key = cell => cell.join(",");
  const same = (a,b) => a[0] === b[0] && a[1] === b[1];

  function pathTo(targets) {
    const queue = [{ cell: position, path: [] }];
    const seen = new Set([key(position)]);
    while (queue.length) {
      const next = queue.shift();
      if (targets.some(target => same(target, next.cell))) return next.path;
      for (const adjacent of neighbors(next.cell)) {
        const tag = key(adjacent.cell);
        if (seen.has(tag)) continue;
        seen.add(tag);
        queue.push({ cell: adjacent.cell, path: [...next.path, adjacent] });
      }
    }
    return null;
  }

  function follow(path, arrived) {
    if (!path) return;
    route = { steps:[...path], arrived };
    if (!walking) moveAlongRoute();
  }

  async function moveAlongRoute() {
    const journey = pendingWalk;
    walking = true;
    while (location === "field" && journey === pendingWalk && route) {
      const step = route.steps.shift();
      if (!step) {
        const arrived = route.arrived;
        route = null;
        DawnEffects.fieldPose(game.querySelector(".field-actor"),heading);
        walking = false;
        arrived?.();
        return;
      }
      const actor = game.querySelector(".field-actor");
      const from = cellPosition(position);
      position = step.cell;
      heading = step.dir;
      await DawnEffects.walkField(actor,from,cellPosition(position),heading,stride++);
    }
    if (journey === pendingWalk) walking = false;
  }

  function useHotspot(id) {
    const hit = hotspots().find(target => target.id === id);
    if (!hit) return;
    if (hit.disabled) {
      toast("奥へ進むには、部屋の敵を倒そう");
      return;
    }
    if (id === "foes") {
      fight = Dawn.battle(run.room);
      selectedCard = null;
      pickingWaste = false;
      return transition("battle");
    }
    if (id === "shop") return show("shop");
    if (id === "chest") {
      const loot = Dawn.openChest(run);
      render();
      toast(loot.length ? loot.map(id => allLoot[id].name).join("・") + "を手に入れた" : "中身は回収済み");
      return;
    }
    const next = rooms[run.room].exits[id];
    if (next) {
      const entrance = edgeCell(next, opposite[id]);
      const towardRoom = directions[id];
      const inside = [entrance[0] + towardRoom[0], entrance[1] + towardRoom[1]];
      return transition("field", () => {
        run.room = next;
        run.seen.add(next);
        position = entrance;
        heading = id;
      }, () => follow([{dir:id,cell:inside}]));
    }
  }

  function approach(id) {
    const hit = hotspots().find(target => target.id === id);
    if (!hit) return;
    const destinations = rooms[run.room].exits[id] && !hit.disabled
      ? [hit.cell] : neighbors(hit.cell).map(n => n.cell);
    follow(pathTo(destinations), () => useHotspot(id));
  }

  function cardHtml(id, action, chosen = false, locked = false) {
    const card = run.deck[id];
    const inBattle = action === "battle-card";
    const a = Dawn.stats(run, id, inBattle ? fight : null);
    const skill = skills[card.skill];
    const label = a.aim === "self" ? "被ダメージ半減" : `${a.aim === "all" ? "全体" : "単体"}${a.power}ダメージ`;
    const short = inBattle && !pickingWaste && run.mp < a.cost;
    const availability = locked ? "locked" : short ? "short" : chosen ? "selected" : "ready";
    const useLabel = locked ? "補充中" : short ? `MP不足　あと${a.cost - run.mp}` : pickingWaste ? "選ぶと捨てる"
      : chosen ? "選択中" : a.aim === "single" ? "使用可　敵選択" : "使用可　即発動";
    return `<button type="button" class="card ${chosen ? "chosen" : ""}" data-action="${action}" data-value="${id}"
      ${inBattle ? `data-availability="${availability}"` : ""} ${short ? 'aria-disabled="true"' : ""} ${locked ? "disabled" : ""}
      aria-pressed="${chosen}" title="${short ? `MP${a.cost}が必要` : skill?.note ?? label}">
      <span class="card-head">${a.name}<span class="cost" title="消費MP">${inBattle ? '<small>MP</small>' : ""}${a.cost}</span></span>
      <img src="${asset(`card-${card.type}`)}" alt="">
      <small>${label}</small><small class="inscription ${skill ? "set" : ""} ${skill?.root ? "evolved" : ""}">${skill?.name ?? (inBattle ? "" : "付与枠 空き")}</small>
      ${inBattle ? `<small class="card-use">${useLabel}</small>` : ""}
    </button>`;
  }

  function playerHud(hp = run.hp, mp = run.mp) {
    return `<span>剣士</span><b>HP ${hp}/${run.maxHp}</b><meter min="0" max="${run.maxHp}" value="${hp}"></meter><small>MP ${mp}/${run.maxMp}</small>`;
  }

  function foeHud(foe, hp = foe.hp) {
    const info = enemy[foe.type];
    return `<span>${info.name}</span><b>HP ${hp}/${foe.maxHp}</b><meter min="0" max="${foe.maxHp}" value="${hp}"></meter><small>${hp ? `${info.action} ${foe.damage}` : "撃破"}</small>`;
  }

  function battleItems(locked) {
    return `<h3>持ち物 <small>使うと1手</small></h3>${Object.entries(items).map(([id,item]) => {
      const reason = !run.items[id] ? "所持なし" : run[item.attr] === run[item.max] ? "満タン" : "";
      return `<button class="btn" data-action="battle-item" data-value="${id}" ${reason || locked ? "disabled" : ""}>
        <img src="${asset(item.art)}" alt=""><span>${item.name} ×${run.items[id]}<br><small>${reason || `${item.attr.toUpperCase()}＋${item.amount}`}</small></span>
      </button>`;
    }).join("")}`;
  }

  function defaultPrediction() {
    return pickingWaste ? "札を1枚選ぶと捨てて1手進む"
      : selectedCard !== null ? "敵を押すと攻撃を確定" : "";
  }

  const battlePhases = {
    player: ["自分の手番","使える手札を1枚選ぶ"],
    aim: ["攻撃する敵を選ぶ","敵を押すと使用確定　Escで解除"],
    waste: ["捨てる札を選ぶ","1枚捨てて1手進む　Escで解除"],
    spend: ["使用確定","手札から使用した札が消える"],
    strike: ["自分の攻撃",""],
    guard: ["自分の行動",""],
    enemy: ["敵の手番",""],
    draw: ["手札を補充",""],
    end: ["戦闘終了",""],
  };

  function battlePhase(stage, name, hint) {
    stage.dataset.phase = name;
    const [title, note] = battlePhases[name];
    const label = stage.querySelector(".phase-label");
    if (label.textContent !== title) label.textContent = title;
    stage.querySelector(".phase-hint").textContent = hint ?? note;
  }

  function battleControls(locked = false) {
    const stage = game.querySelector(".battle");
    stage.querySelector(".battle-title b").textContent = `${fight.turn}手目`;
    stage.querySelector(".hand").innerHTML = fight.hand.map(id => cardHtml(id,"battle-card", id === selectedCard, locked)).join("");
    stage.querySelector(".battle-left").innerHTML = `<p>山札 <b>${fight.pile.length}</b>　捨て札 <b>${fight.discard.length}</b></p>
      ${button(pickingWaste ? "待機を解除" : "待機（1手）","wait")}`;
    stage.querySelector(".battle-left button").disabled = locked;
    stage.querySelector(".battle-items").innerHTML = battleItems(locked);
    if (!locked) {
      battlePhase(stage, pickingWaste ? "waste" : selectedCard !== null ? "aim" : "player");
      stage.querySelector(".prediction").textContent = defaultPrediction();
    }
    stage.querySelectorAll(".enemy-target").forEach((target, i) => {
      const eligible = !locked && fight.enemies[i].hp > 0 && selectedCard !== null;
      target.dataset.targetable = String(eligible);
      target.tabIndex = eligible ? 0 : -1;
      target.disabled = !eligible;
    });
  }

  function battleScreen() {
    const enemies = fight.enemies.map((e,index) => `<div class="fighter enemy" data-foe="${e.id}" data-type="${e.type}" style="left:${fight.enemies.length === 1 ? 72 : 65 + index * 17}%">
      <img src="${asset(e.type)}" alt=""><div class="fighter-hud">${foeHud(e)}</div>
      <button class="enemy-target" data-action="target" data-value="${e.id}" aria-label="${enemy[e.type].name} ${index + 1}を攻撃" tabindex="-1"><span>この敵に攻撃</span></button>
      </div>`).join("");
    return screen("battle", art("arena") + `
      <header class="battle-title">
        <p>旧坑道　地下1階 <b></b></p>
        <strong class="phase-label" role="status"></strong>
        <p class="phase-hint"></p>
      </header>
      <div class="fighter hero"><img src="${asset("hero-idle")}" alt=""><div class="fighter-hud">${playerHud()}</div></div>
      ${enemies}<canvas id="fx" aria-hidden="true"></canvas>
      <div class="battle-readout"><p class="prediction"></p><p class="used-message"></p></div>
      <div class="hand" aria-label="手札4枚"></div>
      <div class="battle-left"></div><aside class="battle-items"></aside>`);
  }

  function showPrediction(id,target) {
    if (location !== "battle" || resolving) return;
    const view = game.querySelector(".prediction");
    if (pickingWaste) { view.textContent = defaultPrediction(); return; }
    const move = Dawn.preview(run, fight, id, target);
    if (run.mp < move.cost) { view.textContent = `この札は使えない　必要MP ${move.cost} ／ 現在MP ${run.mp}`; return; }
    let result = move.targets.length ? move.targets.map(e => `HP ${e.hp} → ${Math.max(0,e.hp-move.power)}`).join("　/　")
      : `単体 ${move.power}ダメージ　敵を選ぶと確定`;
    if (move.aim === "self") {
      const resolution = Dawn.simulate(run, fight, {kind:"play",id});
      result = "受けるダメージ　" + resolution.events.filter(e => e.type === "enemy").map(e => e.amount).join("　＋　");
    }
    const s = skills[run.deck[id].skill];
    const named = cards[run.deck[id].type].name;
    view.innerHTML = `<b>${named}の予測</b>${result}${move.cost ? `　 MP ${run.mp} → ${run.mp-move.cost}` : ""}${s ? `　 ${s.name}` : ""}`;
  }

  function eventState(stage, event) {
    stage.querySelector(".hero .fighter-hud").innerHTML = playerHud(event.state.hp,event.state.mp);
    event.state.enemies.forEach((hp,index) => {
      const node = stage.querySelector(`[data-foe="${index}"]`);
      node.querySelector(".fighter-hud").innerHTML = foeHud(fight.enemies[index],hp);
    });
  }

  function lootHtml(ids) {
    return `<div class="loot-list">${ids.map(id => `<span class="loot-chip"><img src="${asset(allLoot[id].art)}" alt="">${allLoot[id].name}</span>`).join("")}</div>`;
  }

  async function action(command) {
    if (resolving || location !== "battle") return;
    const result = Dawn.resolve(run,fight,command);
    if (!result) return;
    resolving = true;
    selectedCard = null;
    pickingWaste = false;
    const stage = game.querySelector(".battle");
    stage.setAttribute("aria-busy","true");
    stage.querySelectorAll("button").forEach(node => node.disabled = true);
    stage.querySelectorAll(".enemy-target").forEach(node => node.dataset.targetable = "false");
    const line = stage.querySelector(".prediction");
    const receipt = stage.querySelector(".used-message");
    const name = command.kind === "item" ? items[command.id].name : cards[run.deck[command.id].type].name;
    receipt.textContent = "";
    try {
      if (command.kind !== "item") {
        battlePhase(stage,"spend",command.kind === "wait" ? "選んだ札を手放す" : `${name}を使う`);
        line.textContent = command.kind === "wait" ? `待機　${name}を捨てる` : `${name}　使用を確定`;
        const start = result.events[0].state;
        stage.querySelector(".hero .fighter-hud").innerHTML = playerHud(start.hp,start.mp);
        const used = stage.querySelector(`.hand [data-value="${command.id}"]`);
        await DawnEffects.consumeCard(stage,used);
        receipt.textContent = command.kind === "wait" ? `捨てた札　${name}` : `使った札　${name}`;
      }
      for (const e of result.events) {
        if (e.type === "draw") {
          battlePhase(stage,"draw","山札から空いた位置に1枚入る");
          line.textContent = "使用札を捨て札へ";
          battleControls(true);
          await DawnEffects.drawCard(stage,e.slot);
          continue;
        }
        const skill = e.skill ? skills[e.skill].name : "";
        if (e.type === "enemy") {
          battlePhase(stage,"enemy","手札は次の手番から使える");
          const enemyInfo = enemy[fight.enemies[e.id].type];
          line.textContent = enemyInfo.name + "の" + enemyInfo.action + (e.breakdown.length ? "　" + e.breakdown.join("　") : "");
        } else if (e.type === "attack") {
          battlePhase(stage,"strike","接近して斬り込む");
          line.textContent = cards[e.move].name + (skill ? `　${skill}が発動` : "");
        } else {
          if (["guard","item","wait"].includes(e.type)) battlePhase(stage,"guard","一手を解決中");
          if (e.type === "item") receipt.textContent = `使った道具　${name}`;
          line.textContent = skill || (e.type === "guard" ? "守る" : e.type === "wait" ? "待機" : e.type === "magic" ? "魔力回収" : name);
        }
        await DawnEffects.play(stage,e,() => {
          eventState(stage,e);
          if (e.type === "attack") {
            battlePhase(stage,"strike","命中");
            line.textContent = e.hits.map(hit => `${hit.amount}ダメージ${hit.killed ? "・撃破" : ""}`).join("　/　");
          }
          if (e.type === "enemy") line.textContent += e.amount ? `　被ダメージ ${e.amount}` : "　防いだ";
        });
        e.state.enemies.forEach((hp,i) => stage.querySelector(`[data-foe="${i}"]`).classList.toggle("dead",hp === 0));
      }
      if (result.won || result.lost) {
        battlePhase(stage,"end",result.won ? "敵を倒した" : "剣士が倒れた");
        await DawnEffects.wait(230);
      }
    } finally {
      resolving = false;
      stage.removeAttribute("aria-busy");
      if (result.won || result.lost) showResult(stage,result.won);
      else {
        battleControls();
        if (receipt.textContent) receipt.textContent = "前の手　" + receipt.textContent;
        stage.querySelector('.hand [data-availability="ready"]')?.focus({ preventScroll:true });
      }
    }
  }

  function showResult(stage, won) {
    const reward = won ? Dawn.win(run,fight) : null;
    const title = won ? reward.achieved ? "探索の成果" : "勝利" : "遠征の終わり";
    const note = won ? `<p>EXP ＋${reward.xp}　　${reward.gold}G</p>${lootHtml(reward.loot)}
      ${reward.gained ? `<p class="result-level">Lv${reward.level} に上がった<br>最大HP ${reward.oldMaxHp} → ${run.maxHp}　　成長点 ＋${reward.gained}</p>` : ""}
      ${reward.achieved ? "<p>装備と進化したカードを使い、奥の戦いに勝った。</p>" : ""}`
      : "<p>倒れた。装備と育て方を変えて、坑道をもう一度探索できる。</p>";
    stage.insertAdjacentHTML("beforeend", `<div class="battle-result"><article class="result-box" role="dialog" aria-modal="true" aria-label="${title}"><h2 class="display">${title}</h2>${note}
      <button data-focus class="btn accent" data-action="${won ? "after-win" : "start"}">${won ? "探索に戻る" : "入口から再挑戦"}</button>
      ${won && run.points ? button("カードに付与","reward-deck") : ""}</article></div>`);
    const layer = stage.querySelector(".battle-result");
    DawnEffects.animate(layer,[{opacity:0},{opacity:1}],280);
    focusPrimary();
  }

  function deckScreen() {
    const card = run.deck[deckId];
    const own = skills[card.skill];
    const loadedRoots = new Set(run.deck.filter(c => c.skill).map(c => skills[c.skill].root ?? c.skill));
    const roots = Dawn.roots.map(id => {
      const allowed = Dawn.compatible(card,id) && !loadedRoots.has(id);
      const reason = allowed ? "" : loadedRoots.has(id) ? "　取得済み" : "　対象外";
      const text = `<b>${skills[id].name}</b>${reason}<small>${skills[id].note}</small>`;
      return `<button class="btn" data-action="skill" data-value="${id}" aria-pressed="${option === id}" ${allowed ? "" : "disabled"}>${text}</button>`;
    });
    const branches = (own?.branches ?? []).map(id => `<button class="btn" data-action="skill" data-value="${id}" aria-pressed="${option === id}"><b>${skills[id].name}</b><small>${skills[id].note}</small></button>`);
    const next = option ? skills[option] : null;
    let delta = "";
    if (next) {
      const proposed = { ...run, deck: run.deck.map(c => c.id === deckId ? { ...c, skill:option } : c) };
      const before = Dawn.stats(run,deckId);
      const after = Dawn.stats(proposed,deckId);
      if (before.power !== after.power) delta = `　${before.power} → ${after.power}ダメージ`;
      if (before.cost !== after.cost) delta += `　MP ${before.cost} → ${after.cost}`;
    }
    const target = transferMode ? run.deck.filter(c => Dawn.transferAllowed(run, deckId, c.id)) : [];
    const details = transferMode ? `<p>移す先のカードを選ぶ</p><div class="option-row">${target.map(c => button(`${cards[c.type].name}　${c.id + 1}枚目`,"transfer",c.id)).join("")}${target.length ? "" : "<p>対応する空き枠がありません</p>"}</div>${button("移し替えを閉じる","transfer-mode")}`
      : `<p>付与中　${own?.name ?? "空き枠"}${own ? "　" + own.note : ""}</p>
        ${own ? `<div class="option-row two">${branches.join("")}</div>${button("別のカードに移す","transfer-mode")}` : `<div class="option-row">${roots.join("")}</div>`}
        ${next ? `<p class="preview-line">適用後　${next.name}${delta}<br>${next.note}</p><button class="btn accent" data-action="apply" ${run.points ? "" : "disabled"}>${run.points ? `1点で${next.root ? "進化" : "付与"}` : "成長点1が必要"}</button>` : ""}`;
    return screen("overlay", art("desk") + `<div class="detail"><header class="detail-head"><div><h1 class="display">カードへの付与</h1><p>旧坑道　地下1階</p></div><p>成長点 <b>${run.points}</b></p></header>
      <div class="deck-layout"><div class="deck-grid" aria-label="所持デッキ">${run.deck.map(c => cardHtml(c.id, "inspect", deckId === c.id)).join("")}</div><section class="deck-inspect"><h2>${cards[card.type].name}　${deckId + 1}枚目</h2>${details}</section></div>
      <footer class="detail-foot"><p>デッキ 7枚　Lv${run.level}</p>${button("探索に戻る","field")}</footer></div>`);
  }

  function inventoryScreen(shop = false) {
    const list = Object.entries(items).map(([id,item]) => {
      const allowed = shop ? run.gold >= item.cost : Boolean(run.items[id] && run[item.attr] < run[item.max]);
      const label = shop ? (allowed ? `${item.cost}Gで買う` : `${item.cost}Gが必要`) : run[item.attr] === run[item.max] ? "満タン" : run.items[id] ? "使う" : "所持なし";
      return `<li><img src="${asset(item.art)}" alt=""><span><b>${item.name} ×${run.items[id]}</b><small>${item.attr.toUpperCase()}${item.amount}回復</small></span><button class="btn" data-action="${shop ? "buy" : "use"}" data-value="${id}" ${allowed ? "" : "disabled"}>${label}</button></li>`;
    });
    const equipment = [...run.gear].sort((a,b) => gear[a].slot.localeCompare(gear[b].slot)).map(id => {
      const item = gear[id];
      const equipped = run[item.slot] === id;
      return `<li><img src="${asset(item.art)}" alt=""><span><b>${item.name}</b><small>${item.slot === "weapon" ? "武器" : "防具"}　${item.note}</small></span>
        <button class="btn" data-action="equip" data-value="${id}" ${equipped ? "disabled" : ""}>${equipped ? "装備中" : "装備する"}</button></li>`;
    });
    return screen("overlay", art("desk") + `<div class="detail"><header class="detail-head"><div><h1 class="display">${shop ? "補給棚" : "持ち物と装備"}</h1><p>旧坑道　地下1階</p></div>${status()}</header>
      <div class="shelf"><section><h2>${shop ? "補給品" : "道具"}</h2><ul>${list.join("")}</ul></section>
      ${shop ? "" : `<section><h2>武器・防具</h2><ul>${equipment.join("")}</ul></section>`}</div>
      <footer class="detail-foot"><p>${shop ? "足りない薬を補う" : `武器 ${gear[run.weapon].name}　　防具 ${gear[run.armor].name}`}</p>${button("探索に戻る","field")}</footer></div>`);
  }

  function pauseScreen() {
    return screen("overlay", art("desk") + `<div class="battle-result"><article class="result-box"><h2 class="display">遠征</h2><p>入口からやり直すと、地図と持ち物が出発時の状態に戻る。</p>${button("探索に戻る","field","", "accent")} ${button("入口からやり直す","start")}</article></div>`);
  }

  const views = { title, departure, field, battle:battleScreen, deck:deckScreen, inventory:() => inventoryScreen(), shop:() => inventoryScreen(true), pause:pauseScreen };

  function render() {
    game.innerHTML = views[location]();
    if (location === "battle") battleControls();
  }

  function toast(message) {
    const token = ++toastToken;
    game.querySelector(".toast")?.remove();
    const banner = document.createElement("p");
    banner.className = "toast";
    banner.role = "status";
    banner.textContent = message;
    game.append(banner);
    setTimeout(() => { if (token === toastToken) banner.remove(); }, 2100);
  }

  const openDeck = () => {
    option = null;
    transferMode = false;
    show("deck");
  };
  const controls = {
    preload:() => { loadArt(); render(); },
    departure:() => show("departure"),
    start:() => { run = Dawn.start(); fight = null; position = [4,3]; heading = "n"; show("field"); },
    field:() => show("field"),
    inventory:() => show("inventory"),
    pause:() => show("pause"),
    deck:openDeck,
    "after-win":() => transition("field",() => { fight = null; }),
    "reward-deck":() => transition("deck",() => { fight = null; option = null; transferMode = false; }),
    tile:value => follow(pathTo([value.split(",").map(Number)])),
    interact:approach,
    inspect:value => { deckId = Number(value); option = null; transferMode = false; render(); },
    skill:value => { option = value; render(); },
    apply:() => { if (option && Dawn.assign(run, deckId, option)) { const name = skills[option].name; option = null; render(); toast(name + "を付与した"); } },
    "transfer-mode":() => { transferMode = !transferMode; option = null; render(); },
    transfer:value => { const to = Number(value); if (Dawn.transfer(run, deckId, to)) { deckId = to; transferMode = false; render(); toast("付与を移した"); } },
    equip:value => { if (Dawn.equip(run,value)) { render(); toast(gear[value].name + "を装備した"); } },
    buy:value => { if (Dawn.buy(run,value)) { render(); toast(items[value].name + "を補充した"); } },
    use:value => { const amount = Dawn.drink(run,value); if (amount) { render(); toast(`${items[value].attr.toUpperCase()}を${amount}回復した`); } },
    "battle-item":value => action({kind:"item",id:value}),
    wait:() => { pickingWaste = !pickingWaste; selectedCard = null; battleControls(); },
    "battle-card":value => {
      const id = Number(value);
      if (pickingWaste) return action({kind:"wait",id});
      const move = Dawn.stats(run,id,fight);
      if (run.mp < move.cost) return showPrediction(id);
      if (move.aim !== "single") return action({kind:"play",id});
      selectedCard = id;
      battleControls();
      const firstTarget = game.querySelector('.enemy-target[data-targetable="true"]');
      game.querySelector(`.hand [data-value="${id}"]`)?.setAttribute("aria-pressed","true");
      firstTarget?.focus({preventScroll:true});
    },
    target:value => { if (selectedCard !== null) action({kind:"play",id:selectedCard,target:Number(value)}); },
  };

  game.addEventListener("click", event => {
    const control = event.target.closest("[data-action]");
    if (!control || resolving || transitioning) return;
    controls[control.dataset.action]?.(control.dataset.value ?? "");
  });

  function previewInput(event) {
    const node = event.target.closest("[data-action]");
    if (!node || location !== "battle" || resolving || game.querySelector(".battle-result")) return;
    if (node.dataset.action === "battle-card") showPrediction(Number(node.dataset.value));
    if (node.dataset.action === "target" && selectedCard !== null && node.dataset.targetable === "true") showPrediction(selectedCard,Number(node.dataset.value));
  }
  game.addEventListener("pointerover",previewInput);
  game.addEventListener("focusin",previewInput);

  document.addEventListener("keydown", event => {
    if (transitioning) return;
    const key = event.key.toLowerCase();
    if (location === "battle" && key === "escape" && !resolving && !game.querySelector(".battle-result")) {
      selectedCard = null;
      pickingWaste = false;
      battleControls();
      return;
    }
    if (["deck","inventory","shop","pause"].includes(location) && key === "escape") {
      show("field");
      return;
    }
    if (location !== "field" || event.altKey || event.metaKey || event.ctrlKey) return;
    const nav = { w:"n",arrowup:"n",s:"s",arrowdown:"s",a:"w",arrowleft:"w",d:"e",arrowright:"e" };
    if (nav[key]) {
      event.preventDefault();
      const step = neighbors(position).find(adjacent => adjacent.dir === nav[key]);
      if (step) follow([step]);
      return;
    }
    if (key === "enter" && !event.target.closest("button")) {
      const nearby = hotspots().filter(target => Math.abs(position[0]-target.cell[0])+Math.abs(position[1]-target.cell[1]) <= 1);
      const forward = directions[heading];
      const target = nearby.find(hit => same(hit.cell,[position[0]+forward[0],position[1]+forward[1]])) ?? nearby[0];
      if (target) approach(target.id);
    }
  });
  loadArt();
  render();
  focusPrimary();
})();
