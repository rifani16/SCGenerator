/**
 * app.js — Logika aplikasi affiliate generator (JSON version).
 *
 * Alur kerja:
 *   1. Saat halaman siap, load data.json via fetch.
 *   2. Dropdown diisi dari data JSON.
 *   3. User memilih program + memasukkan kode affiliate atau link lengkap.
 *   4. Tombol "Generate & Copy" membangun link penuh, mengganti {LINK} di template,
 *      menampilkan hasilnya di area preview, dan langsung menyalin ke clipboard.
 *   5. Tombol "Copy Narasi" menyalin teks narasi yang sudah di-generate.
 *   6. Tombol "Share ke WhatsApp" membuka WhatsApp Web / deep-link dengan narasi.
 */

// ─── Referensi DOM ───────────────────────────────────────────────────────────
const programSelect      = document.getElementById('programSelect');
const affiliateInput     = document.getElementById('affiliateInput');
const affiliateLinkInput = document.getElementById('affiliateLinkInput');
const konfirmasiInput    = document.getElementById('konfirmasiInput');
const generateBtn        = document.getElementById('generateBtn');
const copyBtn            = document.getElementById('copyBtn');
const shareBtn           = document.getElementById('shareBtn');
const previewSection     = document.getElementById('previewSection');
const previewText        = document.getElementById('previewText');
const linkPreview        = document.getElementById('linkPreview');
const toastEl            = document.getElementById('toast');

const codeInputSection   = document.getElementById('codeInputSection');
const linkInputSection   = document.getElementById('linkInputSection');
const inputModeRadios    = document.querySelectorAll('input[name="inputMode"]');

// Download buttons
const downloadPosterBtn  = document.getElementById('downloadPosterBtn');
const downloadQrisBtn    = document.getElementById('downloadQrisBtn');
const posterProgramName  = document.getElementById('posterProgramName');

// QRIS Modal
const qrisModal          = document.getElementById('qrisModal');
const qrisModalOverlay   = document.getElementById('qrisModalOverlay');
const qrisModalClose     = document.getElementById('qrisModalClose');
const qrisRegionList     = document.getElementById('qrisRegionList');

// ─── State internal ──────────────────────────────────────────────────────────
let currentNarasi = '';   // narasi yang sudah di-generate (siap copy)
let currentLink   = '';   // link affiliate yang sudah di-generate

// Data dari JSON (akan di-load saat init)
let CONFIG = null;    // data.json - config umum
let PROGRAMS = null;  // program.json - data program
let QRIS_DATA = null; // qris.json - data QRIS per daerah

// ─── Inisialisasi ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  populateDropdown();
  bindEvents();
});

/**
 * Load data dari data.json, program.json, dan qris.json.
 */
async function loadData() {
  try {
    const BASE_PATH = window.location.pathname.includes('/PCGenerator/')
    ? '/PCGenerator'
    : '';
    
    const CONFIG_URL = `${BASE_PATH}/json/data.json`;
    const PROGRAM_URL = `${BASE_PATH}/json/program.json`;
    const QRIS_URL = `${BASE_PATH}/json/qris.json`;

    // Load ketiga file JSON secara paralel
    const [configResponse, programsResponse, qrisResponse] = await Promise.all([
      fetch(CONFIG_URL),
      fetch(PROGRAM_URL),
      fetch(QRIS_URL)
    ]);

    CONFIG = await configResponse.json();
    PROGRAMS = await programsResponse.json();
    QRIS_DATA = await qrisResponse.json();

    // Set default value untuk nomor konfirmasi
    if (CONFIG && CONFIG.konfirmasiDefault) {
      konfirmasiInput.value = '';
      konfirmasiInput.placeholder = `Default: ${CONFIG.konfirmasiDefault}`;
    }

    // Populate QRIS region list in modal
    populateQrisRegions();

  } catch (error) {
    console.error('Error loading JSON files:', error);
    showToast('❌ Gagal memuat data. Periksa JSON files');
    generateBtn.disabled = true;
  }
}

/**
 * Isi <select> dari PROGRAMS.
 */
function populateDropdown() {
  if (!PROGRAMS) return;
  
  Object.keys(PROGRAMS).forEach(key => {
    const opt       = document.createElement('option');
    opt.value       = key;
    opt.textContent = PROGRAMS[key].name;
    programSelect.appendChild(opt);
  });
}

/**
 * Populate QRIS region list dalam modal.
 */
function populateQrisRegions() {
  if (!QRIS_DATA) return;
  
  qrisRegionList.innerHTML = '';
  
  Object.keys(QRIS_DATA).forEach(region => {
    const item = document.createElement('div');
    item.className = 'qris-region-item';
    item.innerHTML = `
      <span class="qris-region-name">${region}</span>
      <span class="qris-region-icon">📥</span>
    `;
    item.addEventListener('click', () => downloadQrisFile(region));
    qrisRegionList.appendChild(item);
  });
}

/**
 * Pasangkan semua event listener.
 */
function bindEvents() {
  generateBtn.addEventListener('click', handleGenerate);
  copyBtn.addEventListener('click', handleCopyNarasi);
  shareBtn.addEventListener('click', handleShareWhatsApp);

  // Toggle input mode (kode vs link)
  inputModeRadios.forEach(radio => {
    radio.addEventListener('change', handleInputModeChange);
  });

  // Download buttons
  downloadPosterBtn.addEventListener('click', handleDownloadPoster);
  downloadQrisBtn.addEventListener('click', openQrisModal);

  // QRIS Modal
  qrisModalClose.addEventListener('click', closeQrisModal);
  qrisModalOverlay.addEventListener('click', closeQrisModal);

  // Program selection - update poster button
  programSelect.addEventListener('change', updatePosterButton);

  // Reset preview ketika input berubah
  programSelect.addEventListener('change', resetPreview);
  affiliateInput.addEventListener('input', resetPreview);
  affiliateLinkInput.addEventListener('input', resetPreview);
  konfirmasiInput.addEventListener('input', resetPreview);
}

/**
 * Toggle visibility antara input kode vs input link lengkap.
 */
function handleInputModeChange(e) {
  const mode = e.target.value;
  
  if (mode === 'code') {
    codeInputSection.classList.remove('hidden');
    linkInputSection.classList.add('hidden');
    affiliateLinkInput.value = ''; // clear link input
  } else {
    codeInputSection.classList.add('hidden');
    linkInputSection.classList.remove('hidden');
    affiliateInput.value = ''; // clear code input
  }
  
  resetPreview();
}

// ─── Handler utama ───────────────────────────────────────────────────────────

/**
 * Generate narasi + link, tampilkan di preview, dan salin ke clipboard.
 */
async function handleGenerate() {
  if (!CONFIG || !PROGRAMS) {
    showToast('❌ Data belum dimuat.');
    return;
  }

  const programKey  = programSelect.value;
  const affCode     = affiliateInput.value.trim();
  const affLink     = affiliateLinkInput.value.trim();
  const customKonfirmasi = konfirmasiInput.value.trim();

  // ── Validasi program ──
  if (!programKey) {
    showToast('⚠️ Pilih program donasi dulu.');
    return;
  }

  const program = PROGRAMS[programKey];

  // ── Deteksi mode input (kode vs link) ──
  const inputMode = document.querySelector('input[name="inputMode"]:checked').value;
  
  let finalLink = '';

  if (inputMode === 'code') {
    // Mode: input kode affiliate
    if (!affCode) {
      showToast('⚠️ Masukkan kode affiliate dulu.');
      affiliateInput.focus();
      return;
    }
    
    // Bangun link dari baseUrl + path + ?affiliate_code= + kode
    finalLink = CONFIG.baseUrl + program.path + "?affiliate_code=" + encodeURIComponent(affCode);
    
  } else {
    // Mode: input link lengkap
    if (!affLink) {
      showToast('⚠️ Masukkan link affiliate lengkap dulu.');
      affiliateLinkInput.focus();
      return;
    }

    // Validasi: pastikan link memiliki struktur yang valid
    try {
      const url = new URL(affLink);
      
      // Cek apakah link sudah mengandung affiliate_code parameter
      if (!url.searchParams.has('affiliate_code')) {
        showToast('⚠️ Link harus mengandung parameter ?affiliate_code=');
        return;
      }
      
      finalLink = affLink; // gunakan link yang diinput user
      
    } catch (err) {
      showToast('⚠️ Format link tidak valid. Pastikan URL lengkap.');
      return;
    }
  }

  // ── Tentukan nomor konfirmasi (custom atau default) ──
  const nomorKonfirmasi = customKonfirmasi || CONFIG.konfirmasiDefault;

  // ── Bangun info rekening & konfirmasi ──
  const infoRekening = `

Rekening:
🏦 BSI ${CONFIG.rekening.bsi}
a.n ${CONFIG.rekening.anBsi}
🏦 Mandiri ${CONFIG.rekening.mandiri}
a.n ${CONFIG.rekening.anMandiri}

📞 Konfirmasi: ${nomorKonfirmasi}`;

  // ── Bangun narasi ──
  currentLink   = finalLink;
  currentNarasi = program.text.replace('{LINK}', currentLink) + infoRekening;

  // ── Tampilkan preview ──
  linkPreview.textContent = currentLink;
  previewText.textContent = currentNarasi;
  showPreview();

  // ── Salin ke clipboard ──
  await copyToClipboard(currentNarasi);
  showToast('✅ Narasi berhasil di-generate & disalin!');
}

/**
 * Salin narasi yang sudah ada di state.
 */
async function handleCopyNarasi() {
  if (!currentNarasi) {
    showToast('⚠️ Generate narasi dulu.');
    return;
  }
  await copyToClipboard(currentNarasi);
  showToast('📋 Narasi berhasil disalin ke clipboard!');
}

/**
 * Share ke WhatsApp via deep-link.
 * Pada desktop → buka WhatsApp Web; pada mobile → buka aplikasi WhatsApp.
 */
function handleShareWhatsApp() {
  if (!currentNarasi) {
    showToast('⚠️ Generate narasi dulu.');
    return;
  }

  const encoded = encodeURIComponent(currentNarasi);

  // Deteksi mobile: gunakan wa:// scheme agar langsung buka aplikasi
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const url      = isMobile
    ? `whatsapp://send?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  window.open(url, '_blank');
}

// ─── Download Handlers ───────────────────────────────────────────────────────

/**
 * Update poster button state when program is selected.
 */
function updatePosterButton() {
  const programKey = programSelect.value;
  
  if (programKey && PROGRAMS[programKey]) {
    const program = PROGRAMS[programKey];
    downloadPosterBtn.disabled = false;
    posterProgramName.textContent = program.name;
  } else {
    downloadPosterBtn.disabled = true;
    posterProgramName.textContent = 'Pilih program dulu';
  }
}

/**
 * Download poster untuk program yang dipilih.
 */
function handleDownloadPoster() {
  const programKey = programSelect.value;
  
  if (!programKey || !PROGRAMS[programKey]) {
    showToast('⚠️ Pilih program dulu.');
    return;
  }
  
  const program = PROGRAMS[programKey];
  
  if (!program.posterDriveId) {
    showToast('⚠️ Poster untuk program ini belum tersedia.');
    return;
  }
  
  // Build Google Drive download link
  const driveUrl = `https://drive.google.com/uc?export=download&id=${program.posterDriveId}`;
  
  // Open in new tab
  window.open(driveUrl, '_blank');
  showToast('📥 Membuka download poster...');
}

/**
 * Open QRIS modal.
 */
function openQrisModal() {
  qrisModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Prevent background scroll
}

/**
 * Close QRIS modal.
 */
function closeQrisModal() {
  qrisModal.classList.add('hidden');
  document.body.style.overflow = ''; // Restore scroll
}

/**
 * Download QRIS file untuk daerah tertentu.
 */
function downloadQrisFile(region) {
  if (!QRIS_DATA[region]) {
    showToast('⚠️ Data QRIS tidak ditemukan.');
    return;
  }
  
  const qrisInfo = QRIS_DATA[region];
  
  if (!qrisInfo.driveId) {
    showToast('⚠️ QRIS untuk daerah ini belum tersedia.');
    return;
  }
  
  // Build Google Drive download link
  const driveUrl = `https://drive.google.com/uc?export=download&id=${qrisInfo.driveId}`;
  
  // Open in new tab
  window.open(driveUrl, '_blank');
  showToast(`📥 Membuka download QRIS ${region}...`);
  
  // Close modal
  closeQrisModal();
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Salin teks ke clipboard (fallback untuk browser lama).
 */
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback: textarea trick
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

/**
 * Tampilkan area preview.
 */
function showPreview() {
  previewSection.classList.remove('hidden');
  // Smooth scroll ke preview (mobile-friendly)
  setTimeout(() => {
    previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

/**
 * Reset preview & state saat input berubah.
 */
function resetPreview() {
  currentNarasi = '';
  currentLink   = '';
  previewSection.classList.add('hidden');
}

/**
 * Tampilkan toast notifikasi.
 * @param {string} msg – pesan yang ditampilkan
 */
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}