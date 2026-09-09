/**
 * app.js
 * メインアプリケーションロジック・状態管理
 * 各モジュール（CollageEngine, FaceDetector, AvatarModule, AvatarEditor）を統合
 */

'use strict';

// ==============================
// アプリケーション状態
// ==============================

const AppState = {
  photos: [],       // [{ id, imgEl, file, name }]
  faces: [],        // 顔データ配列（全写真分の合算）
  preset: null,     // アバタープリセット（AvatarModuleから読み込み）
  photoCount: 4,
  gap: 12,
  bgColor: '#1a1a2e',
  cornerRadius: 8,
  mosaicStrength: 12,
  nextPhotoId: 1,
  isDetecting: false,
};

// モジュール参照
let collageEngine = null;
let faceDetector = null;
let avatarEditor = null;

// ==============================
// 初期化
// ==============================

document.addEventListener('DOMContentLoaded', async () => {
  initCollageEngine();
  initTabs();
  initUpload();
  initLayoutControls();
  initFaceControls();
  initPreviewButtons();
  initFaceDetector();

  // アバタープリセット読み込み
  AppState.preset = AvatarModule.loadPreset();

  // アバタープリセットを絵文字画像をプリロード
  await AvatarModule.preloadAvatarImages(AppState.preset);

  // 初期コラージュ描画（空の状態）
  redrawCollage();
});

// ==============================
// CollageEngine 初期化
// ==============================

function initCollageEngine() {
  const canvas = document.getElementById('collage-canvas');
  collageEngine = new CollageEngine(canvas);

  // CSS による表示スケーリング設定
  fitCanvasToPreview();
  window.addEventListener('resize', fitCanvasToPreview);
}

function fitCanvasToPreview() {
  const canvas = document.getElementById('collage-canvas');
  const wrapper = document.getElementById('canvas-wrapper');
  if (!canvas || !wrapper) return;

  const maxH = wrapper.parentElement.offsetHeight - 80;
  const maxW = wrapper.parentElement.offsetWidth - 32;

  // 16:9 縦（9:16）比率で最大サイズに収める
  const aspectRatio = 1080 / 1920;
  let displayH = maxH;
  let displayW = displayH * aspectRatio;

  if (displayW > maxW) {
    displayW = maxW;
    displayH = displayW / aspectRatio;
  }

  canvas.style.width  = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
  wrapper.style.width  = `${displayW}px`;
  wrapper.style.height = `${displayH}px`;
}

// ==============================
// タブ切り替え
// ==============================

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('aria-controls');

      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(target)?.classList.add('active');

      // アバター設定タブを開いた際にエディタを初期化
      if (target === 'panel-avatar' && !avatarEditor) {
        avatarEditor = new AvatarEditor();
      } else if (target === 'panel-avatar' && avatarEditor) {
        avatarEditor._preloadAndRender();
      }

      // コラージュタブに戻ったらプレビューをフィット
      if (target === 'panel-collage') {
        setTimeout(fitCanvasToPreview, 50);
      }
    });
  });
}

// ==============================
// 写真アップロード
// ==============================

function initUpload() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  // ドラッグ＆ドロップ
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles([...e.dataTransfer.files]);
  });

  fileInput.addEventListener('change', () => {
    handleFiles([...fileInput.files]);
    fileInput.value = '';
  });
}

async function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (imageFiles.length === 0) return;

  showLoading('写真を読み込み中…');

  const loadPromises = imageFiles.map(file => loadImageFile(file));
  const loaded = await Promise.all(loadPromises);

  loaded.forEach(item => {
    if (item) AppState.photos.push(item);
  });

  hideLoading();
  renderPhotoList();
  redrawCollage();

  // 顔検出（バックグラウンド）
  if (faceDetector?.ready) {
    detectFacesForAllPhotos();
  }
}

function loadImageFile(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const id = AppState.nextPhotoId++;
        img._photoId = id;
        resolve({ id, imgEl: img, file, name: file.name });
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ==============================
// 写真サムネイルリスト描画
// ==============================

function renderPhotoList() {
  const list = document.getElementById('photo-list');
  list.innerHTML = '';

  AppState.photos.forEach(photo => {
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.dataset.photoId = photo.id;

    const img = document.createElement('img');
    img.src = photo.imgEl.src;
    img.alt = photo.name;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'photo-thumb-remove';
    removeBtn.textContent = '×';
    removeBtn.title = '削除';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      removePhoto(photo.id);
    });

    thumb.appendChild(img);
    thumb.appendChild(removeBtn);
    list.appendChild(thumb);
  });
}

function removePhoto(id) {
  AppState.photos = AppState.photos.filter(p => p.id !== id);
  AppState.faces  = AppState.faces.filter(f => !f.id.startsWith(`face_${id}_`));
  renderPhotoList();
  renderFaceList();
  redrawCollage();
}

// ==============================
// レイアウトコントロール
// ==============================

function initLayoutControls() {
  // 枚数ステッパー
  const countMinus = document.getElementById('count-minus');
  const countPlus  = document.getElementById('count-plus');
  const countInput = document.getElementById('photo-count');
  const countDisplay = document.getElementById('photo-count-display');

  function setPhotoCount(val) {
    const n = Math.min(9, Math.max(1, val));
    AppState.photoCount = n;
    countInput.value = n;
    countDisplay.textContent = n;
    redrawCollage();
  }

  countMinus.addEventListener('click', () => setPhotoCount(AppState.photoCount - 1));
  countPlus.addEventListener('click',  () => setPhotoCount(AppState.photoCount + 1));

  // Gap スライダー
  const gapSlider = document.getElementById('gap-slider');
  const gapValue  = document.getElementById('gap-value');
  gapSlider.addEventListener('input', () => {
    const v = parseInt(gapSlider.value);
    // UIの表示はpxだが、Canvas座標系はUIと異なるのでスケール変換
    // Canvas = 1080px, 表示はフィット後のサイズ
    // ここでは比率を維持するため Canvas px で扱う
    const canvasGap = Math.round(v * (1080 / 400)); // 大体の変換（実際は表示幅に依存）
    AppState.gap = v * 3; // シンプルに3倍スケール（1080/360≒3）
    gapValue.textContent = `${v}px`;
    redrawCollage();
  });

  // 背景色
  const bgColorInput = document.getElementById('bg-color');
  bgColorInput.addEventListener('input', () => {
    AppState.bgColor = bgColorInput.value;
    redrawCollage();
  });

  // カラープリセット
  document.querySelectorAll('.color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      AppState.bgColor = color;
      bgColorInput.value = color;
      document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      redrawCollage();
    });
  });

  // 角丸スライダー
  const cornerSlider = document.getElementById('corner-radius-slider');
  const cornerValue  = document.getElementById('corner-radius-value');
  cornerSlider.addEventListener('input', () => {
    const v = parseInt(cornerSlider.value);
    AppState.cornerRadius = v * 3; // Canvas座標系にスケール
    cornerValue.textContent = `${v}px`;
    redrawCollage();
  });
}

// ==============================
// 顔検出コントロール
// ==============================

function initFaceControls() {
  const mosaicSlider = document.getElementById('mosaic-strength');
  const mosaicValue  = document.getElementById('mosaic-value');

  mosaicSlider.addEventListener('input', () => {
    const v = parseInt(mosaicSlider.value);
    AppState.mosaicStrength = v;
    // AppModule.mosaicStrength も更新（collage.jsから参照）
    window.AppModule = window.AppModule || {};
    window.AppModule.mosaicStrength = v;
    mosaicValue.textContent = v;
    redrawCollage();
  });
}

// ==============================
// 顔検出初期化
// ==============================

function initFaceDetector() {
  faceDetector = new FaceDetector();

  const statusDot  = document.getElementById('status-dot');
  const statusText = document.getElementById('face-status-text');

  faceDetector.init().then(ready => {
    if (ready) {
      statusDot.classList.remove('loading');
      statusDot.classList.add('ready');
      statusText.textContent = '顔検出 準備完了';

      // すでに写真がある場合は検出開始
      if (AppState.photos.length > 0) {
        detectFacesForAllPhotos();
      }
    } else {
      statusDot.classList.remove('loading');
      statusDot.classList.add('error');
      statusText.textContent = '顔検出 利用不可（オフライン？）';
    }
  });
}

// ==============================
// 顔検出実行
// ==============================

async function detectFacesForAllPhotos() {
  if (AppState.isDetecting) return;
  AppState.isDetecting = true;

  const statusText = document.getElementById('face-status-text');
  statusText.textContent = '顔を検出中…';

  AppState.faces = [];

  const mappings = collageEngine.getCellPhotoMappings(AppState.photoCount);

  for (const mapping of mappings) {
    const { cell, photo, scaleX, scaleY, cropX, cropY } = mapping;
    try {
      const faces = await faceDetector.detectInCell(
        photo.imgEl, cell, scaleX, scaleY, cropX, cropY
      );
      AppState.faces.push(...faces);
    } catch (e) {
      console.warn('顔検出エラー:', e);
    }
  }

  AppState.isDetecting = false;

  const count = AppState.faces.length;
  statusText.textContent = count > 0
    ? `${count} 件の顔を検出`
    : '顔が検出されませんでした';

  renderFaceList();
  redrawCollage();
}

// ==============================
// 顔リスト UI 描画
// ==============================

function renderFaceList() {
  const container = document.getElementById('detected-faces');
  container.innerHTML = '';

  if (AppState.faces.length === 0) {
    container.innerHTML = '<p class="faces-hint">写真を追加すると顔が自動検出されます</p>';
    return;
  }

  AppState.faces.forEach((face, idx) => {
    const item = document.createElement('div');
    item.className = 'face-item';

    // 顔サムネイル（Canvasから切り出し）
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'face-thumb-canvas';
    thumbCanvas.width  = 40;
    thumbCanvas.height = 40;
    drawFaceThumb(thumbCanvas, face);

    // コントロール
    const controls = document.createElement('div');
    controls.className = 'face-controls';

    const label = document.createElement('div');
    label.className = 'face-label';
    label.textContent = `顔 ${idx + 1}`;

    const modeBtns = document.createElement('div');
    modeBtns.className = 'face-mode-btns';

    ['avatar', 'mosaic', 'none'].forEach(mode => {
      const btn = document.createElement('button');
      btn.className = `face-mode-btn${face.mode === mode ? ' active' : ''}`;
      btn.dataset.mode = mode;
      btn.textContent = mode === 'avatar' ? '😆 アバター'
                      : mode === 'mosaic' ? '🔲 モザイク'
                      : '✕ なし';
      btn.addEventListener('click', () => {
        face.mode = mode;
        modeBtns.querySelectorAll('.face-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        redrawCollage();
      });
      modeBtns.appendChild(btn);
    });

    controls.appendChild(label);
    controls.appendChild(modeBtns);
    item.appendChild(thumbCanvas);
    item.appendChild(controls);
    container.appendChild(item);
  });
}

function drawFaceThumb(thumbCanvas, face) {
  const collageCanvas = document.getElementById('collage-canvas');
  const ctx = thumbCanvas.getContext('2d');
  const { x, y, width, height } = face;

  // コラージュCanvasから顔部分を切り出してサムネイルに描画
  ctx.drawImage(collageCanvas, x, y, width, height, 0, 0, 40, 40);
}

// ==============================
// コラージュ再描画
// ==============================

function redrawCollage() {
  if (!collageEngine) return;

  // 設定をエンジンに反映
  collageEngine.photos = AppState.photos;
  collageEngine.updateConfig({
    bgColor:      AppState.bgColor,
    gap:          AppState.gap,
    cornerRadius: AppState.cornerRadius,
    photoCount:   AppState.photoCount,
  });

  // 描画実行
  collageEngine.draw(AppState.faces, AppState.preset);

  // mosaicStrength をグローバルに公開（collage.jsから参照）
  if (!window.AppModule) window.AppModule = {};
  window.AppModule.mosaicStrength = AppState.mosaicStrength;

  // アバターオーバーレイハンドル更新（個別微調整用UI）
  updateAvatarOverlayHandles();
}

// ==============================
// アバターオーバーレイハンドル（個別微調整）
// ==============================

function updateAvatarOverlayHandles() {
  const overlayContainer = document.getElementById('avatar-overlays');
  if (!overlayContainer) return;
  overlayContainer.innerHTML = '';

  const avatarFaces = AppState.faces.filter(f => f.mode === 'avatar');

  avatarFaces.forEach(face => {
    const canvas = document.getElementById('collage-canvas');
    const displayW = parseFloat(canvas.style.width) || canvas.width;
    const scaleToDisplay = displayW / canvas.width;

    const cx = (face.x + face.width  / 2) * scaleToDisplay;
    const cy = (face.y + face.height / 2) * scaleToDisplay;
    const size = Math.max(face.width, face.height) * scaleToDisplay * 1.2;

    const handle = document.createElement('div');
    handle.className = 'avatar-overlay-handle';
    handle.style.left   = `${cx - size/2}px`;
    handle.style.top    = `${cy - size/2}px`;
    handle.style.width  = `${size}px`;
    handle.style.height = `${size}px`;
    handle.title = 'ドラッグしてアバターを移動（右クリックで追加設定）';

    // ドラッグ処理
    makeDraggable(handle, face, scaleToDisplay);

    overlayContainer.appendChild(handle);
  });
}

function makeDraggable(handle, face, scale) {
  let startX, startY, startPosX, startPosY;

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    startPosX = face.override.posX || 0;
    startPosY = face.override.posY || 0;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      face.override.posX = startPosX + dx;
      face.override.posY = startPosY + dy;
      redrawCollage();
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

// ==============================
// プレビューボタン
// ==============================

function initPreviewButtons() {
  // 再生成
  document.getElementById('btn-refresh')?.addEventListener('click', async () => {
    if (AppState.photos.length > 0 && faceDetector?.ready) {
      showLoading('顔を再検出中…');
      await detectFacesForAllPhotos();
      hideLoading();
    }
    redrawCollage();
  });

  // ダウンロード
  document.getElementById('btn-download')?.addEventListener('click', () => {
    // 最終描画（最高品質）
    redrawCollage();

    const dataUrl = collageEngine.exportPNG();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `story_collage_${Date.now()}.png`;
    a.click();
  });
}

// ==============================
// AppModule 公開（他モジュールからのコールバック用）
// ==============================

window.AppModule = {
  mosaicStrength: 12,

  // アバタープリセット更新通知（AvatarEditorから呼ばれる）
  onPresetUpdated(newPreset) {
    AppState.preset = newPreset;
    redrawCollage();
  },
};

// ==============================
// ローディングUI
// ==============================

function showLoading(text = '処理中…') {
  const overlay = document.getElementById('loading-overlay');
  const textEl  = document.getElementById('loading-text');
  if (overlay) overlay.removeAttribute('hidden');
  if (textEl)  textEl.textContent = text;
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.setAttribute('hidden', '');
}
