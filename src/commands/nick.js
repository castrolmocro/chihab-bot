"use strict";
const fs   = require("fs-extra");
const path = require("path");

const DATA = path.join(process.cwd(), "database/data/nickLocks.json");
const sleep = ms => new Promise(r => setTimeout(r, ms));

function load()  { try { if (fs.existsSync(DATA)) return JSON.parse(fs.readFileSync(DATA, "utf8")); } catch (_) {} return {}; }
function save(d) { fs.ensureDirSync(path.dirname(DATA)); fs.writeFileSync(DATA, JSON.stringify(d, null, 2)); }

function isBotAdmin(id) {
  const cfg = global.GoatBot?.config || {};
  const sid = String(id);
  return [cfg.ownerID, ...(cfg.superAdminBot || []), ...(cfg.adminBot || [])]
    .filter(Boolean).map(String).includes(sid);
}

function loopDelay() { return 3500 + Math.random() * 500; }

if (!global._nickLocks)     global._nickLocks     = {};
if (!global._nickRestoring) global._nickRestoring = {};
if (!global._nickRunning)   global._nickRunning   = {};
if (!global._nickAPI)       global._nickAPI       = null;

function restoreAll() {
  const d = load();
  for (const [tid, data] of Object.entries(d)) {
    if (data.active) global._nickLocks[tid] = data;
  }
}
restoreAll();

async function applyNick(api, tid, uid, name) {
  const key = `${tid}:${uid}`;
  if (global._nickRestoring[key]) return;
  global._nickRestoring[key] = true;
  await sleep(3500 + Math.random() * 1500);
  if (!global._nickLocks[tid]?.active) { delete global._nickRestoring[key]; return; }
  try { await api.changeNickname(name || "", tid, uid); } catch (_) {}
  await sleep(loopDelay());
  delete global._nickRestoring[key];
}

async function applyAllLoop(api, tid) {
  if (global._nickRunning[tid]) return;
  global._nickRunning[tid] = true;

  while (global._nickLocks[tid]?.active) {
    try {
      const info = await new Promise((res, rej) =>
        api.getThreadInfo(tid, (e, d) => e ? rej(e) : res(d))
      );
      const members = (info?.participantIDs || [])
        .filter(id => String(id) !== String(global.GoatBot?.botID));
      const lock = global._nickLocks[tid];

      for (const uid of members) {
        if (!global._nickLocks[tid]?.active) break;
        const name = (lock.perUser?.[uid] ?? lock.globalName) || "";
        if (!name) { await sleep(loopDelay()); continue; }
        const key = `${tid}:${uid}`;
        if (global._nickRestoring[key]) { await sleep(1000); continue; }
        global._nickRestoring[key] = true;
        try { await api.changeNickname(name, tid, uid); } catch (_) {}
        await sleep(loopDelay());
        delete global._nickRestoring[key];
      }
    } catch (_) {
      await sleep(6000);
    }
  }

  global._nickRunning[tid] = false;
}

module.exports = {
  config: {
    name: "كنيات", aliases: ["nick", "nickname"], version: "6.0", author: "Stefan",
    countDown: 3, role: 2, category: "management",
    description: "قفل كنيات الأعضاء ومنع تغييرها — حلقة مستمرة كل 3.5–4 ثوانٍ",
    guide: {
      en: "{pn} [اسم] — قفل كنية عامة للكل بشكل مستمر\n" +
          "{pn} set [uid] [اسم] — قفل كنية لشخص محدد\n" +
          "{pn} off — إيقاف القفل والحلقة\n" +
          "{pn} status — الحالة الحالية\n" +
          "{pn} حدف — حذف جميع الكنيات"
    }
  },

  onStart: async function({ api, event, args, message }) {
    const tid = String(event.threadID);
    const sub = (args[0] || "").toLowerCase();
    global._nickAPI = api;

    if (sub === "off" || sub === "إيقاف") {
      if (global._nickLocks[tid]) global._nickLocks[tid].active = false;
      const d = load(); if (d[tid]) { d[tid].active = false; save(d); }
      return;
    }

    if (sub === "status" || sub === "حالة") {
      const lock = global._nickLocks[tid];
      if (!lock?.active) return message.reply("💤 قفل الكنيات غير نشط.");
      const perCount = Object.keys(lock.perUser || {}).length;
      const running  = global._nickRunning[tid] ? "🔄 تعمل" : "⏸ متوقفة";
      return message.reply(
        `🔒 قفل الكنيات نشط — الحلقة: ${running}\n` +
        `📝 الاسم العام: ${lock.globalName || "—"}\n` +
        `👤 كنيات فردية: ${perCount}\n` +
        `⏱ كل 3.5–4 ثانية لكل عضو`
      );
    }

    if (sub === "حدف" || sub === "reset") {
      if (global._nickLocks[tid]) global._nickLocks[tid].active = false;
      try {
        const info = await new Promise((res, rej) => api.getThreadInfo(tid, (e, d) => e ? rej(e) : res(d)));
        const members = (info?.participantIDs || []).filter(id => String(id) !== String(global.GoatBot?.botID));
        for (const uid of members) {
          try { await api.changeNickname("", tid, uid); } catch (_) {}
          await sleep(loopDelay());
        }
        if (global._nickLocks[tid]) global._nickLocks[tid].perUser = {};
      } catch (_) {}
      return;
    }

    if (sub === "set") {
      const uid  = args[1];
      const name = args.slice(2).join(" ").trim();
      if (!uid || !name) return message.reply("❌ الاستخدام: !كنيات set [uid] [اسم]");
      if (!global._nickLocks[tid]) global._nickLocks[tid] = { active: true, globalName: "", perUser: {} };
      global._nickLocks[tid].perUser = global._nickLocks[tid].perUser || {};
      global._nickLocks[tid].perUser[uid] = name;
      global._nickLocks[tid].active = true;
      const d = load(); d[tid] = global._nickLocks[tid]; save(d);
      applyAllLoop(api, tid).catch(() => {});
      return;
    }

    const name = args.join(" ").trim();
    if (!name) return message.reply(
      "❌ اكتب الاسم.\nمثال: !كنيات ستيفان\n\n" +
      "!كنيات [اسم] — قفل للكل\n" +
      "!كنيات set [uid] [اسم] — قفل لشخص\n" +
      "!كنيات off — إيقاف\n" +
      "!كنيات status — الحالة"
    );

    global._nickLocks[tid] = {
      active: true,
      globalName: name,
      perUser: global._nickLocks[tid]?.perUser || {}
    };
    const d = load(); d[tid] = global._nickLocks[tid]; save(d);
    applyAllLoop(api, tid).catch(() => {});
  },

  onEvent: async function({ api, event }) {
    global._nickAPI = api;

    const isNickChange =
      event.logMessageType === "log:user-nickname" ||
      event.type           === "log:user-nickname" ||
      (event.logMessageData?.participant_id !== undefined &&
       event.logMessageData?.nickname       !== undefined);

    if (!isNickChange) return;

    const tid  = String(event.threadID);
    const lock = global._nickLocks[tid];
    if (!lock?.active) return;

    const changerID = String(event.author || event.senderID || "");
    if (isBotAdmin(changerID)) return;

    const targetID = String(
      event.logMessageData?.participant_id ||
      event.logMessageData?.userId ||
      event.logMessageData?.subjectFbId || ""
    );
    if (!targetID) return;

    const locked = lock.perUser?.[targetID] ?? lock.globalName;
    if (!locked) return;

    setTimeout(() => applyNick(api, tid, targetID, locked), 500);

    if (!global._nickRunning[tid] && global._nickLocks[tid]?.active) {
      applyAllLoop(api, tid).catch(() => {});
    }
  }
};
