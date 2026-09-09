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
  // 画像クロップ計算（object-fit: cover 相当）
  // =====================
  _getCoverCrop(imgEl, cellW, cellH) {
    const imgW = imgEl.naturalWidth;
    const imgH = imgEl.naturalHeight;
    const imgAspect = imgW / imgH;
    const cellAspect = cellW / cellH;

    let sx, sy, sw, sh;
    if (imgAspect > cellAspect) {
      // 画像が横長 → 高さ基準でクロップ
      sh = imgH;
      sw = imgH * cellAspect;
      sx = (imgW - sw) / 2;
      sy = 0;
    } else {
      // 画像が縦長 → 幅基準でクロップ
      sw = imgW;
      sh = imgW / cellAspect;
      sx = 0;
      sy = (imgH - sh) / 2;
    }
    return { sx, sy, sw, sh };
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
   * セル内に写真を描画（角丸クリッピング + object-fit:cover）
   */
  _drawPhotoInCell(ctx, imgEl, cell) {
    const { x, y, width, height } = cell;
    const r = this.config.cornerRadius;

    ctx.save();

    // 角丸クリッピングパス
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.clip();

    // object-fit: cover 相当のクロップ
    const crop = this._getCoverCrop(imgEl, width, height);
    ctx.drawImage(imgEl, crop.sx, crop.sy, crop.sw, crop.sh, x, y, width, height);

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
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.max(width, height) / 2 * 1.1; // 少し余裕を持たせる
    const blockSize = window.AppModule?.mosaicStrength || 12;

    // 丸クリッピング
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // モザイク: ブロック単位でピクセルを読み取り塗りつぶす
    const left   = Math.max(0, Math.floor(cx - r));
    const top    = Math.max(0, Math.floor(cy - r));
    const right  = Math.min(this.CANVAS_W, Math.ceil(cx + r));
    const bottom = Math.min(this.CANVAS_H, Math.ceil(cy + r));

    for (let by = top; by < bottom; by += blockSize) {
      for (let bx = left; bx < right; bx += blockSize) {
        const bw = Math.min(blockSize, right - bx);
        const bh = Math.min(blockSize, bottom - by);
        const midX = bx + bw / 2;
        const midY = by + bh / 2;

        // ブロック中央の色を取得
        const pixel = ctx.getImageData(midX | 0, midY | 0, 1, 1).data;
        ctx.fillStyle = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
        ctx.fillRect(bx, by, bw, bh);
      }
    }

    ctx.restore();

    // 円の縁取り（少し半透明白でなじませる）
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // =====================
  // PNG エクスポート
  // =====================
  exportPNG() {
    return this.canvas.toDataURL('image/png');
  }

  /**
   * セルと写真のスケール情報を返す（顔検出座標変換用）
   * @param {number} photoCount
   * @returns {Array<{cell, photo, scaleX, scaleY, cropX, cropY}>}
   */
  getCellPhotoMappings(photoCount) {
    const cells = this.computeCells(photoCount);
    return cells.map((cell, i) => {
      const photo = this.photos[i];
      if (!photo) return null;
      const crop = this._getCoverCrop(photo.imgEl, cell.width, cell.height);
      return {
        cell,
        photo,
        scaleX: cell.width  / crop.sw,
        scaleY: cell.height / crop.sh,
        cropX: crop.sx,
        cropY: crop.sy,
      };
    }).filter(Boolean);
  }
}

// グローバル公開
window.CollageEngine = CollageEngine;
