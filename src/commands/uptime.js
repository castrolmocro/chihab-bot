"use strict";
const os   = require("os");
const path = require("path");
const fs   = require("fs");

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sc}s`);
  return parts.join(" ");
}

function formatGB(bytes) {
  return (bytes / 1073741824).toFixed(2) + " GB";
}

function formatMB(bytes) {
  return (bytes / 1048576).toFixed(1) + " MB";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function generateCard(uptimeStr, pingMs, ramUsedMB, ramSysGB, ramTotalGB, cmds, botName, prefix) {
  try {
    const { createCanvas } = require("@napi-rs/canvas");

    const W = 600, H = 380;
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext("2d");

    // ── Background ──────────────────────────────────────────────────────
    roundRect(ctx, 0, 0, W, H, 32);
    ctx.clip();

    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0,   "#0A0E1A");
    bgGrad.addColorStop(0.5, "#0D1224");
    bgGrad.addColorStop(1,   "#080C18");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ── Ambient glow circles ─────────────────────────────────────────────
    function drawGlow(cx, cy, radius, color, alpha) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0,   color.replace("1)", `${alpha})`));
      g.addColorStop(0.6, color.replace("1)", `${alpha * 0.3})`));
      g.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    drawGlow(W * 0.15, H * 0.2,  220, "rgba(20,40,160,1)",   0.45);
    drawGlow(W * 0.88, H * 0.75, 180, "rgba(100,20,220,1)",  0.3);
    drawGlow(W * 0.5,  H * 0.5,  150, "rgba(0,120,255,1)",   0.12);

    // ── Top accent bar ───────────────────────────────────────────────────
    const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
    accentGrad.addColorStop(0,    "#1428A0");
    accentGrad.addColorStop(0.35, "#0055CC");
    accentGrad.addColorStop(0.65, "#6600FF");
    accentGrad.addColorStop(1,    "#1428A0");
    ctx.fillStyle = accentGrad;
    roundRect(ctx, 0, 0, W, 5, 0);
    ctx.fill();

    // ── Header section ───────────────────────────────────────────────────
    // Avatar circle
    const avX = 48, avY = 42, avR = 28;
    const avGrad = ctx.createRadialGradient(avX, avY, 0, avX, avY, avR);
    avGrad.addColorStop(0, "#1E3CB0");
    avGrad.addColorStop(1, "#0A1E6E");
    ctx.fillStyle = avGrad;
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.fill();

    // Avatar border glow
    ctx.strokeStyle = "rgba(100,150,255,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avX, avY, avR + 3, 0, Math.PI * 2);
    ctx.stroke();

    // Avatar letter
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("S", avX, avY);

    // Bot name
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(botName, 88, 38);

    ctx.fillStyle = "rgba(180,200,255,0.55)";
    ctx.font = "13px sans-serif";
    ctx.fillText(`prefix: ${prefix}  •  ${cmds} أوامر`, 88, 58);

    // Online badge (top-right)
    const badgeX = W - 120, badgeY = 22, badgeW = 100, badgeH = 34;
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 17);
    ctx.fillStyle = "rgba(30,220,80,0.1)";
    ctx.fill();
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 17);
    ctx.strokeStyle = "rgba(50,215,75,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Green dot
    ctx.fillStyle = "#32D74B";
    ctx.beginPath();
    ctx.arc(badgeX + 18, badgeY + badgeH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#32D74B";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Online", badgeX + 30, badgeY + badgeH / 2 + 5);

    // ── Divider ──────────────────────────────────────────────────────────
    const divGrad = ctx.createLinearGradient(24, 0, W - 24, 0);
    divGrad.addColorStop(0,   "rgba(255,255,255,0)");
    divGrad.addColorStop(0.3, "rgba(255,255,255,0.12)");
    divGrad.addColorStop(0.7, "rgba(255,255,255,0.12)");
    divGrad.addColorStop(1,   "rgba(255,255,255,0)");
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 82);
    ctx.lineTo(W - 24, 82);
    ctx.stroke();

    // ── Stat Cards ───────────────────────────────────────────────────────
    const stats = [
      { label: "Uptime",   value: uptimeStr,          icon: "⏱", accent: "#1428A0", glow: "rgba(20,40,160,0.6)" },
      { label: "Ping",     value: `${pingMs} ms`,      icon: "📡", accent: "#006655", glow: "rgba(0,150,120,0.5)" },
      { label: "Heap RAM", value: ramUsedMB,            icon: "💾", accent: "#6600CC", glow: "rgba(120,0,255,0.5)" },
    ];

    const cW = 168, cH = 120, cY = 100, gap = 18;
    const cStartX = (W - (cW * 3 + gap * 2)) / 2;

    for (let i = 0; i < stats.length; i++) {
      const cx = cStartX + i * (cW + gap);
      const st = stats[i];

      // Card glass bg
      roundRect(ctx, cx, cY, cW, cH, 20);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fill();
      roundRect(ctx, cx, cY, cW, cH, 20);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Top color accent
      const topGrad = ctx.createLinearGradient(cx, cY, cx + cW, cY);
      topGrad.addColorStop(0, st.accent);
      topGrad.addColorStop(1, st.accent + "99");
      roundRect(ctx, cx, cY, cW, 4, [20, 20, 0, 0]);
      ctx.fillStyle = topGrad;
      ctx.fill();

      // Bottom glow
      const bGlow = ctx.createRadialGradient(cx + cW / 2, cY + cH, 0, cx + cW / 2, cY + cH, 60);
      bGlow.addColorStop(0,   st.glow);
      bGlow.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.fillStyle = bGlow;
      ctx.fillRect(cx, cY + cH - 40, cW, 50);

      // Icon
      ctx.font = "28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(st.icon, cx + cW / 2, cY + 36);

      // Value
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 17px sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(st.value, cx + cW / 2, cY + 76);

      // Label
      ctx.fillStyle = "rgba(180,200,255,0.5)";
      ctx.font = "11px sans-serif";
      ctx.fillText(st.label, cx + cW / 2, cY + 96);
    }

    // ── RAM System Bar ───────────────────────────────────────────────────
    const barX = 28, barY = 250, barW = W - 56, barH = 10;
    const ramPct = parseFloat(ramSysGB) / parseFloat(ramTotalGB) || 0;

    // Label row
    ctx.fillStyle = "rgba(180,200,255,0.55)";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`💻 System RAM`, barX, barY - 6);
    ctx.textAlign = "right";
    ctx.fillText(`${ramSysGB} / ${ramTotalGB}  (${Math.round(ramPct * 100)}%)`, barX + barW, barY - 6);

    // Track
    roundRect(ctx, barX, barY, barW, barH, 5);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();

    // Fill gradient
    const filledW = Math.max(barW * Math.min(ramPct, 1), 10);
    const barFillGrad = ctx.createLinearGradient(barX, 0, barX + filledW, 0);
    barFillGrad.addColorStop(0,    "#1428A0");
    barFillGrad.addColorStop(0.5,  "#0066FF");
    barFillGrad.addColorStop(1,    "#6600FF");
    roundRect(ctx, barX, barY, filledW, barH, 5);
    ctx.fillStyle = barFillGrad;
    ctx.fill();

    // Shine on bar
    roundRect(ctx, barX, barY, filledW, barH / 2, [5, 5, 0, 0]);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fill();

    // ── Protection badge ─────────────────────────────────────────────────
    const pb = { x: barX, y: barY + 30, w: 200, h: 30 };
    roundRect(ctx, pb.x, pb.y, pb.w, pb.h, 15);
    ctx.fillStyle = "rgba(20,40,160,0.25)";
    ctx.fill();
    roundRect(ctx, pb.x, pb.y, pb.w, pb.h, 15);
    ctx.strokeStyle = "rgba(100,150,255,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(180,200,255,0.75)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🛡  20 طبقة حماية نشطة", pb.x + pb.w / 2, pb.y + pb.h / 2);

    // ── Bottom separator ─────────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, H - 44);
    ctx.lineTo(W - 24, H - 44);
    ctx.stroke();

    // ── Footer ───────────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(100,130,200,0.45)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("OneUI 8.5", 28, H - 22);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(80,110,200,0.35)";
    ctx.fillText("✦ ✦ ✦", W / 2, H - 22);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(100,130,200,0.45)";
    ctx.fillText(`ستيفان Bot`, W - 28, H - 22);

    return canvas.toBuffer("image/png");
  } catch (e) {
    return null;
  }
}

module.exports = {
  config: {
    name: "info",
    aliases: ["uptime", "up", "ping", "وقت", "info"],
    version: "4.0",
    author: "Stefan",
    countDown: 5,
    role: 0,
    category: "info",
    description: "وقت تشغيل البوت مع إحصائيات OneUI 8.5",
    guide: { en: "{pn} — عرض الإحصائيات" }
  },

  onStart: async function({ api, event, message }) {
    const start   = global.GoatBot?.startTime || Date.now();
    const upMs    = Date.now() - start;
    const mem     = process.memoryUsage();
    const sysM    = { total: os.totalmem(), free: os.freemem() };
    const cmds    = global.GoatBot?.commands?.size || 0;
    const botName = global.GoatBot?.config?.botName || "ستيفان";
    const prefix  = global.GoatBot?.config?.prefix  || "!";

    const ping = Date.now();
    await new Promise(r => setTimeout(r, 12));
    const pong = Date.now() - ping;

    const ramUsedMB  = formatMB(mem.heapUsed);
    const ramSysGB   = formatGB(sysM.total - sysM.free);
    const ramTotalGB = formatGB(sysM.total);

    const buf = await generateCard(
      formatUptime(upMs), pong,
      ramUsedMB, ramSysGB, ramTotalGB,
      cmds, botName, prefix
    );

    if (buf) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const tmpPath = path.join(dataDir, `info_${Date.now()}.png`);
      fs.writeFileSync(tmpPath, buf);
      const stream = fs.createReadStream(tmpPath);
      stream.on("close", () => { try { fs.unlinkSync(tmpPath); } catch (_) {} });
      await api.sendMessage({ attachment: stream }, event.threadID);
    } else {
      message.reply(
        `╔══════ ستيفان Bot ══════╗\n` +
        `║ ⏱ Uptime : ${formatUptime(upMs)}\n` +
        `║ 📡 Ping  : ${pong}ms\n` +
        `║ 💾 RAM   : ${ramUsedMB}\n` +
        `║ 💻 Sys   : ${ramSysGB} / ${ramTotalGB}\n` +
        `║ 📦 Cmds  : ${cmds}\n` +
        `║ 🔑 Prefix: ${prefix}\n` +
        `╚════ OneUI 8.5 ✦ Stefan ╝`
      );
    }
  }
};
