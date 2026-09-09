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
  mosaicType: 'pixel',
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

document.addEventListener('DOMContentLoaded', () => {
  // ページを即時表示してから非同期でライブラリをロード
  initCollageEngine();
  initTabs();
  initUpload();
  initLayoutControls();
  initFaceControls();
  initPreviewButtons();

  // アバタープリセット読み込み（同期）
  AppState.preset = AvatarModule.loadPreset();

  // 初期コラージュ描画（空の状態でも即表示）
  redrawCollage();

  // バックグラウンドで非同期ロード開始（ページ表示をブロックしない）
  startBackgroundLoading();
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

  // 初期値
  window.AppModule = window.AppModule || {};
  window.AppModule.mosaicStrength = AppState.mosaicStrength || 12;
  window.AppModule.mosaicType = AppState.mosaicType || 'pixel';

  mosaicSlider.addEventListener('input', () => {
    const v = parseInt(mosaicSlider.value);
    AppState.mosaicStrength = v;
    window.AppModule.mosaicStrength = v;
    mosaicValue.textContent = v;
    redrawCollage();
  });

  // モザイク種類ボタン
  const typeBtns = document.querySelectorAll('.mosaic-type-btn');
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      AppState.mosaicType = type;
      window.AppModule.mosaicType = type;
      redrawCollage();
    });
  });
}

// ==============================
// バックグラウンドロード（進捗ゲージ付き）
// ==============================

function setStep(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('done', 'active');
  el.classList.add(state);
}

function setProgress(pct) {
  const bar = document.getElementById('model-progress-fill');
  if (bar) bar.style.width = pct + '%';
}

async function startBackgroundLoading() {
  const statusDot  = document.getElementById('status-dot');
  const statusText = document.getElementById('face-status-text');
  const progress   = document.getElementById('model-progress');

  // ① face-api.js スクリプトが読み込まれているか確認
  setStep('step-faceapi', 'active');
  statusText.textContent = 'face-api.js 確認中…';

  await waitUntil(() => typeof faceapi !== 'undefined', 8000);

  if (typeof faceapi === 'undefined') {
    statusDot.classList.replace('loading', 'error');
    statusText.textContent = 'face-api.js 読み込み失敗';
    setStep('step-faceapi', 'done'); // エラーでも次に進める
    if (progress) progress.classList.add('hidden');
    return;
  }

  setStep('step-faceapi', 'done');
  setProgress(20);

  // ② SSD Mobilenet モデルロード
  setStep('step-ssd', 'active');
  statusText.textContent = '顔検出モデルを読み込み中…';

  faceDetector = new FaceDetector();
  const ready = await faceDetector.init();

  if (ready) {
    setStep('step-ssd', 'done');
    setStep('step-tiny', 'done');
    setProgress(70);
  } else {
    statusDot.classList.replace('loading', 'error');
    statusText.textContent = '顔検出モデル読み込み失敗';
    if (progress) progress.classList.add('hidden');
    return;
  }

  // ③ 絵文字画像プリロード
  setStep('step-emoji', 'active');
  statusText.textContent = '絵文字画像を読み込み中…';

  await AvatarModule.preloadAvatarImages(AppState.preset);

  setStep('step-emoji', 'done');
  setProgress(100);

  // ④ 完了
  statusDot.classList.replace('loading', 'ready');
  statusText.textContent = '準備完了';

  // ゲージをフェードアウト
  setTimeout(() => {
    if (progress) progress.classList.add('hidden');
  }, 1200);

  // 写真が先にアップロードされていたら顔検出を開始
  if (AppState.photos.length > 0) {
    detectFacesForAllPhotos();
  }
}

/** 条件が満たされるまでポーリング（最大 timeoutMs ミリ秒） */
function waitUntil(condition, timeoutMs = 5000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      if (condition() || Date.now() - start >= timeoutMs) {
        resolve();
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  });
}

// 旧 initFaceDetector は startBackgroundLoading に統合されたため削除

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
    const { cell, photo, scaleX, scaleY, offsetX, offsetY } = mapping;
    try {
      const faces = await faceDetector.detectInCell(
        photo.imgEl, cell, scaleX, scaleY, offsetX, offsetY
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
        const rotRow = adjustPanel.querySelector('.adjust-rotation-row');
        if (rotRow) {
          if (mode === 'avatar') rotRow.classList.remove('hidden');
          else rotRow.classList.add('hidden');
        }
        redrawCollage();
      });
      modeBtns.appendChild(btn);
    });

    // 微調整トグル＆パネル
    const adjustToggle = document.createElement('button');
    adjustToggle.className = 'face-adjust-toggle';
    adjustToggle.innerHTML = '⚙️ 微調整 <span class="arrow">▼</span>';

    const adjustPanel = document.createElement('div');
    adjustPanel.className = 'face-adjust-panel hidden';

    // 初期値
    face.override = face.override || { posX: 0, posY: 0, scale: 1.0, rotation: 0 };

    adjustPanel.innerHTML = `
      <div class="face-adjust-row">
        <label>位置X: <span class="val-text" id="val-posx-${idx}">${face.override.posX || 0}px</span></label>
        <input type="range" class="face-slider" min="-150" max="150" value="${face.override.posX || 0}" data-prop="posX" />
      </div>
      <div class="face-adjust-row">
        <label>位置Y: <span class="val-text" id="val-posy-${idx}">${face.override.posY || 0}px</span></label>
        <input type="range" class="face-slider" min="-150" max="150" value="${face.override.posY || 0}" data-prop="posY" />
      </div>
      <div class="face-adjust-row">
        <label>大きさ: <span class="val-text" id="val-scale-${idx}">${Math.round((face.override.scale || 1.0) * 100)}%</span></label>
        <input type="range" class="face-slider" min="30" max="250" value="${Math.round((face.override.scale || 1.0) * 100)}" data-prop="scale" />
      </div>
      <div class="face-adjust-row adjust-rotation-row ${face.mode === 'avatar' ? '' : 'hidden'}">
        <label>角度: <span class="val-text" id="val-rot-${idx}">${face.override.rotation || 0}°</span></label>
        <input type="range" class="face-slider" min="-180" max="180" value="${face.override.rotation || 0}" data-prop="rotation" />
      </div>
      <div class="face-adjust-actions">
        <button type="button" class="face-reset-btn">初期位置に戻す</button>
      </div>
    `;

    adjustToggle.addEventListener('click', () => {
      adjustPanel.classList.toggle('hidden');
      adjustToggle.classList.toggle('open');
    });

    // スライダー連動
    adjustPanel.querySelectorAll('.face-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const prop = e.target.dataset.prop;
        const val = Number(e.target.value);
        if (prop === 'posX') {
          face.override.posX = val;
          adjustPanel.querySelector(`#val-posx-${idx}`).textContent = `${val}px`;
        } else if (prop === 'posY') {
          face.override.posY = val;
          adjustPanel.querySelector(`#val-posy-${idx}`).textContent = `${val}px`;
        } else if (prop === 'scale') {
          face.override.scale = val / 100;
          adjustPanel.querySelector(`#val-scale-${idx}`).textContent = `${val}%`;
        } else if (prop === 'rotation') {
          face.override.rotation = val;
          adjustPanel.querySelector(`#val-rot-${idx}`).textContent = `${val}°`;
        }
        redrawCollage();
      });
    });

    // リセットボタン
    adjustPanel.querySelector('.face-reset-btn').addEventListener('click', () => {
      face.override = { posX: 0, posY: 0, scale: 1.0, rotation: 0 };
      adjustPanel.querySelector(`[data-prop="posX"]`).value = 0;
      adjustPanel.querySelector(`#val-posx-${idx}`).textContent = '0px';
      adjustPanel.querySelector(`[data-prop="posY"]`).value = 0;
      adjustPanel.querySelector(`#val-posy-${idx}`).textContent = '0px';
      adjustPanel.querySelector(`[data-prop="scale"]`).value = 100;
      adjustPanel.querySelector(`#val-scale-${idx}`).textContent = '100%';
      adjustPanel.querySelector(`[data-prop="rotation"]`).value = 0;
      adjustPanel.querySelector(`#val-rot-${idx}`).textContent = '0°';
      redrawCollage();
    });

    controls.appendChild(label);
    controls.appendChild(modeBtns);
    controls.appendChild(adjustToggle);
    controls.appendChild(adjustPanel);

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
