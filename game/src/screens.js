/* SOLARA BAY - title, pause, controls, banners and game-over overlays. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.U;

  function box(ctx, x, y, w, h, alpha) {
    ctx.fillStyle = 'rgba(18,22,36,' + (alpha || 0.82) + ')';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 14); else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,140,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function button(ctx, x, y, w, h, label, hot, sub) {
    ctx.fillStyle = hot ? 'rgba(255,196,77,0.94)' : 'rgba(32,39,58,0.94)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 9); else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.strokeStyle = hot ? '#fff2cc' : 'rgba(255,214,140,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hot ? '#2b2117' : '#fff0cd';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(label, x, y - (sub ? 8 : 0));
    if (sub) { ctx.font = '11px Arial'; ctx.fillStyle = hot ? '#5c4321' : '#c9bda2'; ctx.fillText(sub, x, y + 13); }
  }

  const Screens = {
    bannerData: null,
    toastData: null,
    controls: false,
    hover: '',

    banner: function (title, sub, duration) {
      this.bannerData = { title: title, sub: sub || '', life: duration || 4, max: duration || 4 };
    },
    toast: function (text) { this.toastData = { text: text, life: 5 }; },
    toggleControls: function () { this.controls = !this.controls; },

    update: function (dt) {
      if (this.bannerData) {
        this.bannerData.life -= dt;
        if (this.bannerData.life <= 0) this.bannerData = null;
      }
      if (this.toastData) {
        this.toastData.life -= dt;
        if (this.toastData.life <= 0) this.toastData = null;
      }
    },

    buttons: function (W, H, hasSave) {
      const cx = W / 2, y0 = H / 2 + 48;
      return [
        { id: 'new', x: cx, y: y0, w: 280, h: 50, label: 'NEW GAME', sub: 'ENTER' },
        { id: 'continue', x: cx, y: y0 + 64, w: 280, h: 50, label: 'CONTINUE', sub: hasSave ? 'L  ·  LOAD LAST SAVE' : 'NO SAVE FOUND' },
        { id: 'controls', x: cx, y: y0 + 128, w: 280, h: 50, label: 'CONTROLS', sub: 'C' }
      ];
    },

    click: function (mx, my, W, H, hasSave, game) {
      const list = this.buttons(W, H, hasSave);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (Math.abs(mx - b.x) < b.w / 2 && Math.abs(my - b.y) < b.h / 2) return b.id;
      }
      return null;
    },

    draw: function (ctx, W, H, game) {
      ctx.save();
      ctx.textBaseline = 'middle';
      const st = game.state;
      if (st === 'menu') this.drawMenu(ctx, W, H);
      if (st === 'paused') this.drawCenterPanel(ctx, W, H, 'PAUSED', 'The bay is waiting. Press ESC to get back out there.');
      if (st === 'gameover') {
        this.drawCenterPanel(ctx, W, H, 'BUSTED',
          'You went down. ' + U.money(game.cash) + ' survived the night.',
          'R  RESTART JOB     ENTER  MAIN MENU');
      }
      if (this.controls) this.drawControls(ctx, W, H);
      if (st === 'playing' && this.bannerData) this.drawBanner(ctx, W, H);
      if (st === 'playing' && this.toastData) {
        const a = Math.min(1, this.toastData.life);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center'; ctx.font = 'bold 15px Arial';
        ctx.fillStyle = 'rgba(20,24,34,0.78)';
        const w = ctx.measureText(this.toastData.text).width + 28;
        ctx.fillRect(W / 2 - w / 2, H - 82, w, 32);
        ctx.fillStyle = '#ffe3a3'; ctx.fillText(this.toastData.text, W / 2, H - 66);
        ctx.globalAlpha = 1;
      }
      if (st === 'playing' && SB.Missions.failed) {
        ctx.textAlign = 'center'; ctx.font = 'bold 18px Arial'; ctx.fillStyle = '#ffd05c';
        ctx.fillText('PRESS R TO RETRY THE JOB', W / 2, H - 56);
      }
      ctx.restore();
    },

    drawMenu: function (ctx, W, H) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(9,17,38,0.92)');
      g.addColorStop(0.55, 'rgba(21,29,54,0.82)');
      g.addColorStop(1, 'rgba(64,35,32,0.86)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const sun = ctx.createRadialGradient(W * 0.72, H * 0.24, 20, W * 0.72, H * 0.24, 260);
      sun.addColorStop(0, 'rgba(255,197,92,0.45)'); sun.addColorStop(1, 'rgba(255,160,70,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      const title = ctx.createLinearGradient(W / 2 - 260, 0, W / 2 + 260, 0);
      title.addColorStop(0, '#ffd468'); title.addColorStop(0.5, '#fff0b4'); title.addColorStop(1, '#ff9c5c');
      ctx.font = 'bold 88px Arial'; ctx.fillStyle = title;
      ctx.fillText('SOLARA BAY', W / 2, H / 2 - 96);
      ctx.font = 'bold 14px Arial'; ctx.fillStyle = '#ffe1a6';
      ctx.fillText('SUN-SOAKED OPEN WORLD CRIME', W / 2, H / 2 - 40);
      ctx.font = '13px Arial'; ctx.fillStyle = '#cdbfab';
      ctx.fillText('Seven jobs. Five stars. One sun-drenched city.', W / 2, H / 2 - 14);
      const hasSave = SB.Save.hasSave();
      const list = this.buttons(W, H, hasSave);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        button(ctx, b.x, b.y, b.w, b.h, b.label, this.hover === b.id, b.sub);
      }
      ctx.font = '11px Arial'; ctx.fillStyle = 'rgba(230,215,190,0.6)';
      ctx.fillText('Keyboard + mouse · no downloads · progress saves locally', W / 2, H - 36);
    },

    drawCenterPanel: function (ctx, W, H, title, sub, footer) {
      ctx.fillStyle = 'rgba(8,12,24,0.6)'; ctx.fillRect(0, 0, W, H);
      box(ctx, W / 2 - 280, H / 2 - 105, 560, 210, 0.94);
      ctx.textAlign = 'center';
      ctx.font = 'bold 56px Arial'; ctx.fillStyle = '#ffce62';
      ctx.fillText(title, W / 2, H / 2 - 44);
      ctx.font = '15px Arial'; ctx.fillStyle = '#f3e4c8';
      ctx.fillText(sub, W / 2, H / 2 + 13);
      ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#ffd993';
      ctx.fillText(footer || 'ESC  RESUME     M  MUTE', W / 2, H / 2 + 60);
    },

    drawControls: function (ctx, W, H) {
      ctx.fillStyle = 'rgba(8,12,24,0.82)'; ctx.fillRect(0, 0, W, H);
      box(ctx, W / 2 - 330, H / 2 - 235, 660, 470, 0.96);
      ctx.textAlign = 'center'; ctx.font = 'bold 32px Arial'; ctx.fillStyle = '#ffce62';
      ctx.fillText('CONTROLS', W / 2, H / 2 - 190);
      const rows = [
        ['W A S D', 'Walk / run / steer & accelerate'],
        ['SHIFT', 'Sprint on foot'],
        ['MOUSE', 'Aim; hold left click to shoot'],
        ['E', 'Enter or exit the nearest car'],
        ['J / 1-7', 'Start next job / choose a job'],
        ['TAB', 'Toggle minimap zoom'],
        ['C', 'Controls overlay'],
        ['ESC', 'Pause / resume'],
        ['M', 'Mute / unmute'],
        ['R', 'Retry a failed job']
      ];
      ctx.font = '15px Arial';
      for (let i = 0; i < rows.length; i++) {
        const y = H / 2 - 140 + i * 31;
        ctx.textAlign = 'right'; ctx.fillStyle = '#ffd07a'; ctx.fillText(rows[i][0], W / 2 - 20, y);
        ctx.textAlign = 'left'; ctx.fillStyle = '#f0e2c9'; ctx.fillText(rows[i][1], W / 2 + 10, y);
      }
      ctx.textAlign = 'center'; ctx.font = '12px Arial'; ctx.fillStyle = '#c9bda2';
      ctx.fillText('Press C or ESC to close', W / 2, H / 2 + 208);
    },

    drawBanner: function (ctx, W, H) {
      const b = this.bannerData;
      const a = Math.min(1, b.life * 2, (b.max - b.life) * 4);
      ctx.globalAlpha = U.clamp(a, 0, 1);
      box(ctx, W / 2 - 300, 152, 600, 84, 0.88);
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px Arial'; ctx.fillStyle = '#ffd263';
      ctx.fillText(b.title, W / 2, 178);
      ctx.font = '13px Arial'; ctx.fillStyle = '#f2e3c8';
      ctx.fillText(b.sub, W / 2, 210);
      ctx.globalAlpha = 1;
    }
  };

  SB.Screens = Screens;
})();
