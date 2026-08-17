// ==================== Initialization ====================
const socket = io();

let devices = [];
let files = [];
let transfers = [];
let downloads = [];
let currentView = 'home';
let currentLang = localStorage.getItem('lang') || 'ar';
let translations = {};
let serverUrl = '';

// ==================== Translation System ====================
async function loadTranslations() {
  try {
    const response = await fetch(`/api/lang?lang=${currentLang}`);
    translations = await response.json();
    applyTranslations();
  } catch (error) {
    console.error('Failed to load translations:', error);
  }
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const keys = key.split('.');
    let value = translations;
    for (const k of keys) {
      value = value?.[k];
    }
    if (value) {
      element.textContent = value;
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    const keys = key.split('.');
    let value = translations;
    for (const k of keys) {
      value = value?.[k];
    }
    if (value) {
      element.placeholder = value;
    }
  });

  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

function toggleLanguage() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('lang', currentLang);
  document.getElementById('currentLang').textContent = currentLang.toUpperCase();
  loadTranslations();
}

document.getElementById('currentLang').textContent = currentLang.toUpperCase();
document.getElementById('langToggle').addEventListener('click', toggleLanguage);

// ==================== View Navigation ====================
const views = {
  home: document.getElementById('view-home'),
  devices: document.getElementById('view-devices'),
  files: document.getElementById('view-files'),
  transfers: document.getElementById('view-transfers'),
  downloads: document.getElementById('view-downloads')
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(item.dataset.view);
  });
});

function switchView(viewName) {
  currentView = viewName;
  Object.values(views).forEach(v => v.classList.remove('active'));
  if (views[viewName]) {
    views[viewName].classList.add('active');
  }
  
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.view === viewName);
  });
}

// ==================== Copy Manager ====================
const copyManager = {
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
      }
    } catch (error) {
      console.error('Copy failed:', error);
      return false;
    }
  },

  async copyServerUrl() {
    const urlText = document.getElementById('serverUrlText').textContent;
    if (!urlText || urlText === 'Loading...') return;
    
    const success = await this.copyToClipboard(urlText);
    if (success) {
      const btn = document.getElementById('copyServerUrlBtn');
      const textSpan = btn.querySelector('.copy-text');
      const originalText = textSpan.textContent;
      
      btn.classList.add('copied');
      textSpan.textContent = translations.actions?.copied || 'Copied!';
      
      showToast('success', 
        translations.actions?.copied || 'Copied!', 
        urlText
      );
      
      setTimeout(() => {
        btn.classList.remove('copied');
        textSpan.textContent = originalText;
      }, 2000);
    }
  },

  async copyFileLink(filename, originalName, buttonElement) {
    const fileUrl = `${window.location.origin}/files/${filename}`;
    const success = await this.copyToClipboard(fileUrl);
    
    if (success) {
      if (buttonElement) {
        buttonElement.classList.add('copied');
        setTimeout(() => buttonElement.classList.remove('copied'), 2000);
      }
      
      showToast('success',
        translations.files?.linkCopied || 'File link copied!',
        originalName
      );
    }
  },

  async copyDeviceIp(ip, buttonElement) {
    const success = await this.copyToClipboard(ip);
    
    if (success) {
      if (buttonElement) {
        buttonElement.classList.add('copied');
        setTimeout(() => buttonElement.classList.remove('copied'), 2000);
      }
      
      showToast('success',
        translations.actions?.copied || 'Copied!',
        `IP: ${ip}`
      );
    }
  },

  async copyFromPreview(filename) {
    const fileUrl = `${window.location.origin}/files/${filename}`;
    const success = await this.copyToClipboard(fileUrl);
    
    if (success) {
      const btn = document.getElementById('previewCopyBtn');
      if (btn) {
        btn.classList.add('copied');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>${translations.actions?.copied || 'Copied!'}</span>
        `;
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = originalHTML;
        }, 2000);
      }
      
      showToast('success',
        translations.actions?.copied || 'Copied!',
        fileUrl
      );
    }
  }
};

// Copy event listeners
document.getElementById('copyServerUrlBtn').addEventListener('click', () => {
  copyManager.copyServerUrl();
});

document.getElementById('serverUrlBox').addEventListener('click', (e) => {
  if (!e.target.closest('.copy-btn')) {
    copyManager.copyServerUrl();
  }
});

// ==================== Data Loading ====================
document.getElementById('refreshBtn').addEventListener('click', () => {
  loadInfo();
  loadFiles();
});

async function loadInfo() {
  try {
    const response = await fetch('/api/info');
    const data = await response.json();
    
    const ipElement = document.getElementById('myDeviceIP');
    const urlTextElement = document.getElementById('serverUrlText');
    
    if (data.ips && data.ips.length > 0) {
      const primaryIp = data.ips[0];
      serverUrl = `http://${primaryIp}:${data.port}`;
      
      ipElement.textContent = primaryIp;
      if (urlTextElement) {
        urlTextElement.textContent = serverUrl;
      }
    }
    
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    statusDot.classList.add('connected');
    statusText.textContent = translations.status?.connected || 'Connected';
    
  } catch (error) {
    console.error('Failed to load info:', error);
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    statusDot.classList.remove('connected');
    statusText.textContent = translations.status?.disconnected || 'Disconnected';
  }
}

async function loadFiles() {
  try {
    const response = await fetch('/api/files');
    files = await response.json();
    renderFiles();
    document.getElementById('statFiles').textContent = files.length;
  } catch (error) {
    console.error('Failed to load files:', error);
  }
}

// ==================== Devices ====================
function renderDevices() {
  const grid = document.getElementById('devicesGrid');
  const countElement = document.getElementById('deviceCount');
  const statElement = document.getElementById('statDevices');
  
  countElement.textContent = devices.length;
  statElement.textContent = devices.length;
  
  if (devices.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <p>${translations.devices?.noDevices || 'No devices connected yet'}</p>
        <small>${translations.devices?.shareUrl || 'Share the URL with other devices'}</small>
      </div>
    `;
    return;
  }
  
  const typeLabels = {
    android: 'Android',
    ios: 'iOS',
    desktop: 'Desktop',
    unknown: 'Device'
  };
  
  const copyIpText = translations.devices?.copyIp || 'Copy IP';
  
  grid.innerHTML = devices.map(device => {
    const initial = device.name.charAt(0).toUpperCase();
    const typeLabel = typeLabels[device.type] || 'Device';
    const timeAgo = getTimeAgo(device.connectedAt);
    const onlineText = translations.devices?.online || 'Online';
    const escapedIp = device.ip.replace(/'/g, "\\'").replace(/"/g, '\\"');
    
    return `
      <div class="device-card" onclick="sendToDevice('${device.id}')">
        <button class="device-copy-btn" onclick="event.stopPropagation(); copyDeviceIp('${escapedIp}', this)" title="${copyIpText}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <div class="device-card-header">
          <div class="device-card-avatar">${initial}</div>
          <div>
            <div class="device-card-name">${device.name}</div>
            <div class="device-card-status">${onlineText} - ${typeLabel}</div>
          </div>
        </div>
        <div class="device-card-meta">
          <span>${device.ip}</span>
          <span>${timeAgo}</span>
        </div>
      </div>
    `;
  }).join('');
}

function copyDeviceIp(ip, buttonElement) {
  copyManager.copyDeviceIp(ip, buttonElement);
}

// ==================== Files ====================
function getFileType(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const mime = file.mimetype || '';
  
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) {
    return 'audio';
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (['txt', 'js', 'html', 'css', 'json', 'md', 'xml', 'csv', 'log'].includes(ext)) {
    return 'text';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return 'archive';
  }
  return 'default';
}

function getFileIcon(file) {
  const type = getFileType(file);
  const ext = file.name.split('.').pop().toUpperCase();
  return { type, label: ext };
}

function renderFiles() {
  const list = document.getElementById('filesList');
  
  if (files.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <p>${translations.files?.noFiles || 'No files yet'}</p>
      </div>
    `;
    return;
  }
  
  const downloadText = translations.files?.download || 'Download';
  const deleteText = translations.files?.delete || 'Delete';
  const previewText = translations.files?.preview || 'Preview';
  const copyLinkText = translations.files?.copyLink || 'Copy Link';
  
  list.innerHTML = files.map(file => {
    const iconInfo = getFileIcon(file);
    const size = formatSize(file.size);
    const modified = getTimeAgo(new Date(file.modified));
    const escapedName = file.name.replace(/'/g, "\\'").replace(/"/g, '\\"');
    const escapedFilename = file.filename.replace(/'/g, "\\'").replace(/"/g, '\\"');
    
    const canPreview = ['image', 'video', 'audio', 'pdf', 'text'].includes(iconInfo.type);
    
    return `
      <div class="file-item">
        <div class="file-icon ${iconInfo.type}">${iconInfo.label}</div>
        <div class="file-info">
          <div class="file-name">${file.name}</div>
          <div class="file-meta">${size} - ${modified}</div>
        </div>
        <div class="file-actions">
          ${canPreview ? `
            <button class="file-action-btn preview" onclick="previewFile('${escapedFilename}', '${escapedName}')" title="${previewText}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          ` : ''}
          <button class="file-action-btn copy" onclick="copyFileLink('${escapedFilename}', '${escapedName}', this)" title="${copyLinkText}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button class="file-action-btn" onclick="startDownload('${escapedFilename}', '${escapedName}')" title="${downloadText}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button class="file-action-btn danger" onclick="deleteFile('${escapedFilename}')" title="${deleteText}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function copyFileLink(filename, originalName, buttonElement) {
  copyManager.copyFileLink(filename, originalName, buttonElement);
}

// ==================== File Preview ====================
function previewFile(filename, originalName) {
  const file = files.find(f => f.filename === filename);
  if (!file) return;
  
  const modal = document.getElementById('previewModal');
  const body = document.getElementById('previewBody');
  const title = document.getElementById('previewTitle');
  const footer = document.getElementById('previewFooter');
  
  title.textContent = originalName;
  
  const copyLinkText = translations.preview?.copyLink || 'Copy Link';
  const downloadText = translations.preview?.download || 'Download file';
  
  footer.innerHTML = `
    <button class="preview-copy-btn" id="previewCopyBtn" onclick="copyFromPreview('${filename}')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      <span>${copyLinkText}</span>
    </button>
    <button class="btn-primary yellow" id="previewDownloadBtn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>${downloadText}</span>
    </button>
  `;
  
  document.getElementById('previewDownloadBtn').onclick = () => {
    closePreview();
    startDownload(filename, originalName);
  };
  
  const fileType = getFileType(file);
  const fileUrl = `/files/${filename}`;
  
  body.innerHTML = '';
  
  if (fileType === 'image') {
    const img = document.createElement('img');
    img.src = fileUrl;
    img.alt = originalName;
    body.appendChild(img);
  } else if (fileType === 'video') {
    const video = document.createElement('video');
    video.src = fileUrl;
    video.controls = true;
    video.autoplay = true;
    body.appendChild(video);
  } else if (fileType === 'audio') {
    const audio = document.createElement('audio');
    audio.src = fileUrl;
    audio.controls = true;
    audio.autoplay = true;
    body.appendChild(audio);
  } else if (fileType === 'pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = fileUrl;
    body.appendChild(iframe);
  } else if (fileType === 'text') {
    fetch(fileUrl)
      .then(response => response.text())
      .then(text => {
        const pre = document.createElement('pre');
        pre.textContent = text;
        body.appendChild(pre);
      })
      .catch(() => {
        body.innerHTML = `
          <div class="unsupported">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>${translations.preview?.unsupported || 'Cannot preview this file'}</p>
          </div>
        `;
      });
  } else {
    body.innerHTML = `
      <div class="unsupported">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>${translations.preview?.unsupported || 'Cannot preview this file'}</p>
      </div>
    `;
  }
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  const modal = document.getElementById('previewModal');
  const body = document.getElementById('previewBody');
  
  const video = body.querySelector('video');
  const audio = body.querySelector('audio');
  if (video) video.pause();
  if (audio) audio.pause();
  
  modal.style.display = 'none';
  body.innerHTML = '';
  document.body.style.overflow = '';
}

document.getElementById('previewClose').addEventListener('click', closePreview);
document.getElementById('previewOverlay').addEventListener('click', closePreview);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('previewModal');
    if (modal.style.display === 'flex') {
      closePreview();
    }
  }
});

function copyFromPreview(filename) {
  copyManager.copyFromPreview(filename);
}

// ==================== Download Manager ====================
const downloadManager = {
  activeDownloads: new Map(),
  
  async downloadFile(filename, originalName, fileUrl) {
    if (this.activeDownloads.has(filename)) {
      showToast('info', 'Download Active', 'This file is already being downloaded');
      switchView('downloads');
      return;
    }

    const downloadId = Date.now().toString();
    const download = {
      id: downloadId,
      filename: filename,
      originalName: originalName,
      url: fileUrl,
      status: 'downloading',
      progress: 0,
      bytesReceived: 0,
      totalBytes: 0,
      speed: 0,
      startTime: Date.now(),
      addedAt: Date.now()
    };

    this.activeDownloads.set(filename, download);
    downloads.unshift(download);
    renderDownloads();
    updateDownloadBadge();

    try {
      const response = await fetch(fileUrl);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const totalBytes = parseInt(response.headers.get('content-length')) || 0;
      download.totalBytes = totalBytes;

      const reader = response.body.getReader();
      const chunks = [];
      let lastTime = Date.now();
      let lastBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        chunks.push(value);
        download.bytesReceived += value.length;

        if (totalBytes > 0) {
          download.progress = Math.round((download.bytesReceived / totalBytes) * 100);
        }

        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        if (timeDiff >= 0.5) {
          const bytesDiff = download.bytesReceived - lastBytes;
          download.speed = bytesDiff / timeDiff;
          lastTime = now;
          lastBytes = download.bytesReceived;
        }

        renderDownloads();
      }

      const blob = new Blob(chunks);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      download.status = 'completed';
      download.progress = 100;
      this.activeDownloads.delete(filename);
      
      showToast('success', 'Download Complete', originalName);
      renderDownloads();
      updateDownloadBadge();

    } catch (error) {
      console.error('Download error:', error);
      download.status = 'failed';
      this.activeDownloads.delete(filename);
      
      showToast('error', 'Download Failed', originalName);
      renderDownloads();
      updateDownloadBadge();
    }
  },

  cancelDownload(filename) {
    const download = this.activeDownloads.get(filename);
    if (download) {
      download.status = 'failed';
      this.activeDownloads.delete(filename);
      renderDownloads();
      updateDownloadBadge();
    }
  },

  retryDownload(filename) {
    const download = downloads.find(d => d.filename === filename);
    if (download) {
      downloads = downloads.filter(d => d.filename !== filename);
      this.downloadFile(download.filename, download.originalName, download.url);
    }
  },

  removeDownload(filename) {
    downloads = downloads.filter(d => d.filename !== filename);
    renderDownloads();
    updateDownloadBadge();
  },

  clearCompleted() {
    downloads = downloads.filter(d => d.status !== 'completed');
    renderDownloads();
    updateDownloadBadge();
  },

  clearAll() {
    downloads = [];
    renderDownloads();
    updateDownloadBadge();
  }
};

function startDownload(filename, originalName) {
  const fileUrl = `/files/${filename}`;
  downloadManager.downloadFile(filename, originalName, fileUrl);
  switchView('downloads');
}

function renderDownloads() {
  const list = document.getElementById('downloadsList');
  const countElement = document.getElementById('downloadCount');
  const statElement = document.getElementById('statDownloads');
  
  const activeDownloads = downloads.filter(d => d.status === 'downloading').length;
  countElement.textContent = activeDownloads;
  statElement.textContent = downloads.length;
  
  if (downloads.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <p>${translations.downloads?.noDownloads || 'No downloads yet'}</p>
      </div>
    `;
    return;
  }
  
  const downloadingText = translations.downloads?.downloading || 'Downloading...';
  const completedText = translations.downloads?.completed || 'Completed';
  const failedText = translations.downloads?.failed || 'Failed';
  const openFileText = translations.downloads?.openFile || 'Open File';
  const retryText = translations.downloads?.retry || 'Retry';
  const cancelText = translations.downloads?.cancel || 'Cancel';
  const bytesReceivedText = translations.downloads?.bytesReceived || 'Received';
  const ofText = translations.downloads?.of || 'of';
  const speedText = translations.downloads?.speed || 'Speed';
  
  list.innerHTML = downloads.map(download => {
    const statusText = download.status === 'downloading' ? downloadingText :
                       download.status === 'completed' ? completedText :
                       download.status === 'failed' ? failedText : download.status;
    
    const received = formatSize(download.bytesReceived);
    const total = download.totalBytes > 0 ? formatSize(download.totalBytes) : 'Unknown';
    const speed = download.speed > 0 ? formatSize(download.speed) + '/s' : '';
    
    const escapedFilename = download.filename.replace(/'/g, "\\'").replace(/"/g, '\\"');
    const escapedName = download.originalName.replace(/'/g, "\\'").replace(/"/g, '\\"');
    
    return `
      <div class="download-item ${download.status}">
        <div class="download-header">
          <div class="download-icon ${download.status}">
            ${download.status === 'downloading' ? `
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            ` : download.status === 'completed' ? `
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ` : `
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            `}
          </div>
          <div class="download-info">
            <div class="download-name">${download.originalName}</div>
            <div class="download-meta">
              <span class="download-status ${download.status}">${statusText}</span>
              ${download.status === 'downloading' ? `
                <span>${bytesReceivedText}: ${received} ${ofText} ${total}</span>
                ${speed ? `<span>${speedText}: ${speed}</span>` : ''}
              ` : ''}
            </div>
          </div>
        </div>
        ${download.status === 'downloading' || download.status === 'completed' ? `
          <div class="download-progress ${download.status}">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${download.progress}%"></div>
            </div>
            <div class="download-stats">
              <span>${download.progress}%</span>
              ${download.status === 'downloading' && speed ? `<span>${speed}</span>` : ''}
            </div>
          </div>
        ` : ''}
        <div class="download-actions">
          ${download.status === 'downloading' ? `
            <button class="download-action-btn danger" onclick="cancelDownload('${escapedFilename}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              ${cancelText}
            </button>
          ` : ''}
          ${download.status === 'failed' ? `
            <button class="download-action-btn primary" onclick="retryDownload('${escapedFilename}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              ${retryText}
            </button>
          ` : ''}
          ${download.status === 'completed' ? `
            <button class="download-action-btn primary" onclick="openDownloadedFile('${escapedFilename}', '${escapedName}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              ${openFileText}
            </button>
          ` : ''}
          <button class="download-action-btn danger" onclick="removeDownload('${escapedFilename}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function updateDownloadBadge() {
  const countElement = document.getElementById('downloadCount');
  const activeCount = downloads.filter(d => d.status === 'downloading').length;
  countElement.textContent = activeCount;
}

function cancelDownload(filename) {
  downloadManager.cancelDownload(filename);
}

function retryDownload(filename) {
  downloadManager.retryDownload(filename);
}

function removeDownload(filename) {
  downloadManager.removeDownload(filename);
}

function clearCompletedDownloads() {
  downloadManager.clearCompleted();
}

function clearAllDownloads() {
  if (confirm('Are you sure you want to clear all downloads?')) {
    downloadManager.clearAll();
  }
}

function openDownloadedFile(filename, originalName) {
  const fileUrl = `/files/${filename}`;
  window.open(fileUrl, '_blank');
}

// ==================== Toast Notifications ====================
function showToast(type, title, message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  const iconSvg = type === 'success' ? 
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' :
    type === 'error' ?
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' :
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  
  toast.innerHTML = `
    <div class="toast-icon ${type}">
      ${iconSvg}
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== Upload ====================
const uploadBtn = document.getElementById('uploadBtn');
const uploadBtn2 = document.getElementById('uploadBtn2');
const fileInput = document.getElementById('fileInput');

if (uploadBtn) {
  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });
}

if (uploadBtn2) {
  uploadBtn2.addEventListener('click', () => {
    fileInput.click();
  });
}

fileInput.addEventListener('change', async (e) => {
  const fileList = e.target.files;
  if (!fileList || fileList.length === 0) return;
  
  const formData = new FormData();
  for (let i = 0; i < fileList.length; i++) {
    formData.append('files', fileList[i]);
  }
  
  const uploadingText = translations.transfers?.uploading || 'Uploading...';
  showTransferBar(fileList[0].name, uploadingText);
  
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const speed = formatSize(event.loaded) + ' / ' + formatSize(event.total);
        updateTransferBar(percent, speed);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status === 200) {
        hideTransferBar();
        loadFiles();
        fileInput.value = '';
        showToast('success', 'Upload Complete', `${fileList.length} file(s) uploaded`);
      } else {
        alert('Upload failed');
        hideTransferBar();
      }
    };
    
    xhr.onerror = () => {
      alert('Upload failed');
      hideTransferBar();
    };
    
    xhr.send(formData);
  } catch (error) {
    console.error('Upload error:', error);
    alert('Upload failed: ' + error.message);
    hideTransferBar();
  }
});

function showTransferBar(filename, meta) {
  const bar = document.getElementById('transferBar');
  bar.style.display = 'flex';
  document.getElementById('tbFilename').textContent = filename;
  document.getElementById('tbMeta').textContent = meta;
}

function updateTransferBar(percent, meta) {
  document.getElementById('tbProgressFill').style.width = percent + '%';
  document.getElementById('tbPercent').textContent = percent + '%';
  if (meta) {
    document.getElementById('tbMeta').textContent = meta;
  }
}

function hideTransferBar() {
  setTimeout(() => {
    document.getElementById('transferBar').style.display = 'none';
    document.getElementById('tbProgressFill').style.width = '0%';
  }, 1500);
}

document.getElementById('tbCancel').addEventListener('click', () => {
  hideTransferBar();
});

// ==================== Delete File ====================
async function deleteFile(filename) {
  const confirmText = translations.files?.confirmDelete || 'Are you sure you want to delete this file?';
  if (!confirm(confirmText)) return;
  
  try {
    const response = await fetch(`/api/files/${filename}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      loadFiles();
      showToast('success', 'File Deleted', 'File has been deleted successfully');
    } else {
      alert('Failed to delete file');
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('Failed to delete file');
  }
}

// ==================== Search ====================
const searchInput = document.getElementById('searchInput');
const searchSuggestions = document.getElementById('searchSuggestions');

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      searchSuggestions.classList.remove('show');
      return;
    }
    
    const matchedFiles = files.filter(f => 
      f.name.toLowerCase().includes(query)
    ).slice(0, 5);
    
    const matchedDevices = devices.filter(d => 
      d.name.toLowerCase().includes(query)
    ).slice(0, 3);
    
    if (matchedFiles.length === 0 && matchedDevices.length === 0) {
      searchSuggestions.classList.remove('show');
      return;
    }
    
    let html = '';
    
    if (matchedDevices.length > 0) {
      html += matchedDevices.map(d => `
        <div class="suggestion-item" onclick="switchView('devices')">
          <span>Device</span>
          <span>${d.name}</span>
          <small style="margin-right:auto;color:var(--text-muted)">${d.ip}</small>
        </div>
      `).join('');
    }
    
    if (matchedFiles.length > 0) {
      html += matchedFiles.map(f => {
        const escapedName = f.name.replace(/'/g, "\\'").replace(/"/g, '\\"');
        const escapedFilename = f.filename.replace(/'/g, "\\'").replace(/"/g, '\\"');
        return `
          <div class="suggestion-item" onclick="startDownload('${escapedFilename}', '${escapedName}')">
            <span>Download</span>
            <span>${f.name}</span>
            <small style="margin-right:auto;color:var(--text-muted)">${formatSize(f.size)}</small>
          </div>
        `;
      }).join('');
    }
    
    searchSuggestions.innerHTML = html;
    searchSuggestions.classList.add('show');
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchSuggestions.classList.remove('show');
    }
  });
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (searchInput) {
      searchInput.focus();
    }
  }
});

// ==================== Socket Events ====================
socket.on('connect', () => {
  console.log('Connected to server');
  loadInfo();
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  statusDot.classList.remove('connected');
  statusText.textContent = translations.status?.disconnected || 'Disconnected';
});

socket.on('devices:update', (deviceList) => {
  devices = deviceList;
  renderDevices();
});

socket.on('files:uploaded', () => {
  loadFiles();
});

socket.on('file:deleted', () => {
  loadFiles();
});

// ==================== Transfers ====================
function refreshDevices() {
  loadInfo();
  renderDevices();
}

function sendToDevice(deviceId) {
  fileInput.click();
}

function clearCompleted() {
  transfers = transfers.filter(t => t.status === 'active');
  renderTransfers();
}

function renderTransfers() {
  const list = document.getElementById('transfersList');
  const countElement = document.getElementById('transferCount');
  
  countElement.textContent = transfers.filter(t => t.status === 'active').length;
  
  if (transfers.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p>${translations.transfers?.noTransfers || 'No active transfers'}</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = transfers.map(transfer => `
    <div class="transfer-item">
      <div class="transfer-header">
        <div class="transfer-icon ${transfer.type}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${transfer.type === 'upload' 
              ? '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'
              : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
            }
          </svg>
        </div>
        <div class="transfer-info">
          <div class="transfer-name">${transfer.filename}</div>
          <div class="transfer-peer">${transfer.from ? transfer.from.name : 'Unknown'}</div>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${transfer.progress}%"></div>
      </div>
      <div class="progress-stats">
        <span>${transfer.progress}%</span>
        <span>${transfer.status}</span>
      </div>
    </div>
  `).join('');
}

// ==================== Utility Functions ====================
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getTimeAgo(date) {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now - then) / 1000);
  
  if (seconds < 60) return currentLang === 'ar' ? 'الآن' : 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + (currentLang === 'ar' ? 'د' : 'm');
  if (seconds < 86400) return Math.floor(seconds / 3600) + (currentLang === 'ar' ? 'س' : 'h');
  return Math.floor(seconds / 86400) + (currentLang === 'ar' ? 'ي' : 'd');
}

setInterval(() => {
  const speed = (Math.random() * 50 + 10).toFixed(1);
  document.getElementById('statSpeed').textContent = speed + ' MB/s';
}, 2000);

// ==================== Initialization ====================
window.addEventListener('load', () => {
  loadTranslations().then(() => {
    loadInfo();
    loadFiles();
    renderDownloads();
    
    const avatarElement = document.getElementById('myAvatar');
    const nameElement = document.getElementById('myDeviceName');
    const randomInitial = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    if (avatarElement) {
      avatarElement.textContent = randomInitial;
    }
    if (nameElement) {
      nameElement.textContent = currentLang === 'ar' ? 'جهازي' : 'My Device';
    }
  });
  
  if (window.electronAPI) {
    console.log('Electron API available');
    window.electronAPI.onFolderOpened((folderPath) => {
      console.log('Folder opened:', folderPath);
    });
  } else {
    console.log('Running in browser mode');
  }
});

// ==================== Global Functions ====================
window.switchView = switchView;
window.refreshDevices = refreshDevices;
window.sendToDevice = sendToDevice;
window.clearCompleted = clearCompleted;
window.deleteFile = deleteFile;
window.previewFile = previewFile;
window.startDownload = startDownload;
window.cancelDownload = cancelDownload;
window.retryDownload = retryDownload;
window.removeDownload = removeDownload;
window.clearCompletedDownloads = clearCompletedDownloads;
window.clearAllDownloads = clearAllDownloads;
window.openDownloadedFile = openDownloadedFile;
window.copyFileLink = copyFileLink;
window.copyDeviceIp = copyDeviceIp;
window.copyFromPreview = copyFromPreview;