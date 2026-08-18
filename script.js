// ===== FAQ ACCORDION =====
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const answer = item.querySelector('.faq-answer');
  const isActive = item.classList.contains('active');

  // Close any other open FAQ first — only one open at a time, like Google's FAQ pages
  document.querySelectorAll('.faq-item.active').forEach(openItem => {
    if (openItem !== item) {
      openItem.classList.remove('active');
      openItem.querySelector('.faq-answer').style.maxHeight = null;
    }
  });

  if (isActive) {
    item.classList.remove('active');
    answer.style.maxHeight = null;
  } else {
    item.classList.add('active');
    answer.style.maxHeight = answer.scrollHeight + 'px';
  }
}

// Keep open answers correctly sized if the window is resized (text reflow)
window.addEventListener('resize', () => {
  document.querySelectorAll('.faq-item.active .faq-answer').forEach(answer => {
    answer.style.maxHeight = answer.scrollHeight + 'px';
  });
});

// ===== TARGET KB FEATURE =====
function toggleTargetKb() {
  const enabled = document.getElementById('targetKbEnabled').checked;
  const controls = document.getElementById('targetKbControls');
  const qualityRow = document.getElementById('qualitySlider').closest('.control-row');
  controls.style.display = enabled ? 'flex' : 'none';
  qualityRow.style.opacity = enabled ? '0.4' : '1';
  qualityRow.style.pointerEvents = enabled ? 'none' : 'auto';
}

function setTargetKb(kb) {
  document.getElementById('targetKbValue').value = kb;
  document.querySelectorAll('.kb-preset-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.trim() === kb + ' KB' ||
        btn.textContent.trim() === '1 MB' && kb === 1024) {
      btn.classList.add('active');
    }
  });
}

async function compressToTargetSize(file, targetKB, format) {
  const targetBytes = targetKB * 1024;
  const mimeType = format === 'png' ? 'image/png'
    : format === 'webp' ? 'image/webp' : 'image/jpeg';
  const isLossless = format === 'png'; // canvas.toBlob ignores the quality param for PNG

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(url);

      const drawAt = (w, h) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return canvas;
      };

      // Binary-search quality at a given size. Only ever returns a blob
      // that is AT OR UNDER targetBytes — never accepts an overage.
      const searchQualityAtScale = async (w, h) => {
        const canvas = drawAt(w, h);

        if (isLossless) {
          // Quality has no effect on PNG size — nothing to search, just check it fits.
          const blob = await canvasToBlob(canvas, mimeType, 1);
          return blob && blob.size <= targetBytes ? blob : null;
        }

        let low = 0.01, high = 1.0, best = null;
        for (let attempts = 0; attempts < 12; attempts++) {
          const mid = (low + high) / 2;
          const blob = await canvasToBlob(canvas, mimeType, mid);
          if (!blob) break;

          if (blob.size <= targetBytes) {
            best = blob;       // only ever keep results that fit the budget
            low = mid;         // try to push quality higher while still fitting
          } else {
            high = mid;        // over budget, need lower quality
          }
          if (best && (targetBytes - best.size) < targetBytes * 0.02) break; // close enough, still under budget
        }
        return best;
      };

      // 1. Try at full resolution first.
      let best = await searchQualityAtScale(img.width, img.height);

      // 2. If nothing fit under budget at full res, downscale and re-run the
      //    FULL quality search at each scale (not a fixed quality guess).
      if (!best) {
        for (let scale = 0.9; scale > 0.05 && !best; scale -= 0.1) {
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          best = await searchQualityAtScale(w, h);
        }
      }

      if (best) resolve(best);
      else reject(new Error('Could not hit that target size — try a larger target or a smaller source image.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), mimeType, quality);
  });
}

// ===== COMPRESS TAB =====
let compressFiles = [];

function handleCompressDrop(e) {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  loadCompressFiles(files);
}

function handleCompressFiles(fileList) {
  loadCompressFiles(Array.from(fileList));
}

function loadCompressFiles(files) {
  compressFiles = files;
  if (files.length === 0) return;
  document.getElementById('compressControls').style.display = 'flex';
  document.getElementById('qualitySlider').value = 80;
  document.getElementById('qualityValue').textContent = 80;

  const results = document.getElementById('compressResults');
  results.innerHTML = '';
  files.forEach(file => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <img class="result-thumb" src="${URL.createObjectURL(file)}" />
      <div class="result-info">
        <div class="result-name">${file.name}</div>
        <div class="result-sizes">Original: ${formatSize(file.size)}</div>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:0%"></div></div>
      </div>
      <span style="color:#aaa;font-size:0.85rem">Ready</span>
    `;
    results.appendChild(card);
  });
}

async function compressAll() {
  if (compressFiles.length === 0) {
    alert('Please upload at least one image first!');
    return;
  }

  const targetKbEnabled = document.getElementById('targetKbEnabled').checked;
  const targetKbValue = parseInt(document.getElementById('targetKbValue').value);
  const quality = parseInt(document.getElementById('qualitySlider').value) / 100;
  const format = document.getElementById('outputFormat').value;
  const cards = document.querySelectorAll('#compressResults .result-card');

  if (targetKbEnabled && (!targetKbValue || targetKbValue < 1)) {
    alert('Please enter a valid target size in KB!');
    return;
  }

  for (let i = 0; i < compressFiles.length; i++) {
    const file = compressFiles[i];
    const card = cards[i];
    const bar = card.querySelector('.progress-bar');
    const info = card.querySelector('.result-sizes');
    const status = card.querySelector('span');

    status.textContent = targetKbEnabled ? `Targeting ${targetKbValue}KB...` : 'Compressing...';
    bar.style.width = '30%';

    try {
      let blob;

      if (targetKbEnabled) {
        bar.style.width = '60%';
        blob = await compressToTargetSize(file, targetKbValue, format);
      } else {
        blob = await compressImage(file, quality, format);
      }

      bar.style.width = '100%';

      const saving = Math.round((1 - blob.size / file.size) * 100);
      let savingText = saving > 0 ? `↓ ${saving}% smaller` : 'Optimized';
      let savingColor = '#000';

      if (targetKbEnabled) {
        const resultKB = Math.round(blob.size / 1024);
        savingText = `${resultKB}KB achieved`;
        savingColor = resultKB <= targetKbValue ? '#000' : '#888';
      }

      info.innerHTML = `
        Original: ${formatSize(file.size)} →
        Result: ${formatSize(blob.size)}
        <span class="result-saving" style="background:${savingColor}">${savingText}</span>
      `;

      const url = URL.createObjectURL(blob);
      const ext = format === 'jpeg' ? 'jpg' : format;
      const dlName = file.name.replace(/\.[^.]+$/, '') + '_compressed.' + ext;

      status.innerHTML = `
        <a class="result-download" href="${url}" download="${dlName}">Download</a>
      `;
    } catch (err) {
      status.textContent = 'Error - try another image';
      bar.style.background = '#e00';
    }
  }
}

function compressImage(file, quality, format) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const mimeType = format === 'png' ? 'image/png'
        : format === 'webp' ? 'image/webp' : 'image/jpeg';
      canvas.toBlob(blob => {
        if (blob) {
          if (blob.size >= file.size) resolve(file);
          else resolve(blob);
        } else {
          reject(new Error('Compression failed'));
        }
      }, mimeType, quality);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

function clearCompress() {
  compressFiles = [];
  document.getElementById('compressResults').innerHTML = '';
  document.getElementById('compressControls').style.display = 'none';
  document.getElementById('compressInput').value = '';
  document.getElementById('targetKbEnabled').checked = false;
  document.getElementById('targetKbControls').style.display = 'none';
  document.getElementById('targetKbValue').value = '';
  document.querySelectorAll('.kb-preset-btn').forEach(btn => btn.classList.remove('active'));
}

// ===== CONVERT TAB =====
let convertFiles = [];

function handleConvertDrop(e) {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter(f =>
    f.type.startsWith('image/') || isHeic(f) || /\.avif$/i.test(f.name)
  );
  loadConvertFiles(files);
}

function handleConvertFiles(fileList) {
  loadConvertFiles(Array.from(fileList));
}

function loadConvertFiles(files) {
  convertFiles = files;
  if (files.length === 0) return;
  document.getElementById('convertControls').style.display = 'flex';
  const results = document.getElementById('convertResults');
  results.innerHTML = '';
  files.forEach(file => {
    const card = document.createElement('div');
    card.className = 'result-card';

    const heic = isHeic(file);
    // HEIC also can't be shown as a preview image by the browser — same root cause
    const thumbHtml = heic
      ? `<div class="result-thumb result-thumb-placeholder" aria-hidden="true">HEIC</div>`
      : `<img class="result-thumb" src="${URL.createObjectURL(file)}" alt=""/>`;

    const formatLabel = heic
      ? 'HEIC'
      : (file.type ? file.type.split('/')[1].toUpperCase() : file.name.split('.').pop().toUpperCase());

    card.innerHTML = `
      ${thumbHtml}
      <div class="result-info">
        <div class="result-name">${file.name}</div>
        <div class="result-sizes">Format: ${formatLabel}</div>
      </div>
      <span style="color:#aaa;font-size:0.85rem">Ready</span>
    `;
    results.appendChild(card);
  });
}

async function convertAll() {
  if (convertFiles.length === 0) {
    alert('Please upload at least one image first!');
    return;
  }
  const format = document.getElementById('convertFormat').value;
  const cards = document.querySelectorAll('#convertResults .result-card');

  for (let i = 0; i < convertFiles.length; i++) {
    const file = convertFiles[i];
    const card = cards[i];
    const status = card.querySelector('span');

    try {
      let blob;

      if (isHeic(file)) {
        status.textContent = 'Decoding HEIC…';
        blob = await convertHeicToBlob(file, format);
      } else {
        status.textContent = 'Converting...';
        blob = await compressImage(file, 0.92, format);
      }

      const url = URL.createObjectURL(blob);
      const ext = format === 'jpeg' ? 'jpg' : format;
      const dlName = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
      const info = card.querySelector('.result-sizes');
      info.textContent = `Converted to ${ext.toUpperCase()} — ${formatSize(blob.size)}`;
      status.innerHTML = `
        <a class="result-download" href="${url}" download="${dlName}">Download</a>
      `;
    } catch (err) {
      console.error(err);
      status.textContent = 'Error — try a different file';
    }
  }
}

function clearConvert() {
  convertFiles = [];
  document.getElementById('convertResults').innerHTML = '';
  document.getElementById('convertControls').style.display = 'none';
  document.getElementById('convertInput').value = '';
}

// ===== HEIC/HEIF SUPPORT =====
// Chrome, Firefox and Edge cannot decode HEIC/HEIF natively — this is a
// deliberate licensing decision (HEVC patents), not a bug. heic2any runs
// a WASM-based decoder fully in-browser so we can convert HEIC without
// ever uploading the file anywhere.
function isHeic(file) {
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif') ||
         file.type === 'image/heic' || file.type === 'image/heif';
}

async function convertHeicToBlob(file, targetFormat) {
  // heic2any only outputs image/jpeg or image/png directly.
  // For WebP output, decode to PNG first, then re-encode via canvas.
  const heicTarget = targetFormat === 'png' ? 'image/png' : 'image/jpeg';
  const result = await heic2any({ blob: file, toType: heicTarget, quality: 0.92 });
  // Live Photos / multi-image HEIC can return an array — use the first frame
  const blob = Array.isArray(result) ? result[0] : result;

  if (targetFormat === 'webp') {
    return await reencodeBlobAs(blob, 'image/webp', 0.9);
  }
  return blob;
}

function reencodeBlobAs(blob, mimeType, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(result => {
        if (result) resolve(result);
        else reject(new Error('Re-encoding failed'));
      }, mimeType, quality);
    };
    img.onerror = () => reject(new Error('Could not load decoded image'));
    img.src = url;
  });
}

// ===== PRESETS =====
let currentPreset = null;
let presetFiles = [];

const PRESETS = {
  instagram: { label: 'Instagram', quality: 0.85, format: 'jpeg', maxWidth: 1080 },
  government: { label: 'Government', quality: 0.75, format: 'jpeg', maxWidth: 800 },
  university: { label: 'University', quality: 0.80, format: 'jpeg', maxWidth: 600 },
  whatsapp:   { label: 'WhatsApp',   quality: 0.80, format: 'jpeg', maxWidth: 1600 },
  email:      { label: 'Email',      quality: 0.82, format: 'jpeg', maxWidth: 1200 },
  web:        { label: 'Website',    quality: 0.85, format: 'webp', maxWidth: 1920 }
};

function applyPreset(name) {
  currentPreset = name;
  document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  const zone = document.getElementById('presetDropZone');
  zone.style.display = 'block';
  document.getElementById('presetZoneTitle').textContent =
    `Upload images for ${PRESETS[name].label} preset`;
  document.getElementById('presetResults').innerHTML = '';
  presetFiles = [];
  setTimeout(() => {
    zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function handlePresetDrop(e) {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  loadPresetFiles(files);
}

function handlePresetFiles(fileList) {
  loadPresetFiles(Array.from(fileList));
}

function loadPresetFiles(files) {
  presetFiles = files;
  if (!currentPreset || files.length === 0) return;
  const preset = PRESETS[currentPreset];
  const results = document.getElementById('presetResults');
  results.innerHTML = '';

  files.forEach(async (file) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <img class="result-thumb" src="${URL.createObjectURL(file)}" />
      <div class="result-info">
        <div class="result-name">${file.name}</div>
        <div class="result-sizes">Original: ${formatSize(file.size)}</div>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:0%"></div></div>
      </div>
      <span style="color:#aaa;font-size:0.85rem">Processing...</span>
    `;
    results.appendChild(card);

    const bar = card.querySelector('.progress-bar');
    const info = card.querySelector('.result-sizes');
    const status = card.querySelector('span');
    bar.style.width = '50%';

    try {
      const blob = await compressWithPreset(file, preset);
      bar.style.width = '100%';
      const saving = Math.round((1 - blob.size / file.size) * 100);
      info.innerHTML = `
        Original: ${formatSize(file.size)} →
        Result: ${formatSize(blob.size)}
        <span class="result-saving">${saving > 0 ? '↓ ' + saving + '%' : 'Optimized'}</span>
      `;
      const ext = preset.format === 'jpeg' ? 'jpg' : preset.format;
      const url = URL.createObjectURL(blob);
      const dlName = file.name.replace(/\.[^.]+$/, '') + `_${currentPreset}.` + ext;
      status.innerHTML = `
        <a class="result-download" href="${url}" download="${dlName}">Download</a>
      `;
    } catch (err) {
      status.textContent = 'Error';
    }
  });
}

function compressWithPreset(file, preset) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > preset.maxWidth) {
        h = Math.round(h * preset.maxWidth / w);
        w = preset.maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const mime = preset.format === 'webp' ? 'image/webp' : 'image/jpeg';
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Failed'));
      }, mime, preset.quality);
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ===== UTILITIES =====
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ===== PASSPORT SIZE FEATURE (automatic white background + resize) =====
let passportWidth = 35;
let passportHeight = 45;
let passportLabel = 'India 35x45mm';

// Passport size standards in mm — converted to pixels at 300 DPI
// 1mm = 11.811 pixels at 300 DPI
const MM_TO_PX = 11.811;

// Lazily create ONE segmentation instance and reuse it for every photo
let selfieSegmentation = null;
function getSelfieSegmentation() {
  if (!selfieSegmentation) {
    selfieSegmentation = new SelfieSegmentation({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });
    // modelSelection 0 = "general" model — trained for close-up single-person
    // portraits, much sharper for headshots than the "landscape" model (1),
    // which is meant for wide group/landscape shots and is lower detail.
    selfieSegmentation.setOptions({ modelSelection: 0 });
  }
  return selfieSegmentation;
}

// Runs the photo through on-device segmentation and returns a canvas
// with the person cut out and composited onto a solid white background.
// The image never leaves the browser — only the (public, open-source)
// model file is fetched once from the CDN.
function removeBackgroundToWhite(imgEl) {
  return new Promise((resolve, reject) => {
    try {
      const seg = getSelfieSegmentation();
      seg.onResults((results) => {
        const w = results.image.width;
        const h = results.image.height;

        // STEP A — sharpen the mask edges. The raw mask is a soft, semi-
        // transparent gradient at the boundary, which is what lets background
        // color bleed through and create the greenish/gray halo around hair
        // and glasses. Boosting contrast pushes low-confidence pixels toward
        // solid black/white so the cutout edge is much cleaner.
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = w;
        maskCanvas.height = h;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.filter = 'contrast(260%) brightness(105%)';
        maskCtx.drawImage(results.segmentationMask, 0, 0, w, h);
        maskCtx.filter = 'none';

        // STEP B — feather back in ~0.5px of blur so the now-hard edge
        // doesn't look jagged/aliased once sharpened.
        const featherCanvas = document.createElement('canvas');
        featherCanvas.width = w;
        featherCanvas.height = h;
        const featherCtx = featherCanvas.getContext('2d');
        featherCtx.filter = 'blur(0.6px)';
        featherCtx.drawImage(maskCanvas, 0, 0);
        featherCtx.filter = 'none';

        // STEP C — composite the person (using the cleaned-up mask) onto
        // solid white, at full source resolution with high-quality smoothing.
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.save();
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(featherCanvas, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(results.image, 0, 0, w, h);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        resolve(canvas);
      });
      seg.send({ image: imgEl });
    } catch (err) {
      reject(err);
    }
  });
}

function selectPassport(btn, w, h, label) {
  document.querySelectorAll('.passport-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  passportWidth = w;
  passportHeight = h;
  passportLabel = label + ' ' + w + 'x' + h + 'mm';
  document.getElementById('passportLabel').textContent = passportLabel;
}

function handlePassportDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    processPassportPhoto(file);
  }
}

function handlePassportFile(files) {
  if (files[0]) processPassportPhoto(files[0]);
}

async function processPassportPhoto(file) {
  const resultDiv = document.getElementById('passportResult');
  resultDiv.innerHTML = '<div class="passport-processing">Removing background…</div>';

  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = async () => {
    try {
      // STEP 1 — cut the person out and place them on a true white background
      const whiteBgCanvas = await removeBackgroundToWhite(img);
      URL.revokeObjectURL(url);

      resultDiv.innerHTML = '<div class="passport-processing">Resizing to passport size…</div>';

      // STEP 2 — crop + resize to the exact passport standard at 300 DPI
      const targetW = Math.round(passportWidth * MM_TO_PX);
      const targetH = Math.round(passportHeight * MM_TO_PX);

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);

      const srcW = whiteBgCanvas.width;
      const srcH = whiteBgCanvas.height;
      const imgAspect = srcW / srcH;
      const targetAspect = targetW / targetH;

      let sx, sy, sw, sh;
      if (imgAspect > targetAspect) {
        // Source is wider than target — crop the sides evenly
        sh = srcH;
        sw = srcH * targetAspect;
        sx = (srcW - sw) / 2;
        sy = 0;
      } else {
        // Source is taller than target — crop top/bottom
        sw = srcW;
        sh = srcW / targetAspect;
        sx = 0;
        // Bias the crop toward the top third instead of dead-center.
        // Selfies usually have empty space above the head — a plain
        // center crop wastes it and can cut off the chin instead.
        sy = Math.max(0, (srcH - sh) * 0.28);
      }

      ctx.drawImage(whiteBgCanvas, sx, sy, sw, sh, 0, 0, targetW, targetH);

      canvas.toBlob(blob => {
        const resultUrl = URL.createObjectURL(blob);
        const sizeKB = Math.round(blob.size / 1024);
        const fileName = 'passport_' + passportWidth + 'x' + passportHeight + 'mm.jpg';

        resultDiv.innerHTML = `
          <div class="passport-result-card">
            <div class="passport-preview-wrap">
              <img src="${resultUrl}" class="passport-preview" alt="Passport photo"/>
              <div class="passport-dimensions">${passportWidth}mm × ${passportHeight}mm</div>
            </div>
            <div class="passport-result-info">
              <h3>Your Passport Photo is Ready</h3>
              <p>Standard: <strong>${passportLabel}</strong></p>
              <p>Dimensions: <strong>${targetW} × ${targetH} pixels</strong></p>
              <p>Resolution: <strong>300 DPI — Print Quality</strong></p>
              <p>File size: <strong>${sizeKB} KB</strong></p>
              <p>Background: <strong>Pure White (auto-removed)</strong></p>
              <p style="font-size:0.82rem;color:#888;margin-top:0.5rem">Zoom in and check the edges around your hair before submitting — AI background removal is very good but not always perfect on every strand.</p>
              <div class="passport-actions">
                <a class="result-download" href="${resultUrl}" download="${fileName}">Download Photo</a>
                <button class="btn-secondary" onclick="resetPassport()">Convert Another</button>
              </div>
            </div>
          </div>
        `;
      }, 'image/jpeg', 0.95);

    } catch (err) {
      console.error(err);
      resultDiv.innerHTML = '<p style="color:red;text-align:center">Could not process this photo. Please try a clearer, well-lit photo facing the camera.</p>';
    }
  };

  img.onerror = () => {
    resultDiv.innerHTML = '<p style="color:red;text-align:center">Error loading image. Please try another file.</p>';
  };

  img.src = url;
}

function resetPassport() {
  document.getElementById('passportResult').innerHTML = '';
  document.getElementById('passportInput').value = '';
}