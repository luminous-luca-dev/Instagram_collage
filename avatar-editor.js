/**
 * avatar-editor.js
 * アバタープリセットエディタUI
 * - スライダー・ドラッグで各パーツを設定
 * - プレビューCanvasに描画
 * - localStorage保存
 */

'use strict';

// プレビューCanvasサイズ
const PREVIEW_SIZE = 300;
const FACE_RADIUS = 100; // プレビュー内での「顔」の半径(px)

class AvatarEditor {
  constructor() {
    this.preset = AvatarModule.loadPreset();
    this.canvas = document.getElementById('avatar-preview-canvas');
    this.ctx = this.canvas.getContext('2d');

    // ドラッグ状態
    this.dragging = null; // 'main' | 'sub' | null
    this.dragStart = { x: 0, y: 0 };
    this.dragStartOffset = { x: 0, y: 0 };

    this._initSliders();
    this._initDrag();
    this._initButtons();
    this._syncSlidersToPreset();
    this._preloadAndRender();
  }

  // =====================
  // スライダー初期化
  // =====================
  _initSliders() {
    const sliders = [
      // [inputId, valueDisplayId, presetKey, subKey, unit, transform]
      ['main-size-slider',     'main-size-value',     'main', 'size',     '%',  v => v],
      ['main-offset-x',        'main-offset-x-value', 'main', 'offsetX',  '%',  v => v],
      ['main-offset-y',        'main-offset-y-value', 'main', 'offsetY',  '%',  v => v],
      ['main-rotate-slider',   'main-rotate-value',   'main', 'rotation', '°',  v => v],
      ['sub-size-slider',      'sub-size-value',      'sub',  'size',     '%',  v => v],
      ['sub-offset-x',         'sub-offset-x-value',  'sub',  'offsetX',  '%',  v => v],
      ['sub-offset-y',         'sub-offset-y-value',  'sub',  'offsetY',  '%',  v => v],
      ['sub-rotate-slider',    'sub-rotate-value',    'sub',  'rotation', '°',  v => v],
    ];

    sliders.forEach(([inputId, displayId, part, key, unit]) => {
      const input = document.getElementById(inputId);
      const display = document.getElementById(displayId);
      if (!input || !display) return;

      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        this.preset[part][key] = val;
        display.textContent = val + unit;
        this._debouncedRender();
      });
    });

    // 絵文字テキスト入力
    const mainEmojiInput = document.getElementById('main-emoji-input');
    const subEmojiInput = document.getElementById('sub-emoji-input');

    if (mainEmojiInput) {
      mainEmojiInput.addEventListener('input', async () => {
        const emoji = [...mainEmojiInput.value].slice(-1).join('') || '😆';
        this.preset.main.emoji = emoji;
        mainEmojiInput.value = emoji;
        await AvatarModule.loadAppleEmoji(emoji);
        this._render();
      });
    }

    if (subEmojiInput) {
      subEmojiInput.addEventListener('input', async () => {
        const emoji = [...subEmojiInput.value].slice(-1).join('') || '👓';
        this.preset.sub.emoji = emoji;
        subEmojiInput.value = emoji;
        await AvatarModule.loadAppleEmoji(emoji);
        this._render();
      });
    }
  }

  // =====================
  // スライダー値をプリセットから同期
  // =====================
  _syncSlidersToPreset() {
    const pairs = [
      ['main-size-slider',   'main-size-value',     this.preset.main.size,     '%'],
      ['main-offset-x',      'main-offset-x-value', this.preset.main.offsetX,  '%'],
      ['main-offset-y',      'main-offset-y-value', this.preset.main.offsetY,  '%'],
      ['main-rotate-slider', 'main-rotate-value',   this.preset.main.rotation, '°'],
      ['sub-size-slider',    'sub-size-value',      this.preset.sub.size,      '%'],
      ['sub-offset-x',       'sub-offset-x-value',  this.preset.sub.offsetX,   '%'],
      ['sub-offset-y',       'sub-offset-y-value',  this.preset.sub.offsetY,   '%'],
      ['sub-rotate-slider',  'sub-rotate-value',    this.preset.sub.rotation,  '°'],
    ];

    pairs.forEach(([inputId, displayId, value, unit]) => {
      const input = document.getElementById(inputId);
      const display = document.getElementById(displayId);
      if (input) input.value = value;
      if (display) display.textContent = value + unit;
    });

    const mainEmojiInput = document.getElementById('main-emoji-input');
    const subEmojiInput = document.getElementById('sub-emoji-input');
    if (mainEmojiInput) mainEmojiInput.value = this.preset.main.emoji;
    if (subEmojiInput) subEmojiInput.value = this.preset.sub.emoji;
  }

  // =====================
  // ドラッグ操作初期化
  // =====================
  _initDrag() {
    const overlay = document.getElementById('avatar-drag-overlay');
    if (!overlay) return;

    // タッチ/マウス両対応のドラッグハンドラ
    overlay.addEventListener('mousedown', e => this._onDragStart(e));
    overlay.addEventListener('touchstart', e => this._onDragStart(e), { passive: false });

    window.addEventListener('mousemove', e => this._onDragMove(e));
    window.addEventListener('touchmove', e => this._onDragMove(e), { passive: false });

    window.addEventListener('mouseup', () => this._onDragEnd());
    window.addEventListener('touchend', () => this._onDragEnd());
  }

  _getEventXY(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  _onDragStart(e) {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();

    const part = handle.dataset.part; // 'main' or 'sub'
    this.dragging = part;

    const { x, y } = this._getEventXY(e);
    this.dragStart = { x, y };
    this.dragStartOffset = {
      x: this.preset[part].offsetX,
      y: this.preset[part].offsetY,
    };
  }

  _onDragMove(e) {
    if (!this.dragging) return;
    e.preventDefault();

    const { x, y } = this._getEventXY(e);
    const dx = x - this.dragStart.x;
    const dy = y - this.dragStart.y;

    // プレビューサイズをピクセル基準に変換
    // main: 顔サイズ(FACE_RADIUS*2)比のオフセット%
    // sub: mainサイズ比のオフセット%
    const part = this.dragging;

    // 表示スケール（CSSでwrapperが縮小されている場合に補正）
    const wrapper = document.querySelector('.avatar-preview-wrapper');
    const displayScale = wrapper ? wrapper.offsetWidth / PREVIEW_SIZE : 1;

    let divisor;
    if (part === 'main') {
      divisor = FACE_RADIUS * 2 * displayScale; // 表示上の顔直径px
    } else {
      const mainSizePx = FACE_RADIUS * 2 * (this.preset.main.size / 100) * displayScale;
      divisor = mainSizePx;
    }

    const newX = this.dragStartOffset.x + (dx / divisor) * 100;
    const newY = this.dragStartOffset.y + (dy / divisor) * 100;

    // 範囲クランプ
    const [minV, maxV] = part === 'main' ? [-50, 50] : [-80, 80];
    this.preset[part].offsetX = Math.max(minV, Math.min(maxV, newX));
    this.preset[part].offsetY = Math.max(minV, Math.min(maxV, newY));

    // スライダーUIを同期
    this._syncPartSliders(part);
    this._render();
  }

  _onDragEnd() {
    this.dragging = null;
  }

  _syncPartSliders(part) {
    const pairs = part === 'main'
      ? [
          ['main-offset-x', 'main-offset-x-value', 'offsetX', '%'],
          ['main-offset-y', 'main-offset-y-value', 'offsetY', '%'],
        ]
      : [
          ['sub-offset-x', 'sub-offset-x-value', 'offsetX', '%'],
          ['sub-offset-y', 'sub-offset-y-value', 'offsetY', '%'],
        ];

    pairs.forEach(([inputId, displayId, key, unit]) => {
      const val = Math.round(this.preset[part][key]);
      const input = document.getElementById(inputId);
      const display = document.getElementById(displayId);
      if (input) input.value = val;
      if (display) display.textContent = val + unit;
    });
  }

  // =====================
  // ボタン初期化
  // =====================
  _initButtons() {
    const saveBtn = document.getElementById('btn-save-avatar');
    const resetBtn = document.getElementById('btn-reset-avatar');
    const indicator = document.getElementById('save-indicator');

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        AvatarModule.savePreset(this.preset);
        // AppModuleに通知（存在する場合）
        if (window.AppModule) window.AppModule.onPresetUpdated(this.preset);

        if (indicator) {
          indicator.textContent = '✅ 保存しました！';
          indicator.style.opacity = '1';
          setTimeout(() => {
            indicator.textContent = '✅ 保存済み';
          }, 2000);
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.preset = AvatarModule.getDefaultPreset();
        this._syncSlidersToPreset();
        this._preloadAndRender();
      });
    }
  }

  // =====================
  // プレビュー描画
  // =====================
  async _preloadAndRender() {
    await AvatarModule.preloadAvatarImages(this.preset);
    this._render();
    // ドラッグハンドルを正しい位置に更新
    this._updateDragHandles();
  }

  _render() {
    this._renderPreview();
    this._updateDragHandles();
  }

  _renderPreview() {
    const ctx = this.ctx;
    const size = PREVIEW_SIZE;
    const cx = size / 2;
    const cy = size / 2;
    const faceR = FACE_RADIUS;

    ctx.clearRect(0, 0, size, size);

    // 背景: 暗いサークル（顔を模したダミー）
    const grad = ctx.createRadialGradient(cx, cy - faceR * 0.2, faceR * 0.2, cx, cy, faceR);
    grad.addColorStop(0, '#3d3060');
    grad.addColorStop(1, '#1a1240');

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // 顔の輪郭
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(123,79,245,0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();

    // 顔の中心クロス（参考用ガイド）
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx - faceR, cy); ctx.lineTo(cx + faceR, cy);
    ctx.moveTo(cx, cy - faceR); ctx.lineTo(cx, cy + faceR);
    ctx.stroke();
    ctx.restore();

    // アバター描画（プレビュー用スケール）
    const faceRegion = {
      x: cx - faceR,
      y: cy - faceR,
      width: faceR * 2,
      height: faceR * 2,
    };
    AvatarModule.drawAvatarOnFace(ctx, faceRegion, this.preset, {});
  }

  // ドラッグハンドルをプレビュー上の計算位置に配置
  _updateDragHandles() {
    const wrapper = document.querySelector('.avatar-preview-wrapper');
    if (!wrapper) return;
    const wSize = wrapper.offsetWidth; // 表示サイズ（CSSによりPREVIEW_SIZEと一致するが念のため）
    const scale = wSize / PREVIEW_SIZE;

    const cx = PREVIEW_SIZE / 2;
    const cy = PREVIEW_SIZE / 2;
    const faceR = FACE_RADIUS;
    const faceSize = faceR * 2;

    // main 絵文字の中心位置
    const mainSizePx = faceSize * (this.preset.main.size / 100);
    const mainX = cx + (this.preset.main.offsetX / 100) * faceSize;
    const mainY = cy + (this.preset.main.offsetY / 100) * faceSize;

    // sub 絵文字の中心位置
    const subSizePx = mainSizePx * (this.preset.sub.size / 100);
    const subX = mainX + (this.preset.sub.offsetX / 100) * mainSizePx;
    const subY = mainY + (this.preset.sub.offsetY / 100) * mainSizePx;

    this._positionDragHandle('drag-main', 'drag-main-emoji',
      mainX * scale, mainY * scale, mainSizePx * scale, this.preset.main.emoji);
    this._positionDragHandle('drag-sub', 'drag-sub-emoji',
      subX * scale, subY * scale, subSizePx * scale, this.preset.sub.emoji);
  }

  _positionDragHandle(handleId, emojiId, x, y, size, emoji) {
    const handle = document.getElementById(handleId);
    if (!handle) return;
    // ハンドルはtransform: translate(-50%,-50%)で中心基準
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;
    handle.style.width = `${size}px`;
    handle.style.height = `${size}px`;
    // ドラッグ可能エリアとして機能（実際の絵文字はCanvas側に描画）
    handle.style.borderRadius = '50%';
    handle.style.border = '2px dashed rgba(168,85,247,0.4)';
    handle.style.cursor = 'grab';
    handle.title = `${emoji} をドラッグで移動`;
  }

  // debounce用タイマー
  _debouncedRender() {
    clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => this._render(), 30);
  }

  // 現在のプリセットを返す
  getPreset() {
    return this.preset;
  }
}

// グローバル公開
window.AvatarEditor = AvatarEditor;
