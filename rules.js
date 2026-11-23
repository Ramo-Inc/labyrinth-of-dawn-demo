"use strict";

const Dawn = (() => {
  const cards = {
    slash: { name: "斬撃", mp: 0, power: 4, aim: "single" },
    sweep: { name: "横薙ぎ", mp: 2, power: 4, aim: "all" },
    heavy: { name: "強打", mp: 2, power: 7, aim: "single" },
    guard: { name: "守る", mp: 0, power: 0, aim: "self" },
  };
  const types = ["slash", "slash", "sweep", "sweep", "heavy", "guard", "guard"];
  const gear = {
    travelSword: { name: "旅の剣", slot: "weapon", note: "基礎の攻撃力", art: "starter-sword" },
    iron: { name: "鉄剣", slot: "weapon", note: "斬撃 4 → 5", art: "iron" },
    hammer: { name: "大槌", slot: "weapon", note: "強打 7 → 9", art: "hammer" },
    travelCoat: { name: "旅装", slot: "armor", note: "基礎の防御", art: "starter-coat" },
    leather: { name: "革鎧", slot: "armor", note: "毎手の最初の被ダメージを1軽減", art: "leather" },
    mantle: { name: "厚布の外套", slot: "armor", note: "一戦の最初の被ダメージを2軽減", art: "mantle" },
  };
  const items = {
    heal: { name: "回復薬", attr: "hp", max: "maxHp", amount: 6, cost: 4, art: "heal" },
    mana: { name: "魔力薬", attr: "mp", max: "maxMp", amount: 4, cost: 6, art: "mana" },
  };
  const skills = {
    hone: { name: "研ぎ澄まし", note: "ダメージ＋2", branches: ["edge", "stagger"] },
    edge: { name: "鋭刃", note: "ダメージ＋3", root: "hone" },
    stagger: { name: "崩し刃", note: "ダメージ＋2。生き残った敵の攻撃を1軽減", root: "hone" },
    save: { name: "節約", note: "消費MP−1（最低1）", branches: ["first", "reclaim"] },
    first: { name: "先手の節約", note: "戦闘中の初回はMP0。以後は節約", root: "save" },
    reclaim: { name: "魔力回収", note: "節約に加え、撃破時にMP1回復", root: "save" },
    riposte: { name: "押し返し", note: "守って被弾した敵に2ダメージ。1手に1回", branches: ["retort", "bulwark"] },
    retort: { name: "強反撃", note: "守って被弾した敵に4ダメージ。1手に1回", root: "riposte" },
    bulwark: { name: "堅守", note: "最初の被ダメージをさらに1軽減。反撃は2", root: "riposte" },
  };
  const roots = ["hone", "save", "riposte"];
  const enemy = {
    rat: { name: "坑道ネズミ", action: "かみつき" },
    gray: { name: "灰牙ネズミ", action: "かみつき" },
    bat: { name: "坑道コウモリ", action: "急降下" },
    large: { name: "大きい灰牙ネズミ", action: "かみつき" },
  };
  const rooms = {
    A: { name: "坑道入口", exits: { n: "B" }, foes: [["rat", 8, 2]], xp: 5, gold: 6, loot: ["heal"] },
    B: { name: "分岐", exits: { n: "G", w: "C", e: "E", s: "A" }, shop: true },
    C: { name: "運搬路", exits: { w: "D", e: "B" }, foes: [["gray", 6, 3], ["gray", 6, 3]], xp: 7, gold: 8, loot: ["iron"] },
    D: { name: "工具置場", exits: { e: "C" }, chest: ["hammer", "mana"] },
    E: { name: "水抜き路", exits: { w: "B", e: "F" }, foes: [["bat", 5, 3], ["bat", 5, 2]], xp: 7, gold: 8, loot: ["leather"] },
    F: { name: "備品庫", exits: { w: "E" }, chest: ["mantle", "heal"] },
    G: { name: "奥の広間", exits: { s: "B" }, foes: [["large", 7, 3], ["large", 7, 3]], xp: 7, gold: 10, loot: ["heal"] },
  };
  const roomOrder = ["A", "B", "C", "D", "E", "F", "G"];

  function start() {
    return {
      room: "A", seen: new Set(["A"]), cleared: new Set(), opened: new Set(),
      level: 1, xp: 0, points: 0, hp: 24, maxHp: 24, mp: 8, maxMp: 8, gold: 0,
      items: { heal: 0, mana: 0 }, gear: new Set(["travelSword", "travelCoat"]),
      weapon: "travelSword", armor: "travelCoat", everEquipped: false, achieved: false,
      deck: types.map((type, id) => ({ type, id, skill: null })),
    };
  }

  function shuffle(values, random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function battle(room, random = Math.random, order) {
    const all = types.map((_, id) => id);
    const entry = [0, 1, 2, 5];
    const deck = order ?? (room === "A" ? [...entry, ...shuffle(all.filter(id => !entry.includes(id)), random)] : shuffle(all, random));
    return {
      hand: deck.slice(0, 4), pile: deck.slice(4), discard: [], random,
      enemies: rooms[room].foes.map(([type, hp, damage], id) => ({ id, type, hp, maxHp: hp, damage })),
      turn: 1, used: new Set(), usedEvolved: false, mantleSpent: false,
    };
  }

  function transferAllowed(run, from, to) {
    return from !== to && Boolean(run.deck[from]?.skill) && run.deck[to]?.skill === null && compatible(run.deck[to], run.deck[from].skill);
  }

  function compatible(card, skill) {
    const root = skills[skill].root ?? skill;
    const base = cards[card.type];
    if (root === "riposte") return base.aim === "self";
    if (root === "save") return base.mp > 0;
    return base.power > 0;
  }

  function assign(run, id, skill) {
    const card = run.deck[id];
    const definition = skills[skill];
    if (!card || !definition || !run.points || !compatible(card, skill)) return false;
    if (definition.root ? card.skill !== definition.root : card.skill || run.deck.some(other => other.skill && (skills[other.skill].root ?? other.skill) === skill)) return false;
    run.points--;
    card.skill = skill;
    return true;
  }

  function transfer(run, from, to) {
    if (!transferAllowed(run, from, to)) return false;
    run.deck[to].skill = run.deck[from].skill;
    run.deck[from].skill = null;
    return true;
  }

  function equip(run, id) {
    if (!run.gear.has(id) || !gear[id] || run[gear[id].slot] === id) return false;
    run[gear[id].slot] = id;
    if (!["travelSword", "travelCoat"].includes(id)) run.everEquipped = true;
    return true;
  }

  function stats(run, id, active = null) {
    const card = run.deck[id];
    const base = cards[card.type];
    const weaponBonus = (run.weapon === "iron" && card.type === "slash" ? 1 : 0) + (run.weapon === "hammer" && card.type === "heavy" ? 2 : 0);
    const skillBonus = card.skill === "edge" ? 3 : ["hone", "stagger"].includes(card.skill) ? 2 : 0;
    const isSave = card.skill && (skills[card.skill].root ?? card.skill) === "save";
    const cost = card.skill === "first" && active && !active.used.has(id) ? 0 : isSave ? Math.max(1, base.mp - 1) : base.mp;
    return { ...base, cost, power: base.power + weaponBonus + skillBonus, weaponBonus, skillBonus };
  }

  function receive(run, id) {
    if (items[id]) run.items[id]++;
    if (gear[id]) run.gear.add(id);
  }

  function buy(run, id) {
    const item = items[id];
    if (!item || run.gold < item.cost) return false;
    run.gold -= item.cost;
    receive(run, id);
    return true;
  }

  function openChest(run) {
    const loot = rooms[run.room].chest;
    if (!loot || run.opened.has(run.room)) return [];
    run.opened.add(run.room);
    loot.forEach(id => receive(run, id));
    return loot;
  }

  function drink(run, id) {
    const item = items[id];
    if (!item || !run.items[id] || run[item.attr] >= run[item.max]) return 0;
    const amount = Math.min(item.amount, run[item.max] - run[item.attr]);
    run.items[id]--;
    run[item.attr] += amount;
    return amount;
  }

  function win(run, fight) {
    if (run.cleared.has(run.room)) return null;
    const room = rooms[run.room];
    run.cleared.add(run.room);
    const oldMaxHp = run.maxHp;
    run.gold += room.gold;
    run.xp += room.xp;
    while (run.level < 3 && run.xp >= [0, 5, 12][run.level]) {
      run.level++;
      run.maxHp += 2;
      run.hp += 2;
      run.points++;
    }
    room.loot.forEach(id => receive(run, id));
    const achieved = !run.achieved && run.level >= 3 && run.everEquipped && fight.usedEvolved;
    run.achieved ||= achieved;
    return { xp: room.xp, gold: room.gold, loot: room.loot, level: run.level, oldMaxHp, gained: (run.maxHp - oldMaxHp) / 2, achieved };
  }

  function preview(run, fight, id, targetId) {
    const result = stats(run, id, fight);
    const living = fight.enemies.filter(e => e.hp > 0);
    return { ...result, targets: result.aim === "all" ? living : living.filter(e => e.id === targetId && result.power > 0) };
  }

  function resolve(run, fight, action) {
    const { kind, id, target } = action;
    if (run.hp <= 0 || !fight.enemies.some(e => e.hp > 0)) return null;
    const events = [];
    const snapshot = () => ({ hp: run.hp, mp: run.mp, enemies: fight.enemies.map(e => e.hp) });
    const emit = (type, data = {}) => events.push({ type, ...data, state: snapshot() });
    let guard = false;
    let skill = null;
    if (kind === "item") {
      const amount = drink(run, id);
      if (!amount) return null;
      emit("item", { id, amount });
    } else {
      if (!fight.hand.includes(id)) return null;
      const card = run.deck[id];
      if (kind === "play") {
        const move = preview(run, fight, id, target);
        if (run.mp < move.cost || (move.aim === "single" && !move.targets.length)) return null;
        run.mp -= move.cost;
        skill = card.skill;
        fight.used.add(id);
        fight.usedEvolved ||= Boolean(skill && skills[skill].root);
        guard = move.aim === "self";
        if (guard) emit("guard", { skill });
        else {
          const hits = move.targets.map(e => {
            e.hp = Math.max(0, e.hp - move.power);
            return { id: e.id, killed: e.hp === 0, amount: move.power };
          });
          emit("attack", { hits, move: card.type, skill });
          if (skill === "reclaim" && hits.some(hit => hit.killed) && run.mp < run.maxMp) {
            run.mp++;
            emit("magic", { amount: 1 });
          }
        }
      } else if (kind === "wait") emit("wait");
      else return null;
    }
    let leatherSpent = false;
    let bulwarkSpent = false;
    let counterSpent = false;
    for (const e of fight.enemies) {
      if (e.hp <= 0) continue;
      let amount = e.damage;
      const breakdown = [];
      if (skill === "stagger" && events[0].hits.some(hit => hit.id === e.id)) {
        amount = Math.max(0, amount - 1);
        breakdown.push("崩し刃 −1");
      }
      if (guard) {
        amount = Math.floor(amount / 2);
        breakdown.push("守る");
      }
      if (amount > 0 && run.armor === "leather" && !leatherSpent) {
        amount--;
        leatherSpent = true;
        breakdown.push("革鎧 −1");
      }
      if (amount > 0 && run.armor === "mantle" && !fight.mantleSpent) {
        amount = Math.max(0, amount - 2);
        fight.mantleSpent = true;
        breakdown.push("外套 −2");
      }
      if (amount > 0 && skill === "bulwark" && !bulwarkSpent) {
        amount--;
        bulwarkSpent = true;
        breakdown.push("堅守 −1");
      }
      run.hp = Math.max(0, run.hp - amount);
      emit("enemy", { id: e.id, amount, breakdown });
      if (run.hp === 0) break;
      if (amount > 0 && !counterSpent && ["riposte", "retort", "bulwark"].includes(skill)) {
        counterSpent = true;
        const damage = skill === "retort" ? 4 : 2;
        e.hp = Math.max(0, e.hp - damage);
        emit("counter", { id: e.id, amount: damage, killed: e.hp === 0, skill });
      }
    }
    const won = fight.enemies.every(e => e.hp === 0);
    const lost = run.hp === 0;
    if (!won && !lost) {
      if (kind !== "item") {
        const spot = fight.hand.indexOf(id);
        fight.discard.push(id);
        if (!fight.pile.length) {
          fight.pile = shuffle(fight.discard, fight.random);
          fight.discard = [];
        }
        fight.hand[spot] = fight.pile.shift();
        emit("draw", { slot: spot });
      }
      fight.turn++;
    }
    return { events, won, lost };
  }

  function simulate(run, fight, action) {
    const copy = { ...run, items: { ...run.items } };
    const battleCopy = {
      ...fight, hand: [...fight.hand], pile: [...fight.pile],
      discard: [...fight.discard], used: new Set(fight.used),
      enemies: fight.enemies.map(enemy => ({ ...enemy })), random: () => 0,
    };
    return resolve(copy, battleCopy, action);
  }

  return { cards, gear, items, skills, roots, enemy, rooms, roomOrder, start, battle, stats, compatible, assign, transfer, transferAllowed, equip, buy, drink, openChest, win, preview, resolve, simulate };
})();
if (typeof module !== "undefined") module.exports = Dawn;
