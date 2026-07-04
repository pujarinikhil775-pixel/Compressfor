// ===== TAB SWITCHING =====
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.textContent.toLowerCase().trim() === tab) b.classList.add('active');
  });
}

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

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      // Binary search for the right quality
      let low = 0.01;
      let high = 1.0;
      let best = null;
      let attempts = 0;

      while (attempts < 20) {
        const mid = (low + high) / 2;
        const blob = await canvasToBlob(canvas, mimeType, mid);

        if (!blob) break;

        if (Math.abs(blob.size - targetBytes) < targetBytes * 0.05) {
          best = blob;
          break;
        }

        if (blob.size > targetBytes) {
          high = mid;
        } else {
          low = mid;
          best = blob;
        }
        attempts++;
      }

      // If still too large, reduce dimensions
      if (!best || best.size > targetBytes * 1.1) {
        let scale = 0.9;
        let w = img.width;
        let h = img.height;

        while (scale > 0.1) {
          const c2 = document.createElement('canvas');
          c2.width = Math.round(w * scale);
          c2.height = Math.round(h * scale);
          const ctx2 = c2.getContext('2d');
          ctx2.fillStyle = '#ffffff';
          ctx2.fillRect(0, 0, c2.width, c2.height);
          ctx2.drawImage(img, 0, 0, c2.width, c2.height);
          const blob2 = await canvasToBlob(c2, mimeType, 0.7);
          if (blob2 && blob2.size <= targetBytes * 1.05) {
            best = blob2;
            break;
          }
          scale -= 0.1;
        }
      }

      if (best) resolve(best);
      else reject(new Error('Could not compress to target size'));
    };
    img.onerror = reject;
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
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
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
    card.innerHTML = `
      <img class="result-thumb" src="${URL.createObjectURL(file)}" />
      <div class="result-info">
        <div class="result-name">${file.name}</div>
        <div class="result-sizes">Format: ${file.type.split('/')[1].toUpperCase()}</div>
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
    status.textContent = 'Converting...';

    try {
      const blob = await compressImage(file, 0.92, format);
      const url = URL.createObjectURL(blob);
      const ext = format === 'jpeg' ? 'jpg' : format;
      const dlName = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
      const info = card.querySelector('.result-sizes');
      info.textContent = `Converted to ${ext.toUpperCase()} — ${formatSize(blob.size)}`;
      status.innerHTML = `
        <a class="result-download" href="${url}" download="${dlName}">Download</a>
      `;
    } catch (err) {
      status.textContent = 'Error';
    }
  }
}

function clearConvert() {
  convertFiles = [];
  document.getElementById('convertResults').innerHTML = '';
  document.getElementById('convertControls').style.display = 'none';
  document.getElementById('convertInput').value = '';
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

// ===== PASSPORT SIZE FEATURE =====
let passportWidth = 35;
let passportHeight = 45;
let passportLabel = 'India 35x45mm';

// Passport size standards in mm — converted to pixels at 300 DPI
// 1mm = 11.811 pixels at 300 DPI
const MM_TO_PX = 11.811;

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

function processPassportPhoto(file) {
  const resultDiv = document.getElementById('passportResult');
  resultDiv.innerHTML = '<div class="passport-processing">Processing your photo...</div>';

  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = () => {
    // Convert mm to pixels at 300 DPI for print quality
    const targetW = Math.round(passportWidth * MM_TO_PX);
    const targetH = Math.round(passportHeight * MM_TO_PX);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);

    // Smart crop — center the image
    const imgAspect = img.width / img.height;
    const targetAspect = targetW / targetH;

    let sx, sy, sw, sh;

    if (imgAspect > targetAspect) {
      // Image is wider — crop sides
      sh = img.height;
      sw = img.height * targetAspect;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      // Image is taller — crop top and bottom
      sw = img.width;
      sh = img.width / targetAspect;
      sx = 0;
      sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
    URL.revokeObjectURL(url);

    // Convert to blob and show result
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
            <p>Dimensions: <strong>${Math.round(passportWidth * MM_TO_PX)} × ${Math.round(passportHeight * MM_TO_PX)} pixels</strong></p>
            <p>Resolution: <strong>300 DPI — Print Quality</strong></p>
            <p>File size: <strong>${sizeKB} KB</strong></p>
            <p>Format: <strong>JPG — White Background</strong></p>
            <div class="passport-actions">
              <a class="result-download" href="${resultUrl}" download="${fileName}">Download Photo</a>
              <button class="btn-secondary" onclick="resetPassport()">Convert Another</button>
            </div>
          </div>
        </div>
      `;
    }, 'image/jpeg', 0.95);
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