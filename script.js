// ===== TAB SWITCHING =====
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.textContent.toLowerCase().trim() === tab) b.classList.add('active');
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
  const quality = parseInt(document.getElementById('qualitySlider').value) / 100;
  const format = document.getElementById('outputFormat').value;
  const cards = document.querySelectorAll('#compressResults .result-card');

  for (let i = 0; i < compressFiles.length; i++) {
    const file = compressFiles[i];
    const card = cards[i];
    const bar = card.querySelector('.progress-bar');
    const info = card.querySelector('.result-sizes');
    const status = card.querySelector('span');

    status.textContent = 'Compressing...';
    bar.style.width = '40%';

    try {
      const blob = await compressImage(file, quality, format);
      bar.style.width = '100%';

      const saving = Math.round((1 - blob.size / file.size) * 100);
      const savingText = saving > 0 ? `↓ ${saving}% smaller` : 'Optimized';

      info.innerHTML = `
        Original: ${formatSize(file.size)} → 
        Compressed: ${formatSize(blob.size)}
        <span class="result-saving">${savingText}</span>
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
        if (blob) resolve(blob);
        else reject(new Error('Compression failed'));
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
  zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        <span class="result-saving">${saving > 0 ? '↓ ' + saving + '%' : 'Done'}</span>
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