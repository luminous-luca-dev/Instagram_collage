/**
 * face-detector.js
 * face-api.js を使ったブラウザ内顔検出ラッパー
 * - モデルをCDNから自動ロード
 * - 画像から顔の矩形リストを返す
 */

'use strict';

const FACE_API_MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/';

class FaceDetector {
  constructor() {
    this.ready = false;
    this.loading = false;
  }

  /**
   * モデルを初期化（非同期）
   * @returns {Promise<boolean>}
   */
  async init() {
    if (this.ready) return true;
    if (this.loading) {
      // 既にロード中なら完了を待つ
      while (this.loading) await new Promise(r => setTimeout(r, 100));
      return this.ready;
    }

    this.loading = true;
    try {
      // face-api.js が読み込まれているか確認
      if (typeof faceapi === 'undefined') {
        throw new Error('face-api.js が読み込まれていません');
      }

      // SSD Mobilenet V1 モデルをロード（軽量で高精度）
      await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODELS_URL);
      // TinyFaceDetector（より高速）もロード（サブオプション）
      await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODELS_URL);

      this.ready = true;
      console.log('✅ FaceDetector: モデルロード完了');
    } catch (err) {
      console.error('❌ FaceDetector: モデルロード失敗', err);
      this.ready = false;
    } finally {
      this.loading = false;
    }

    return this.ready;
  }

  /**
   * 画像から顔を検出する
   * @param {HTMLImageElement|HTMLCanvasElement} imageEl
   * @returns {Promise<Array<{x, y, width, height, score}>>}
   */
  async detect(imageEl) {
    if (!this.ready) {
      console.warn('FaceDetector: モデル未初期化');
      return [];
    }

    try {
      const detections = await faceapi.detectAllFaces(
        imageEl,
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 })
      );

      return detections.map(d => ({
        x: d.box.x,
        y: d.box.y,
        width: d.box.width,
        height: d.box.height,
        score: d.score,
      }));
    } catch (err) {
      console.error('FaceDetector.detect エラー:', err);
      return [];
    }
  }

  /**
   * Canvas描画済み画像から、コラージュ上のセル座標に変換した顔リストを返す
   * @param {HTMLImageElement} imgEl   - 元画像
   * @param {Object} cell              - { x, y, width, height } コラージュ上のセル位置(px)
   * @param {number} scaleX            - 元画像→セルのXスケール
   * @param {number} scaleY            - 元画像→セルのYスケール
   * @param {number} cropX             - 元画像のクロップ開始X
   * @param {number} cropY             - 元画像のクロップ開始Y
   * @returns {Promise<Array>}
   */
  async detectInCell(imgEl, cell, scaleX, scaleY, offsetX = 0, offsetY = 0) {
    const faces = await this.detect(imgEl);

    return faces.map((f, i) => ({
      id: `face_${imgEl._photoId || 0}_${i}`,
      // コラージュCanvas上の座標に変換（写真の描画オフセット + スケール適用座標）
      x: cell.x + offsetX + f.x * scaleX,
      y: cell.y + offsetY + f.y * scaleY,
      width: f.width * scaleX,
      height: f.height * scaleY,
      score: f.score,
      // 元画像上の座標も保持（クロップ計算用）
      srcX: f.x,
      srcY: f.y,
      srcWidth: f.width,
      srcHeight: f.height,
      mode: 'avatar', // デフォルト: アバター表示
      // 個別微調整値（初期値）
      override: { posX: 0, posY: 0, scale: 1.0, rotation: 0 },
    }));
  }
}

// グローバル公開
window.FaceDetector = FaceDetector;
