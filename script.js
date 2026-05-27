// ==================== API CONFIGURATION ====================
const CONFIG = {
    YOUTUBE_API_KEY_1: 'AIzaSyAva9_b8SVbR50TxOTr5YlwN5ZR_HQ8FWE',
    YOUTUBE_API_KEY_2: 'AIzaSyA3F3NvDCKg7z2m_4gxy3j5Dn77kC0njL4',
    GOOGLE_CX_ID: '691721915918',
    GOOGLE_API_KEY: 'AIzaSyAva9_b8SVbR50TxOTr5YlwN5ZR_HQ8FWE',
    DATA_URL: 'data/songs.json'
};

// ==================== GLOBAL VARIABLES ====================
let allSongs = [];
let currentGenre = 'all';
let searchTimeout = null;
let currentAudio = null;
let currentAudioPlaying = false;
const youtubeKeys = [CONFIG.YOUTUBE_API_KEY_1, CONFIG.YOUTUBE_API_KEY_2];

// ==================== INITIALIZE ====================
async function init() {
    await loadLocalSongs();
    setupEventListeners();
    setupInstantSearch();
    addStyles();
    checkPremiumStatus();
    console.log('✅ Website imeanza kufanya kazi!');
    console.log('📊 Idadi ya nyimbo:', allSongs.length);
}

// ==================== LOAD SONGS FROM JSON ====================
async function loadLocalSongs() {
    try {
        // First try to load from admin songs.json (main source)
        const response = await fetch('data/songs.json?v=' + Date.now());
        const data = await response.json();
        allSongs = data.songs || [];
        displaySongs(allSongs);
        displayVideos();
    } catch (error) {
        console.error('Error loading songs from data/songs.json:', error);
        
        // Try to load from admin/songs.json as fallback
        try {
            const adminResponse = await fetch('admin/songs.json?v=' + Date.now());
            const adminData = await adminResponse.json();
            allSongs = adminData.songs || [];
            displaySongs(allSongs);
            displayVideos();
        } catch (e) {
            console.error('Error loading from admin/songs.json:', e);
            
            // Final fallback - sample songs
            allSongs = getSampleSongs();
            displaySongs(allSongs);
            displayVideos();
        }
    }
}

function getSampleSongs() {
    return [
        { id: 1, title: "Nipe Nikupe", artist: "Diamond Platnumz", genre: "Bongo Fleva", mp3_url: "#", mp4_url: "#", duration: "3:45", plays: "1.2M" },
        { id: 2, title: "Samia", artist: "Ali Kiba", genre: "Bongo Fleva", mp3_url: "#", mp4_url: "#", duration: "3:55", plays: "2.1M" },
        { id: 3, title: "Yesu Anaweza", artist: "Angel Benard", genre: "Gospel", mp3_url: "#", mp4_url: "#", duration: "4:20", plays: "850K" }
    ];
}

// ==================== INSTANT SEARCH ====================
function setupInstantSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        
        if (searchTimeout) clearTimeout(searchTimeout);
        
        if (term.length === 0) {
            displaySongs(allSongs);
            displayVideos();
            return;
        }
        
        if (term.length >= 2) {
            document.getElementById('songsGrid').innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i> Kutafuta "${escapeHtml(term)}"...
                </div>
            `;
            
            searchTimeout = setTimeout(() => {
                searchAllSources(term);
            }, 500);
        }
    });
}

// ==================== SEARCH ALL SOURCES ====================
async function searchAllSources(query) {
    const localResults = searchLocalSongs(query);
    const youtubeResults = await searchYouTube(query);
    const googleResults = await searchGoogle(query);
    
    displayCombinedResults(localResults, youtubeResults, googleResults, query);
}

function searchLocalSongs(query) {
    const lowerQuery = query.toLowerCase();
    return allSongs.filter(song => 
        song.title.toLowerCase().includes(lowerQuery) ||
        song.artist.toLowerCase().includes(lowerQuery) ||
        (song.genre && song.genre.toLowerCase().includes(lowerQuery))
    );
}

// ==================== YOUTUBE SEARCH ====================
async function searchYouTube(query) {
    for (let i = 0; i < youtubeKeys.length; i++) {
        const apiKey = youtubeKeys[i];
        if (!apiKey) continue;
        
        try {
            const searchQuery = `${query} official music video song`;
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(searchQuery)}&type=video&key=${apiKey}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.error) {
                console.warn(`YouTube API key ${i+1} error:`, data.error.message);
                continue;
            }
            
            if (data.items && data.items.length > 0) {
                const videoIds = data.items.map(item => item.id.videoId).join(',');
                const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds}&key=${apiKey}`;
                const detailsResponse = await fetch(detailsUrl);
                const detailsData = await detailsResponse.json();
                
                const videoDetails = {};
                if (detailsData.items) {
                    detailsData.items.forEach(item => {
                        videoDetails[item.id] = {
                            views: item.statistics.viewCount,
                            duration: item.contentDetails.duration
                        };
                    });
                }
                
                return data.items.map(item => ({
                    id: 'yt_' + item.id.videoId,
                    title: item.snippet.title,
                    artist: item.snippet.channelTitle,
                    genre: 'YouTube',
                    videoId: item.id.videoId,
                    duration: formatYouTubeDuration(videoDetails[item.id.videoId]?.duration || 'PT3M45S'),
                    plays: formatNumber(parseInt(videoDetails[item.id.videoId]?.views) || 0),
                    cover: item.snippet.thumbnails.medium.url,
                    source: 'YouTube'
                }));
            }
        } catch (error) {
            console.error(`YouTube API key ${i+1} error:`, error);
        }
    }
    return [];
}

// ==================== GOOGLE CUSTOM SEARCH ====================
async function searchGoogle(query) {
    if (!CONFIG.GOOGLE_API_KEY || !CONFIG.GOOGLE_CX_ID) {
        return [];
    }
    
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${CONFIG.GOOGLE_API_KEY}&cx=${CONFIG.GOOGLE_CX_ID}&q=${encodeURIComponent(query + ' mp3 song')}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) return [];
        
        if (data.items && data.items.length > 0) {
            return data.items.slice(0, 6).map((item, index) => ({
                id: 'google_' + Date.now() + index,
                title: item.title.length > 60 ? item.title.substring(0, 60) + '...' : item.title,
                artist: item.displayLink || 'External',
                genre: 'Mtandao',
                externalUrl: item.link,
                snippet: item.snippet,
                cover: item.pagemap?.cse_thumbnail?.[0]?.src || null,
                source: 'Google'
            }));
        }
    } catch (error) {
        console.error('Google search error:', error);
    }
    return [];
}

// ==================== DISPLAY RESULTS (VERTICAL LAYOUT) ====================
function displayCombinedResults(localResults, youtubeResults, googleResults, query) {
    const grid = document.getElementById('songsGrid');
    const totalResults = localResults.length + youtubeResults.length + googleResults.length;
    
    if (totalResults === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>Hakuna matokeo ya "${escapeHtml(query)}"</h3>
                <p>Jaribu maneno mengine:</p>
                <div class="suggestions">
                    <button onclick="searchAlternate('bongo fleva 2024')">Bongo Fleva</button>
                    <button onclick="searchAlternate('gospel tanzania')">Gospel</button>
                    <button onclick="searchAlternate('diamond platnumz')">Diamond</button>
                    <button onclick="searchAlternate('ali kiba')">Ali Kiba</button>
                </div>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    if (localResults.length > 0) {
        html += `
            <div class="search-section">
                <h3><i class="fas fa-music"></i> 🎵 Nyimbo zetu (${localResults.length})</h3>
                <div class="vertical-list">
                    ${localResults.map(s => createLocalSongCard(s)).join('')}
                </div>
            </div>
        `;
    }
    
    if (youtubeResults.length > 0) {
        html += `
            <div class="search-section">
                <h3><i class="fab fa-youtube"></i> 📺 Video za Nyimbo - YouTube (${youtubeResults.length})</h3>
                <div class="vertical-list">
                    ${youtubeResults.map(s => createYouTubeCard(s)).join('')}
                </div>
            </div>
        `;
    }
    
    if (googleResults.length > 0) {
        html += `
            <div class="search-section">
                <h3><i class="fab fa-google"></i> 🌐 Matokeo kutoka Mtandao (${googleResults.length})</h3>
                <div class="vertical-list">
                    ${googleResults.map(s => createGoogleCard(s)).join('')}
                </div>
            </div>
        `;
    }
    
    grid.innerHTML = html;
}

// ==================== CREATE LOCAL SONG CARD ====================
function createLocalSongCard(song) {
    const isPremium = localStorage.getItem('isPremium') === 'true';
    const downloadsToday = getDownloadsToday();
    const canDownload = isPremium || downloadsToday < 5;
    
    // Check if it's a YouTube song
    const isYouTube = song.source === 'YouTube' || song.isYouTube;
    const mp4Url = isYouTube ? song.mp4_url : (song.mp4_url || '#');
    const mp3Url = song.mp3_url || '#';
    
    return `
        <div class="song-item-vertical">
            <div class="song-cover-vertical">
                ${song.cover ? `<img src="${song.cover}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fas fa-music"></i>'}
                <button class="play-btn-vertical" onclick="previewAudio('${song.mp3_url || song.mp4_url || '#'}', '${escapeHtml(song.title)}', '${escapeHtml(song.artist)}')">
                    <i class="fas fa-play"></i>
                </button>
                ${isYouTube ? '<div class="youtube-badge-vertical">YouTube</div>' : ''}
            </div>
            <div class="song-info-vertical">
                <div class="song-title-vertical">${escapeHtml(song.title)}</div>
                <div class="song-artist-vertical"><i class="fas fa-user"></i> ${escapeHtml(song.artist)}</div>
                <div class="song-genre-vertical">${escapeHtml(song.genre)}</div>
                <div class="song-duration-vertical"><i class="far fa-clock"></i> ${song.duration || '3:45'} | <i class="fas fa-headphones"></i> ${song.plays || '0'}</div>
            </div>
            <div class="song-actions-vertical">
                ${!isYouTube && mp3Url !== '#' ? `<button class="btn-download-vertical mp3" onclick="downloadMP3('${mp3Url}', '${escapeHtml(song.title)}')" ${!canDownload ? 'disabled' : ''}><i class="fas fa-download"></i> PAKUA MP3</button>` : ''}
                ${!isYouTube && mp4Url !== '#' ? `<button class="btn-download-vertical mp4" onclick="downloadMP4('${mp4Url}', '${escapeHtml(song.title)}')" ${!canDownload ? 'disabled' : ''}><i class="fas fa-download"></i> PAKUA MP4</button>` : ''}
                ${isYouTube ? `<button class="btn-youtube-vertical" onclick="openYouTubeInNewTab('${song.videoId}')"><i class="fab fa-youtube"></i> TAZAMA YouTube</button>` : ''}
                <button class="btn-listen-vertical" onclick="previewAudio('${song.mp3_url || song.mp4_url || '#'}', '${escapeHtml(song.title)}', '${escapeHtml(song.artist)}')"><i class="fas fa-headphones"></i> SIKILIZA</button>
            </div>
        </div>
    `;
}

// ==================== CREATE YOUTUBE CARD ====================
function createYouTubeCard(song) {
    return `
        <div class="song-item-vertical youtube-item">
            <div class="song-cover-vertical youtube-cover">
                ${song.cover ? `<img src="${song.cover}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fab fa-youtube"></i>'}
                <div class="youtube-badge-vertical">YouTube</div>
            </div>
            <div class="song-info-vertical">
                <div class="song-title-vertical">${escapeHtml(song.title.substring(0, 60))}${song.title.length > 60 ? '...' : ''}</div>
                <div class="song-artist-vertical"><i class="fab fa-youtube"></i> ${escapeHtml(song.artist)}</div>
                <div class="song-duration-vertical"><i class="fas fa-eye"></i> ${song.plays} views | ${song.duration}</div>
            </div>
            <div class="song-actions-vertical">
                <button class="btn-youtube-vertical" onclick="openYouTubeInNewTab('${song.videoId}')"><i class="fab fa-youtube"></i> TAZAMA YouTube</button>
            </div>
        </div>
    `;
}

// ==================== CREATE GOOGLE CARD ====================
function createGoogleCard(song) {
    return `
        <div class="song-item-vertical google-item">
            <div class="song-cover-vertical google-cover">
                ${song.cover ? `<img src="${song.cover}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fab fa-google"></i>'}
            </div>
            <div class="song-info-vertical">
                <div class="song-title-vertical">${escapeHtml(song.title)}</div>
                <div class="song-artist-vertical"><i class="fas fa-link"></i> ${escapeHtml(song.artist)}</div>
                ${song.snippet ? `<div class="song-snippet-vertical">${escapeHtml(song.snippet.substring(0, 100))}...</div>` : ''}
            </div>
            <div class="song-actions-vertical">
                <button class="btn-google-vertical" onclick="window.open('${song.externalUrl}', '_blank')"><i class="fas fa-external-link-alt"></i> FUNGUA TOVUTI</button>
            </div>
        </div>
    `;
}

// ==================== DISPLAY LOCAL SONGS & VIDEOS ====================
function displaySongs(songs) {
    const grid = document.getElementById('songsGrid');
    if (!grid) return;
    
    if (!songs || songs.length === 0) {
        grid.innerHTML = `<div class="no-results"><i class="fas fa-music"></i><p>Hakuna nyimbo zilizopo kwa sasa.</p></div>`;
        return;
    }
    
    const isPremium = localStorage.getItem('isPremium') === 'true';
    const downloadsToday = getDownloadsToday();
    const canDownload = isPremium || downloadsToday < 5;
    
    grid.innerHTML = `
        <div class="vertical-list">
            ${songs.map(song => {
                const isYouTube = song.source === 'YouTube' || song.isYouTube;
                const mp4Url = isYouTube ? song.mp4_url : (song.mp4_url || '#');
                const mp3Url = song.mp3_url || '#';
                
                return `
                    <div class="song-item-vertical">
                        <div class="song-cover-vertical">
                            ${song.cover ? `<img src="${song.cover}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fas fa-music"></i>'}
                            <button class="play-btn-vertical" onclick="previewAudio('${mp3Url !== '#' ? mp3Url : (mp4Url !== '#' ? mp4Url : '#')}', '${escapeHtml(song.title)}', '${escapeHtml(song.artist)}')">
                                <i class="fas fa-play"></i>
                            </button>
                            ${isYouTube ? '<div class="youtube-badge-vertical">YouTube</div>' : ''}
                        </div>
                        <div class="song-info-vertical">
                            <div class="song-title-vertical">${escapeHtml(song.title)}</div>
                            <div class="song-artist-vertical"><i class="fas fa-user"></i> ${escapeHtml(song.artist)}</div>
                            <div class="song-genre-vertical">${escapeHtml(song.genre)}</div>
                            <div class="song-duration-vertical"><i class="far fa-clock"></i> ${song.duration || '3:45'} | <i class="fas fa-headphones"></i> ${song.plays || '0'}</div>
                        </div>
                        <div class="song-actions-vertical">
                            ${!isYouTube && mp3Url !== '#' ? `<button class="btn-download-vertical mp3" onclick="downloadMP3('${mp3Url}', '${escapeHtml(song.title)}')" ${!canDownload ? 'disabled' : ''}><i class="fas fa-download"></i> PAKUA MP3</button>` : ''}
                            ${!isYouTube && mp4Url !== '#' ? `<button class="btn-download-vertical mp4" onclick="downloadMP4('${mp4Url}', '${escapeHtml(song.title)}')" ${!canDownload ? 'disabled' : ''}><i class="fas fa-download"></i> PAKUA MP4</button>` : ''}
                            ${isYouTube ? `<button class="btn-youtube-vertical" onclick="openYouTubeInNewTab('${song.videoId}')"><i class="fab fa-youtube"></i> TAZAMA YouTube</button>` : ''}
                            <button class="btn-listen-vertical" onclick="previewAudio('${mp3Url !== '#' ? mp3Url : (mp4Url !== '#' ? mp4Url : '#')}', '${escapeHtml(song.title)}', '${escapeHtml(song.artist)}')"><i class="fas fa-headphones"></i> SIKILIZA</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function displayVideos() {
    const grid = document.getElementById('videosGrid');
    if (!grid) return;
    
    // Filter songs that have MP4 URLs and are not YouTube links
    const videos = allSongs.filter(s => s.mp4_url && s.mp4_url !== '#' && !s.isYouTube && !s.source === 'YouTube');
    if (videos.length === 0) {
        grid.innerHTML = '<p style="text-align: center; padding: 20px;">Hakuna video zilizopo kwa sasa.</p>';
        return;
    }
    
    grid.innerHTML = `
        <div class="vertical-list">
            ${videos.slice(0, 6).map(video => `
                <div class="song-item-vertical video-item">
                    <div class="song-cover-vertical video-cover">
                        <i class="fas fa-video"></i>
                        <span class="video-duration-badge">${video.duration || '3:45'}</span>
                    </div>
                    <div class="song-info-vertical">
                        <div class="song-title-vertical">${escapeHtml(video.title)}</div>
                        <div class="song-artist-vertical"><i class="fas fa-user"></i> ${escapeHtml(video.artist)}</div>
                    </div>
                    <div class="song-actions-vertical">
                        <button class="btn-download-vertical mp4" onclick="downloadMP4('${video.mp4_url}', '${escapeHtml(video.title)}')"><i class="fas fa-download"></i> PAKUA VIDEO</button>
                        <button class="btn-listen-vertical" onclick="previewAudio('${video.mp4_url}', '${escapeHtml(video.title)}', '${escapeHtml(video.artist)}')"><i class="fas fa-play"></i> TAZAMA</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ==================== OPEN YOUTUBE IN NEW TAB ====================
function openYouTubeInNewTab(videoId) {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
    showToast('✅ Video imefunguliwa kwenye tabo mpya!', 'success');
}

// ==================== AUDIO PREVIEW ====================
function previewAudio(audioUrl, title, artist) {
    if (!audioUrl || audioUrl === '#') {
        showToast('Sampuli ya sauti haipatikani kwa wimbo huu', 'error');
        return;
    }
    
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
        currentAudioPlaying = false;
    }
    
    currentAudio = new Audio(audioUrl);
    currentAudio.play().then(() => {
        currentAudioPlaying = true;
        showToast(`🎧 Inacheza: ${title} - ${artist}`, 'info');
    }).catch(e => {
        showToast('Bonyeza tena kusikiliza', 'info');
    });
    
    currentAudio.onended = () => {
        currentAudio = null;
        currentAudioPlaying = false;
    };
}

// ==================== DOWNLOAD FUNCTIONS ====================
function downloadMP3(url, title) {
    if (!url || url === '#') {
        showToast('❌ Faili ya MP3 haipatikani kwa wimbo huu', 'error');
        return;
    }
    
    const isPremium = localStorage.getItem('isPremium') === 'true';
    const downloadsToday = getDownloadsToday();
    
    if (!isPremium && downloadsToday >= 5) {
        showToast('⚠️ Umefikia kikomo cha nyimbo 5 kwa siku. Jisajili premium kupakua bila kikomo!', 'error');
        document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\s+/g, '-')}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    trackDownload(title, 'MP3');
    incrementDailyDownloads();
    showToast(`✅ ${title} - MP3 inapakua!`, 'success');
}

function downloadMP4(url, title) {
    if (!url || url === '#') {
        showToast('❌ Faili ya MP4 haipatikani kwa wimbo huu', 'error');
        return;
    }
    
    const isPremium = localStorage.getItem('isPremium') === 'true';
    const downloadsToday = getDownloadsToday();
    
    if (!isPremium && downloadsToday >= 5) {
        showToast('⚠️ Umefikia kikomo cha video 5 kwa siku. Jisajili premium kupakua bila kikomo!', 'error');
        document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\s+/g, '-')}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    trackDownload(title, 'MP4');
    incrementDailyDownloads();
    showToast(`✅ ${title} - MP4 inapakua!`, 'success');
}

function trackDownload(songTitle, format) {
    const download = {
        id: Date.now(),
        song: songTitle,
        format: format,
        user: localStorage.getItem('username') || 'Mtumiaji',
        date: new Date().toISOString()
    };
    let downloads = JSON.parse(localStorage.getItem('downloadHistory')) || [];
    downloads.unshift(download);
    if (downloads.length > 100) downloads.pop();
    localStorage.setItem('downloadHistory', JSON.stringify(downloads));
}

function getDownloadsToday() {
    const today = new Date().toDateString();
    const downloads = localStorage.getItem('downloadsToday');
    const lastDate = localStorage.getItem('lastDownloadDate');
    if (lastDate !== today) return 0;
    return downloads ? parseInt(downloads) : 0;
}

function incrementDailyDownloads() {
    const today = new Date().toDateString();
    const currentCount = getDownloadsToday();
    localStorage.setItem('downloadsToday', currentCount + 1);
    localStorage.setItem('lastDownloadDate', today);
}

// ==================== SEARCH FUNCTIONS ====================
function searchSongs() {
    const term = document.getElementById('searchInput').value.trim();
    if (term.length >= 2) {
        searchAllSources(term);
    } else if (term.length === 0) {
        displaySongs(allSongs);
        displayVideos();
    }
}

function searchAlternate(term) {
    document.getElementById('searchInput').value = term;
    searchAllSources(term);
}

function setupGenreFilters() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentGenre = btn.dataset.genre;
            
            if (currentGenre === 'all') {
                displaySongs(allSongs);
            } else {
                const filtered = allSongs.filter(s => s.genre === currentGenre);
                displaySongs(filtered);
            }
        });
    });
}

// ==================== PAYMENT ====================
function initiatePayment(amount) {
    const modal = document.getElementById('paymentModal');
    if (!modal) return;
    document.getElementById('packageAmount').textContent = `TSh ${amount.toLocaleString()}`;
    modal.style.display = 'flex';
}

function setupPaymentModal() {
    const modal = document.getElementById('paymentModal');
    const closeBtn = document.querySelector('.close-modal');
    const confirmBtn = document.getElementById('confirmPaymentBtn');
    
    if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            const phone = document.getElementById('phoneNumber')?.value;
            if (!phone || phone.length < 9) {
                document.getElementById('paymentStatus').innerHTML = '<p style="color:red;">Weka namba halali ya M-Pesa</p>';
                return;
            }
            
            document.getElementById('paymentStatus').innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Inachakata malipo...</p>';
            
            setTimeout(() => {
                localStorage.setItem('isPremium', 'true');
                localStorage.setItem('premiumExpiry', Date.now() + 30*24*60*60*1000);
                document.getElementById('paymentStatus').innerHTML = '<p style="color:green;">✅ Malipo yamekamilika!</p>';
                setTimeout(() => {
                    modal.style.display = 'none';
                    showToast('Hongera! Sasa unaweza kupakua bila kikomo!', 'success');
                    location.reload();
                }, 2000);
            }, 2000);
        };
    }
}

function checkPremiumStatus() {
    const premiumExpiry = localStorage.getItem('premiumExpiry');
    if (premiumExpiry && Date.now() > parseInt(premiumExpiry)) {
        localStorage.removeItem('isPremium');
        localStorage.removeItem('premiumExpiry');
    }
}

// ==================== UTILITY FUNCTIONS ====================
function setupEventListeners() {
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    
    if (searchBtn) searchBtn.onclick = searchSongs;
    if (searchInput) searchInput.onkeypress = (e) => { if (e.key === 'Enter') searchSongs(); };
    
    setupGenreFilters();
    setupPaymentModal();
    setupMobileMenu();
}

function setupMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    if (menuBtn && navLinks) {
        menuBtn.onclick = () => {
            if (navLinks.style.display === 'flex') {
                navLinks.style.display = 'none';
            } else {
                navLinks.style.display = 'flex';
                navLinks.style.flexDirection = 'column';
                navLinks.style.position = 'absolute';
                navLinks.style.top = '70px';
                navLinks.style.left = '0';
                navLinks.style.right = '0';
                navLinks.style.backgroundColor = 'white';
                navLinks.style.padding = '1rem';
                navLinks.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            }
        };
    }
}

function showToast(message, type = 'success') {
    let toast = document.querySelector('.toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast-notification ${type === 'error' ? 'error' : type === 'info' ? 'info' : 'success'}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatYouTubeDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== STYLES ====================
function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .vertical-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        
        .song-item-vertical {
            display: flex;
            align-items: center;
            background: white;
            border-radius: 12px;
            padding: 15px;
            gap: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            transition: transform 0.2s, box-shadow 0.2s;
            flex-wrap: wrap;
        }
        
        .song-item-vertical:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        }
        
        .song-cover-vertical {
            width: 70px;
            height: 70px;
            background: linear-gradient(135deg, #1B5E20, #2E7D32);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            flex-shrink: 0;
            overflow: hidden;
        }
        
        .song-cover-vertical img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .song-cover-vertical i {
            font-size: 2rem;
            color: white;
            opacity: 0.8;
        }
        
        .play-btn-vertical {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.7);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s;
            color: white;
        }
        
        .song-item-vertical:hover .play-btn-vertical {
            opacity: 1;
        }
        
        .song-info-vertical {
            flex: 2;
            min-width: 180px;
        }
        
        .song-title-vertical {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }
        
        .song-artist-vertical {
            font-size: 13px;
            color: #777;
            margin-bottom: 5px;
        }
        
        .song-genre-vertical {
            font-size: 11px;
            background: #e8f5e9;
            display: inline-block;
            padding: 3px 10px;
            border-radius: 15px;
            color: #2E7D32;
            margin-right: 8px;
        }
        
        .song-duration-vertical {
            font-size: 12px;
            color: #999;
            display: inline-block;
        }
        
        .song-actions-vertical {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            flex-shrink: 0;
        }
        
        .btn-download-vertical, .btn-listen-vertical, .btn-youtube-vertical, .btn-google-vertical {
            padding: 10px 20px;
            border: none;
            border-radius: 30px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s;
        }
        
        .btn-download-vertical.mp3 { background: #4CAF50; color: white; }
        .btn-download-vertical.mp4 { background: #2196F3; color: white; }
        .btn-listen-vertical { background: #FF9800; color: white; }
        .btn-youtube-vertical { background: #FF0000; color: white; }
        .btn-google-vertical { background: #4285F4; color: white; }
        
        .btn-download-vertical:hover, .btn-listen-vertical:hover, 
        .btn-youtube-vertical:hover, .btn-google-vertical:hover {
            opacity: 0.85;
            transform: translateY(-2px);
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        
        .youtube-badge-vertical {
            position: absolute;
            top: 5px;
            right: 5px;
            background: #FF0000;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: bold;
        }
        
        .search-section { margin-bottom: 30px; }
        .search-section h3 { font-size: 18px; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid #4CAF50; color: #333; }
        
        .no-results { text-align: center; padding: 60px 20px; }
        .no-results i { font-size: 4rem; color: #ccc; margin-bottom: 15px; }
        .suggestions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
        .suggestions button { background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 25px; cursor: pointer; font-size: 12px; }
        
        .toast-notification { 
            position: fixed; bottom: 20px; right: 20px; padding: 12px 24px; border-radius: 8px; z-index: 2000; 
            transform: translateX(100%); transition: transform 0.3s; font-size: 14px; max-width: 80%;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .toast-notification.success { background: #4CAF50; color: white; }
        .toast-notification.error { background: #f44336; color: white; }
        .toast-notification.info { background: #2196F3; color: white; }
        .toast-notification.show { transform: translateX(0); }
        
        .loading-spinner { text-align: center; padding: 40px; color: #666; }
        .loading-spinner i { font-size: 2rem; margin-bottom: 10px; }
        
        @media (max-width: 768px) {
            .song-item-vertical {
                flex-direction: column;
                text-align: center;
            }
            .song-cover-vertical {
                width: 80px;
                height: 80px;
            }
            .song-info-vertical {
                text-align: center;
            }
            .song-actions-vertical {
                justify-content: center;
            }
        }
    `;
    document.head.appendChild(style);
}

// Make functions global
window.downloadMP3 = downloadMP3;
window.downloadMP4 = downloadMP4;
window.previewAudio = previewAudio;
window.openYouTubeInNewTab = openYouTubeInNewTab;
window.initiatePayment = initiatePayment;
window.searchAlternate = searchAlternate;

// Initialize
document.addEventListener('DOMContentLoaded', init);
// ==================== LOAD SONGS FROM BOTH SOURCES ====================
async function loadLocalSongs() {
    let loadedSongs = [];
    
    // Try to load from main data/songs.json
    try {
        const response = await fetch('data/songs.json?v=' + Date.now());
        const data = await response.json();
        loadedSongs = data.songs || [];
    } catch (error) {
        console.log('Main songs file not found, trying admin backup...');
    }
    
    // If no songs loaded, try admin backup
    if (loadedSongs.length === 0) {
        try {
            const backupResponse = await fetch('admin/songs.json?v=' + Date.now());
            const backupData = await backupResponse.json();
            loadedSongs = backupData.songs || [];
        } catch (e) {
            console.log('No songs found');
        }
    }
    
    // If still no songs, use samples
    if (loadedSongs.length === 0) {
        loadedSongs = getSampleSongs();
    }
    
    allSongs = loadedSongs;
    displaySongs(allSongs);
    displayVideos();
    console.log('✅ Nyimbo zimepakuliwa:', allSongs.length);
}