/**
 * avatar.js
 * Apple絵文字画像のキャッシュ・描画・プリセット管理
 * emoji-datasource-apple CDN を使用してAppleスタイルの絵文字をCanvasに描画
 */

'use strict';

// =====================
// Apple Emoji Image ユーティリティ
// =====================

const APPLE_EMOJI_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/';

/**
 * 絵文字文字列からUnicodeコードポイント文字列を生成
 * 例: '😆' → '1f606', '👓' → '1f453'
 * ZWJシーケンスは '-' で結合
 */
function emojiToCodepoint(emoji) {
  const codePoints = [];
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    // variation selector (U+FE0F) はスキップ
    if (cp !== 0xFE0F) {
      codePoints.push(cp.toString(16).toLowerCase());
    }
  }
  return codePoints.join('-');
}

/**
 * Apple絵文字画像のURL生成
 */
function getAppleEmojiUrl(emoji) {
  const cp = emojiToCodepoint(emoji);
  return `${APPLE_EMOJI_CDN}${cp}.png`;
}

// 画像キャッシュ（emoji → HTMLImageElement）
const emojiImageCache = new Map();

/**
 * Apple絵文字画像を非同期でロード（キャッシュ付き）
 * @param {string} emoji - 絵文字文字
 * @returns {Promise<HTMLImageElement>}
 */
async function loadAppleEmoji(emoji) {
  if (emojiImageCache.has(emoji)) {
    return emojiImageCache.get(emoji);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      emojiImageCache.set(emoji, img);
      resolve(img);
    };
    img.onerror = () => {
      // フォールバック: テキスト描画用にnullを返す
      console.warn(`Apple emoji not found for: ${emoji} (${getAppleEmojiUrl(emoji)})`);
      emojiImageCache.set(emoji, null);
      resolve(null);
    };
    img.src = getAppleEmojiUrl(emoji);
  });
}

/**
 * Canvas上に絵文字を描画（Apple画像優先、フォールバックはテキスト）
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|null} img  - ロード済み画像（null時はフォールバック）
 * @param {string} emoji               - フォールバック用の絵文字文字列
 * @param {number} x                   - 中心X座標
 * @param {number} y                   - 中心Y座標
 * @param {number} size                - 正方形サイズ（px）
 * @param {number} rotation            - 回転角度（度数）
 */
function drawEmojiOnCanvas(ctx, img, emoji, x, y, size, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  if (img) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    // フォールバック: システムフォントでテキスト描画
    ctx.font = `${size * 0.85}px 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 0);
  }

  ctx.restore();
}

// =====================
// デフォルトプリセット
// =====================

const DEFAULT_PRESET = {
  main: {
    emoji: '😆',
    size: 100,      // 顔サイズ比(%)
    offsetX: 0,     // 中心からのX offset（顔サイズ比%）
    offsetY: 0,
    rotation: 0,    // 度数
  },
  sub: {
    emoji: '👓',
    size: 60,       // mainサイズ比(%)
    offsetX: 0,     // mainの中心基準X offset（mainサイズ比%）
    offsetY: -60,   // mainの中心基準Y offset（負=上）
    rotation: 0,
  }
};

// =====================
// プリセット管理
// =====================

const STORAGE_KEY = 'storyCollage_avatarPreset_v1';

/**
 * プリセットをlocalStorageから読み込む
 */
function loadPreset() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // deep merge with defaults to handle new fields
      return {
        main: { ...DEFAULT_PRESET.main, ...saved.main },
        sub:  { ...DEFAULT_PRESET.sub,  ...saved.sub  },
      };
    }
  } catch (e) {
    console.warn('プリセット読み込みエラー:', e);
  }
  return { ...DEFAULT_PRESET, main: { ...DEFAULT_PRESET.main }, sub: { ...DEFAULT_PRESET.sub } };
}

/**
 * プリセットをlocalStorageに保存
 */
function savePreset(preset) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
  } catch (e) {
    console.warn('プリセット保存エラー:', e);
  }
}

/**
 * デフォルトプリセットを返す（deep copy）
 */
function getDefaultPreset() {
  return {
    main: { ...DEFAULT_PRESET.main },
    sub:  { ...DEFAULT_PRESET.sub  },
  };
}

// =====================
// アバター描画コア関数
// =====================

/**
 * 検出された顔にアバターを描画する
 * @param {CanvasRenderingContext2D} ctx - コラージュのCanvasコンテキスト
 * @param {Object} faceRegion - { x, y, width, height } キャンバス座標系での顔の位置
 * @param {Object} preset     - アバタープリセット
 * @param {Object} override   - 個別微調整値 { posX, posY, scale, rotation } (相対値)
 * @param {Map}    imgCache   - ロード済み絵文字画像キャッシュ
 */
function drawAvatarOnFace(ctx, faceRegion, preset, override = {}, imgCache = emojiImageCache) {
  const { x, y, width, height } = faceRegion;
  const faceSize = Math.max(width, height);
  const cx = x + width / 2;
  const cy = y + height / 2;

  // override 適用
  const posX = cx + (override.posX || 0);
  const posY = cy + (override.posY || 0);
  const scaleMultiplier = override.scale || 1.0;
  const extraRotation = override.rotation || 0;

  // --- メイン絵文字 😆 ---
  const mainSize = faceSize * (preset.main.size / 100) * scaleMultiplier;
  const mainX = posX + (preset.main.offsetX / 100) * faceSize;
  const mainY = posY + (preset.main.offsetY / 100) * faceSize;
  const mainRotation = preset.main.rotation + extraRotation;

  const mainImg = imgCache.get(preset.main.emoji);
  drawEmojiOnCanvas(ctx, mainImg || null, preset.main.emoji, mainX, mainY, mainSize, mainRotation);

  // --- サブ絵文字 👓 ---
  const subSize = mainSize * (preset.sub.size / 100);
  const subX = mainX + (preset.sub.offsetX / 100) * mainSize;
  const subY = mainY + (preset.sub.offsetY / 100) * mainSize;
  const subRotation = preset.sub.rotation + extraRotation;

  const subImg = imgCache.get(preset.sub.emoji);
  drawEmojiOnCanvas(ctx, subImg || null, preset.sub.emoji, subX, subY, subSize, subRotation);
}

/**
 * アバター描画に必要な絵文字画像をプリロード
 * @param {Object} preset
 * @returns {Promise<void>}
 */
async function preloadAvatarImages(preset) {
  const emojis = [preset.main.emoji, preset.sub.emoji];
  await Promise.all(emojis.map(e => loadAppleEmoji(e)));
}

// =====================
// Exports（グローバル公開）
// =====================

window.AvatarModule = {
  loadAppleEmoji,
  getAppleEmojiUrl,
  drawEmojiOnCanvas,
  drawAvatarOnFace,
  preloadAvatarImages,
  loadPreset,
  savePreset,
  getDefaultPreset,
  emojiImageCache,
};
