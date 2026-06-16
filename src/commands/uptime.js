"use strict";
const os   = require("os");
const path = require("path");
const fs   = require("fs");

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

function formatBytes(bytes) {
  return (bytes / 1073741824).toFixed(2) + " GB";
}

async function generateCard(uptimeStr, pingMs, ramUsed, ramTotal) {
  try {
    const { createCanvas } = require("@napi-rs/canvas");

    const W = 560, H = 320;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#0D0D0D";
    const r = 28;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(W - r, 0);
    ctx.quadraticCurveTo(W, 0, W, r);
    ctx.lineTo(W, H - r);
    ctx.quadraticCurveTo(W, H, W - r, H);
    ctx.lineTo(r, H);
    ctx.quadraticCurveTo(0, H, 0, H - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    // Top accent bar
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#1428A0");
    grad.addColorStop(0.5, "#0066CC");
    grad.addColorStop(1, "#1428A0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 4);

    // Title
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("ستيفان", 30, 45);

    ctx.fillStyle = "#888888";
    ctx.font = "13px sans-serif";
    ctx.fillText("System Status", 30, 65);

    // Online badge
    ctx.fillStyle = "#1E1E1E";
    ctx.beginPath();
    ctx.roundRect(W - 120, 22, 90, 30, 15);
    ctx.fill();
    ctx.fillStyle = "#00E676";
    ctx.beginPath();
    ctx.arc(W - 105, 37, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#00E676";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Online", W - 95, 42);

    // Divider
    ctx.strokeStyle = "#1E1E1E";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 82); ctx.lineTo(W - 30, 82);
    ctx.stroke();

    // Cards
    const cardData = [
      { label: "Uptime", value: uptimeStr, icon: "⏱", color: "#1428A0" },
      { label: "Ping",   value: `${pingMs}ms`, icon: "📡", color: "#00695C" },
      { label: "RAM",    value: `${ramUsed}`, icon: "💾", color: "#6A1B9A" },
    ];

    const cardW = 150, cardH = 110, cardY = 100, gap = 24;
    const startX = (W - (cardW * 3 + gap * 2)) / 2;

    for (let i = 0; i < cardData.length; i++) {
      const cx = startX + i * (cardW + gap);
      const cd = cardData[i];

      // Card bg
      ctx.fillStyle = "#161616";
      ctx.beginPath();
      ctx.roundRect(cx, cardY, cardW, cardH, 18);
      ctx.fill();

      // Color top line
      ctx.fillStyle = cd.color;
      ctx.beginPath();
      ctx.roundRect(cx, cardY, cardW, 4, [18, 18, 0, 0]);
      ctx.fill();

      // Icon
      ctx.font = "26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(cd.icon, cx + cardW / 2, cardY + 40);

      // Value
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(cd.value, cx + cardW / 2, cardY + 70);

      // Label
      ctx.fillStyle = "#666666";
      ctx.font = "12px sans-serif";
      ctx.fillText(cd.label, cx + cardW / 2, cardY + 90);
    }

    // RAM bar
    const barX = 30, barY = 240, barW = W - 60, barH = 8;
    const ramPct = Math.min(parseFloat(ramUsed) / parseFloat(ramTotal), 1);

    ctx.fillStyle = "#1E1E1E";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 4);
    ctx.fill();

    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, "#1428A0");
    barGrad.addColorStop(1, "#0066CC");
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(barW * ramPct, 8), barH, 4);
    ctx.fill();

    ctx.fillStyle = "#444444";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`RAM: ${ramUsed} / ${ramTotal}`, barX, barY + 22);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(ramPct * 100)}%`, barX + barW, barY + 22);

    // Footer
    ctx.fillStyle = "#333333";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("OneUI 8.5 • ستيفان Bot", W / 2, H - 16);

    return canvas.toBuffer("image/png");
  } catch (e) {
    return null;
  }
}

module.exports = {
  config: {
    name: "info", aliases: ["uptime", "up", "ping", "وقت"], version: "3.0", author: "Stefan",
    countDown: 5, role: 2, category: "info",
    description: "وقت تشغيل البوت مع الإحصائيات",
    guide: { en: "{pn} — عرض الإحصائيات" }
  },

  onStart: async function({ api, event, message }) {
    const start  = global.GoatBot?.startTime || Date.now();
    const upMs   = Date.now() - start;
    const mem    = process.memoryUsage();
    const sysM   = { total: os.totalmem(), free: os.freemem() };

    const ping   = Date.now();
    await new Promise(r => setTimeout(r, 10));
    const pong   = Date.now() - ping;

    const ramUsed  = formatBytes(sysM.total - sysM.free);
    const ramTotal = formatBytes(sysM.total);

    const buf = await generateCard(formatUptime(upMs), pong, ramUsed, ramTotal);

    if (buf) {
      const tmpPath = path.join(process.cwd(), "data", `info_${Date.now()}.png`);
      fs.writeFileSync(tmpPath, buf);
      const stream = fs.createReadStream(tmpPath);
      stream.on("close", () => { try { fs.unlinkSync(tmpPath); } catch (_) {} });
      await api.sendMessage({ attachment: stream }, event.threadID);
    } else {
      const uptimeStr = formatUptime(upMs);
      message.reply(
        `⏱ Uptime: ${uptimeStr}\n` +
        `📡 Ping: ${pong}ms\n` +
        `💾 RAM: ${ramUsed} / ${ramTotal}`
      );
    }
  }
};
