/**
 * collage.js
 * コラージュレイアウトエンジン
 * - 写真枚数に応じたグリッド計算
 * - 背景色・gap・角丸を適用してCanvasに描画
 * - 顔モザイク処理
 */

'use strict';

// =====================
// レイアウトテンプレート定義
// =====================
// 各テンプレートは cells の配列 [{ col, row, colSpan, rowSpan }] で表現
// グリッドは cols x rows で分割

const LAYOUT_TEMPLATES = {
  1: {
    cols: 1, rows: 1,
    cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }],
  },
  2: {
    cols: 1, rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  3: {
    cols: 2, rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 1 }, // 上段: 全幅
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 }, // 下段左
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 }, // 下段右
    ],
  },
  4: {
    cols: 2, rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  5: {
    cols: 3, rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 2, rowSpan: 1 }, // 下段右2つ結合
    ],
  },
  6: {
    cols: 3, rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  7: {
    cols: 3, rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 2, rowSpan: 1 },
    ],
  },
  8: {
    cols: 3, rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    ],
  },
  9: {
    cols: 3, rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    ],
  },
};

// =====================
// CollageEngine クラス
// =====================

class CollageEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Canvas サイズ（1080x1920 = Instagram Story 解像度）
    // ただし表示は CSS でスケーリング
    this.CANVAS_W = 1080;
    this.CANVAS_H = 1920;
    canvas.width  = this.CANVAS_W;
    canvas.height = this.CANVAS_H;

    // 現在の設定
    this.config = {
      bgColor:      '#1a1a2e',
      gap:          12,    // px (canvas座標系)
      cornerRadius: 8,     // px
      photoCount:   4,
    };

    // 写真データ
    this.photos = []; // [{ imgEl, id }]

    // 検出顔データ
    this.faces = []; // FaceDetector.detectInCell が返す配列の集合
  }

  // =====================
  // 設定更新
  // =====================
  updateConfig(partialConfig) {
    Object.assign(this.config, partialConfig);
  }

  // =====================
  // セルレイアウト計算
  // =====================
  /**
   * 写真枚数に応じたセルの絶対座標リストを返す
   * @param {number} count
   * @returns {Array<{x, y, width, height, photoIndex}>}
   */
  computeCells(count) {
    const n = Math.min(Math.max(1, count), 9);
    const template = LAYOUT_TEMPLATES[n];
    const { cols, rows } = template;
    const { CANVAS_W, CANVAS_H } = this;
    const gap = this.config.gap;

    // セル基本サイズ
    const totalGapX = gap * (cols + 1);
    const totalGapY = gap * (rows + 1);
    const unitW = (CANVAS_W - totalGapX) / cols;
    const unitH = (CANVAS_H - totalGapY) / rows;

    return template.cells.map((cell, i) => ({
      x: gap + cell.col * (unitW + gap),
      y: gap + cell.row * (unitH + gap),
      width:  unitW * cell.colSpan + gap * (cell.colSpan - 1),
      height: unitH * cell.rowSpan + gap * (cell.rowSpan - 1),
      photoIndex: i,
    }));
  }

  // =====================
  // 画像フィット計算（比率そのまま、切り取りなし: object-fit: contain 相当）
  // =====================
  _getContainFit(imgEl, cellW, cellH) {
    const imgW = imgEl.naturalWidth || imgEl.width;
    const imgH = imgEl.naturalHeight || imgEl.height;
    const imgAspect = imgW / imgH;
    const cellAspect = cellW / cellH;

    let dw, dh, dx, dy;
    if (imgAspect > cellAspect) {
      // 画像がセルより横長 → 横幅をセルに合わせる
      dw = cellW;
      dh = cellW / imgAspect;
      dx = 0;
      dy = (cellH - dh) / 2;
    } else {
      // 画像がセルより縦長 → 高さをセルに合わせる
      dh = cellH;
      dw = cellH * imgAspect;
      dx = (cellW - dw) / 2;
      dy = 0;
    }
    return {
      dx, dy, dw, dh,
      scale: dw / imgW
    };
  }

  // =====================
  // コラージュ描画（メイン）
  // =====================
  /**
   * @param {Array} faces - 顔データ配列（モザイク・アバター処理用）
   * @param {Object} preset - アバタープリセット
   */
  draw(faces = [], preset = null) {
    const ctx = this.ctx;
    const { CANVAS_W, CANVAS_H, config } = this;

    // 背景塗りつぶし
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const cells = this.computeCells(config.photoCount);

    cells.forEach((cell, i) => {
      const photo = this.photos[i];
      if (!photo) return; // 写真なし → 背景色のまま

      this._drawPhotoInCell(ctx, photo.imgEl, cell);
    });

    // 顔処理（モザイク / アバター）
    if (faces.length > 0) {
      this._processFaces(ctx, faces, preset);
    }
  }

  /**
   * セル内に写真を描画（比率維持・切り取りなし・角丸クリッピング）
   */
  _drawPhotoInCell(ctx, imgEl, cell) {
    const { x, y, width, height } = cell;
    const r = this.config.cornerRadius;

    // 比率そのまま収める（object-fit: contain 相当）
    const fit = this._getContainFit(imgEl, width, height);
    const targetX = x + fit.dx;
    const targetY = y + fit.dy;
    const targetW = fit.dw;
    const targetH = fit.dh;

    ctx.save();

    // 写真の実際の描画範囲に対して角丸クリッピング
    ctx.beginPath();
    ctx.moveTo(targetX + r, targetY);
    ctx.lineTo(targetX + targetW - r, targetY);
    ctx.quadraticCurveTo(targetX + targetW, targetY, targetX + targetW, targetY + r);
    ctx.lineTo(targetX + targetW, targetY + targetH - r);
    ctx.quadraticCurveTo(targetX + targetW, targetY + targetH, targetX + targetW - r, targetY + targetH);
    ctx.lineTo(targetX + r, targetY + targetH);
    ctx.quadraticCurveTo(targetX, targetY + targetH, targetX, targetY + targetH - r);
    ctx.lineTo(targetX, targetY + r);
    ctx.quadraticCurveTo(targetX, targetY, targetX + r, targetY);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(imgEl, targetX, targetY, targetW, targetH);

    ctx.restore();
  }

  // =====================
  // 顔処理（モザイク / アバター）
  // =====================
  _processFaces(ctx, faces, preset) {
    faces.forEach(face => {
      if (face.mode === 'mosaic') {
        this._drawMosaicCircle(ctx, face);
      } else if (face.mode === 'avatar' && preset) {
        AvatarModule.drawAvatarOnFace(ctx, face, preset, face.override);
      }
      // mode === 'none' は何もしない
    });
  }

  /**
   * 丸型モザイク処理
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} face - { x, y, width, height }
   */
  _drawMosaicCircle(ctx, face) {
    const { x, y, width, height } = face;
    const override = face.override || {};
    const baseR = Math.max(width, height) / 2 * 1.1; // 少し余裕を持たせる
    const r = baseR * (override.scale || 1.0);
    const cx = (x + width / 2) + (override.posX || 0);
    const cy = (y + height / 2) + (override.posY || 0);
    const blockSize = window.AppModule?.mosaicStrength || 12;
    const mosaicType = window.AppModule?.mosaicType || 'pixel';

    // 丸クリッピング
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const left   = Math.max(0, Math.floor(cx - r));
    const top    = Math.max(0, Math.floor(cy - r));
    const right  = Math.min(this.CANVAS_W, Math.ceil(cx + r));
    const bottom = Math.min(this.CANVAS_H, Math.ceil(cy + r));
    const w = right - left;
    const h = bottom - top;

    if (w > 0 && h > 0) {
      if (mosaicType === 'blur') {
        // ① スムースブラー（縮小・拡大補間による高速ガウス風ぼかし）
        this._renderBlurEffect(ctx, left, top, w, h, blockSize);
      } else if (mosaicType === 'hex') {
        // ② 六角形 / ハニカムモザイク
        this._renderHexMosaic(ctx, left, top, right, bottom, cx, cy, r, blockSize);
      } else if (mosaicType === 'frosted') {
        // ③ すりガラス（微小ノイズ＋ぼかし散乱）
        this._renderFrostedEffect(ctx, left, top, w, h, blockSize);
      } else {
        // ④ 標準ピクセルモザイク（ブロック内ピクセルの平均色をサンプリングして均一かつ綺麗に隠す）
        const regionData = ctx.getImageData(left, top, w, h);
        const data = regionData.data;

        for (let by = 0; by < h; by += blockSize) {
          for (let bx = 0; bx < w; bx += blockSize) {
            const bw = Math.min(blockSize, w - bx);
            const bh = Math.min(blockSize, h - by);

            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            // 4点または中央サンプルで色平均を算出
            const step = Math.max(1, Math.floor(blockSize / 3));
            for (let py = 0; py < bh; py += step) {
              for (let px = 0; px < bw; px += step) {
                const idx = ((by + py) * w + (bx + px)) * 4;
                rSum += data[idx];
                gSum += data[idx + 1];
                bSum += data[idx + 2];
                count++;
              }
            }

            const avgR = (rSum / count) | 0;
            const avgG = (gSum / count) | 0;
            const avgB = (bSum / count) | 0;

            ctx.fillStyle = `rgb(${avgR},${avgG},${avgB})`;
            ctx.fillRect(left + bx, top + by, bw, bh);
          }
        }
      }
    }

    ctx.restore();
  }

  /** ① スムースブラー描画（多段ダウンサンプリング＆アップサンプリングで確実に顔立ちをぼかす） */
  _renderBlurEffect(ctx, left, top, w, h, strength) {
    // 強度4〜80に対して、縮小率を動的に調整（強い設定では極小解像度に落として完全な滑らかぼかしに）
    const factor = Math.max(0.012, 1 / (strength * 1.6));
    const sw = Math.max(2, Math.floor(w * factor));
    const sh = Math.max(2, Math.floor(h * factor));

    const temp1 = document.createElement('canvas');
    temp1.width = sw;
    temp1.height = sh;
    const tCtx1 = temp1.getContext('2d');
    tCtx1.imageSmoothingEnabled = true;
    tCtx1.imageSmoothingQuality = 'high';
    tCtx1.drawImage(this.canvas, left, top, w, h, 0, 0, sw, sh);

    // 中間キャンバスを挟む2回パスでガウス分布に近い滑らかさを再現
    const mw = Math.max(4, Math.floor(sw * 1.8));
    const mh = Math.max(4, Math.floor(sh * 1.8));
    const temp2 = document.createElement('canvas');
    temp2.width = mw;
    temp2.height = mh;
    const tCtx2 = temp2.getContext('2d');
    tCtx2.imageSmoothingEnabled = true;
    tCtx2.imageSmoothingQuality = 'high';
    tCtx2.drawImage(temp1, 0, 0, sw, sh, 0, 0, mw, mh);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(temp2, 0, 0, mw, mh, left, top, w, h);
  }

  /** ② 六角形 / ハニカムモザイク */
  _renderHexMosaic(ctx, left, top, right, bottom, cx, cy, r, hexR) {
    const h = hexR * Math.sqrt(3);
    const rad = hexR;

    for (let y = top - rad; y < bottom + rad; y += h * 0.75) {
      const row = Math.round(y / (h * 0.75));
      const xOffset = (row % 2 === 0) ? 0 : rad * 1.5;

      for (let x = left - rad * 2 + xOffset; x < right + rad * 2; x += rad * 3) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= (r + rad) * (r + rad)) {
          const sampleX = Math.min(Math.max(0, Math.round(x)), this.CANVAS_W - 1);
          const sampleY = Math.min(Math.max(0, Math.round(y)), this.CANVAS_H - 1);
          const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;

          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const hx = x + rad * Math.cos(angle);
            const hy = y + rad * Math.sin(angle);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fillStyle = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
          ctx.fill();
        }
      }
    }
  }

  /** ③ すりガラスノイズ効果（高密度ブラー＋粒状感） */
  _renderFrostedEffect(ctx, left, top, w, h, strength) {
    this._renderBlurEffect(ctx, left, top, w, h, strength * 1.2);

    const imgData = ctx.getImageData(left, top, w, h);
    const data = imgData.data;
    const len = data.length;
    // 強度に応じて自然に増減するノイズ量
    const noiseAmount = Math.min(55, 18 + strength * 0.4);

    for (let i = 0; i < len; i += 4) {
      const n = (Math.random() - 0.5) * noiseAmount;
      data[i]     = Math.min(255, Math.max(0, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
    }
    ctx.putImageData(imgData, left, top);
  }

  // =====================
  // PNG / 高解像度（2K: 1440x2560）エクスポート
  // =====================
  exportPNG() {
    return this.canvas.toDataURL('image/png');
  }

  /**
   * 2K解像度（1440 × 2560）でオフスクリーンキャンバスに高品質レンダリングしてDataURL(PNG)を返す
   * ブラウザが拡張子無しのUUIDファイルとして誤認保存するのを防ぎ、確実に.pngとして保存させる
   * @param {Array} faces
   * @param {Object} preset
   * @returns {string} DataURL
   */
  exportHighResDataURL(faces = [], preset = null, targetW = 1440, targetH = 2560) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = targetW;
    offCanvas.height = targetH;
    const offEngine = new CollageEngine(offCanvas);

    offEngine.CANVAS_W = targetW;
    offEngine.CANVAS_H = targetH;

    const scaleFactor = targetW / this.CANVAS_W;

    offEngine.photos = this.photos;
    offEngine.config = {
      ...this.config,
      gap: this.config.gap * scaleFactor,
      cornerRadius: this.config.cornerRadius * scaleFactor,
    };

    // 顔の位置・サイズも2K解像度にスケール変換
    const scaledFaces = faces.map(f => ({
      ...f,
      x: f.x * scaleFactor,
      y: f.y * scaleFactor,
      width: f.width * scaleFactor,
      height: f.height * scaleFactor,
      override: f.override ? {
        ...f.override,
        posX: (f.override.posX || 0) * scaleFactor,
        posY: (f.override.posY || 0) * scaleFactor,
        scale: f.override.scale || 1.0,
        rotation: f.override.rotation || 0,
      } : { posX: 0, posY: 0, scale: 1.0, rotation: 0 }
    }));

    offEngine.draw(scaledFaces, preset);

    return offCanvas.toDataURL('image/png');
  }

  /**
   * セルと写真のスケール・オフセット情報を返す（顔検出座標変換用）
   * @param {number} photoCount
   * @returns {Array<{cell, photo, scaleX, scaleY, offsetX, offsetY}>}
   */
  getCellPhotoMappings(photoCount) {
    const cells = this.computeCells(photoCount);
    return cells.map((cell, i) => {
      const photo = this.photos[i];
      if (!photo) return null;
      const fit = this._getContainFit(photo.imgEl, cell.width, cell.height);
      return {
        cell,
        photo,
        scaleX: fit.scale,
        scaleY: fit.scale,
        offsetX: fit.dx,
        offsetY: fit.dy,
      };
    }).filter(Boolean);
  }
}

// グローバル公開
window.CollageEngine = CollageEngine;
