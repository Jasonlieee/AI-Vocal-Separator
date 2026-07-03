        let selectedFile = null;
        let currentMainView = 'home';
        let currentProcessingView = 'upload';
        let isMuted = { vocals: false, drums: false, bass: false, other: false };
        let isSolo = { vocals: false, drums: false, bass: false, other: false };
        let currentUrls = { vocals: null, drums: null, bass: null, other: null };
        let audioElements = { vocals: null, drums: null, bass: null, other: null };
        let isDragging = false;
        let wasPlayingBeforeDrag = false;

        let batchFiles = [];
        let batchProcessing = false;

        let currentFileName = '';

        // ===== 双模式配置 =====
        let currentModel = '4s'; // '4s' | '6s'

        // 轨道元数据（4轨+6轨统一）
        const STEM_META = {
            vocals: { icon: '🎤', name: '人声' },
            drums:  { icon: '🥁', name: '鼓' },
            bass:   { icon: '🎸', name: '贝斯' },
            other:  { icon: '🎵', name: '伴奏' },
            guitar: { icon: '🎸', name: '吉他' },
            piano:  { icon: '🎹', name: '钢琴' }
        };

        // 动态播放器数据（自定义分轨后使用）
        let customTracks = null; // [{id, label, stems, url}]

        // ===== 分轨组合配置 =====
        let stemPreset = 'default';

        function getActiveStems() {
            return currentModel === '6s'
                ? ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano']
                : ['vocals', 'drums', 'bass', 'other'];
        }

        function getStemPresets() {
            if (currentModel === '6s') {
                return {
                    'default': { vocals: 'A', drums: 'B', bass: 'C', other: 'D', guitar: 'E', piano: 'F' },
                    '2track':  { vocals: 'A', drums: 'B', bass: 'B', other: 'B', guitar: 'B', piano: 'B' },
                    '3track':  { vocals: 'A', drums: 'B', bass: 'C', other: 'C', guitar: 'C', piano: 'C' }
                };
            }
            return {
                'default': { vocals: 'A', drums: 'B', bass: 'C', other: 'D' },
                '2track':  { vocals: 'A', drums: 'B', bass: 'B', other: 'B' },
                '3track':  { vocals: 'A', drums: 'B', bass: 'C', other: 'C' }
            };
        }

        function onModelChange() {
            currentModel = document.getElementById('separateModel').value;
            const is6s = currentModel === '6s';

            // 显示/隐藏6轨专属行
            document.querySelectorAll('.stem-6s-only').forEach(el => {
                el.classList.toggle('hidden', !is6s);
            });

            // 重置预设
            applyPreset('default');
        }

        function applyPreset(preset) {
            stemPreset = preset;
            const presets = getStemPresets();

            document.querySelectorAll('.stem-preset-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.preset === preset);
            });

            const customConfig = document.getElementById('stemCustomConfig');
            if (preset === 'custom') {
                customConfig.classList.remove('hidden');
            } else {
                customConfig.classList.add('hidden');
                const config = presets[preset];
                if (config) {
                    document.getElementById('stemGroupVocals').value = config.vocals;
                    document.getElementById('stemGroupDrums').value = config.drums;
                    document.getElementById('stemGroupBass').value = config.bass;
                    document.getElementById('stemGroupOther').value = config.other;
                    if (currentModel === '6s') {
                        document.getElementById('stemGroupGuitar').value = config.guitar;
                        document.getElementById('stemGroupPiano').value = config.piano;
                    }
                }
            }
            updateStemPreview();
        }

        function onStemGroupChange() {
            stemPreset = 'custom';
            document.querySelectorAll('.stem-preset-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.preset === 'custom');
            });
            document.getElementById('stemCustomConfig').classList.remove('hidden');
            updateStemPreview();
        }

        function getStemGroups() {
            const mapping = {
                vocals: document.getElementById('stemGroupVocals').value,
                drums:  document.getElementById('stemGroupDrums').value,
                bass:   document.getElementById('stemGroupBass').value,
                other:  document.getElementById('stemGroupOther').value
            };
            if (currentModel === '6s') {
                mapping.guitar = document.getElementById('stemGroupGuitar').value;
                mapping.piano  = document.getElementById('stemGroupPiano').value;
            }
            const groups = {};
            for (const [stem, group] of Object.entries(mapping)) {
                if (!groups[group]) groups[group] = [];
                groups[group].push(stem);
            }
            return groups;
        }

        function updateStemPreview() {
            const groups = getStemGroups();
            const preview = document.getElementById('stemPreview');
            let html = '';
            const sortedKeys = Object.keys(groups).sort();
            for (const groupName of sortedKeys) {
                const stemNames = groups[groupName].map(s => STEM_META[s].name).join(' + ');
                html += '<div class="stem-preview-item">轨道 ' + groupName + ': ' + stemNames + '</div>';
            }
            preview.innerHTML = html;
        }

        // 处理模式切换时显示/隐藏分轨面板
        function onProcessModeChange() {
            const mode = document.getElementById('processMode').value;
            const panel = document.getElementById('stemGroupPanel');
            const separateBtn = document.getElementById('separateBtn');
            const convertBtn = document.getElementById('convertBtn');
            const enhanceBtn = document.getElementById('enhanceBtn');

            if (mode === 'separate' || mode === 'convert-and-separate') {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }

            // 显示对应按钮
            separateBtn.style.display = (mode === 'separate' || mode === 'convert-and-separate') ? '' : 'none';
            convertBtn.style.display = (mode === 'convert') ? '' : 'none';
            enhanceBtn.style.display = (mode === 'enhance') ? '' : 'none';

            if (mode === 'separate') separateBtn.textContent = '开始分离';
            if (mode === 'convert-and-separate') separateBtn.textContent = '转换并分离';
        }

        // Enhancer player variables
        let enhancerData = null;
        let enhancerAudio = null;
        let enhancerCurrentVersion = 'enhanced';
        let enhancerAnimFrame = null;
        let enhancerWaveformData = { original: null, enhanced: null };

        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 2500);
        }

        // Canvas-based starfield with natural glow effects
        let starsData = [];
        let nebulaData = [];
        let shootingStars = [];
        let starsCanvas, starsCtx;
        let starAnimFrame;
        
        function createStars() {
            starsCanvas = document.getElementById('starsCanvas');
            starsCtx = starsCanvas.getContext('2d');
            
            function resizeCanvas() {
                starsCanvas.width = window.innerWidth;
                starsCanvas.height = window.innerHeight;
                generateStarData();
            }
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
            
            generateStarData();
            animateStars();
        }

        function generateStarData() {
            const W = starsCanvas.width;
            const H = starsCanvas.height;
            starsData = [];
            nebulaData = [];
            shootingStars = [];

            // --- 星云团（柔和的彩色光雾）---
            const nebulaCount = 5;
            for (let i = 0; i < nebulaCount; i++) {
                const hue = [260, 210, 280, 190, 320][i % 5]; // 紫/蓝/深紫/青/洋红
                nebulaData.push({
                    x: Math.random() * W,
                    y: Math.random() * H * 0.6,
                    radius: 150 + Math.random() * 250,
                    hue,
                    opacity: 0.015 + Math.random() * 0.02,
                    drift: { x: (Math.random() - 0.5) * 0.08, y: (Math.random() - 0.5) * 0.04 },
                    phase: Math.random() * Math.PI * 2
                });
            }

            // --- 星星 ---
            const starCount = Math.min(2000, Math.floor(W * H / 600));
            for (let i = 0; i < starCount; i++) {
                const x = Math.random() * W;
                const distribution = Math.pow(Math.random(), 1.5);
                const y = distribution * H * 0.75;

                const rand = Math.random();
                let size, baseOpacity, pulseSpeed, pulsePhase, hue, glowSize;

                if (rand < 0.02) {
                    // 2% 超亮星：大光晕 + 脉冲
                    size = Math.random() * 1.5 + 2.5;
                    baseOpacity = 0.8 + Math.random() * 0.2;
                    pulseSpeed = 0.3 + Math.random() * 0.4;
                    glowSize = size * (6 + Math.random() * 4);
                    hue = [260, 210, 280, 30, 200][Math.floor(Math.random() * 5)];
                } else if (rand < 0.08) {
                    // 6% 亮星：中等光晕
                    size = Math.random() * 1.2 + 1.8;
                    baseOpacity = 0.5 + Math.random() * 0.3;
                    pulseSpeed = 0.2 + Math.random() * 0.3;
                    glowSize = size * (3 + Math.random() * 2);
                    hue = [260, 220, 200, 40][Math.floor(Math.random() * 4)];
                } else if (rand < 0.25) {
                    // 17% 中等星：微光晕
                    size = Math.random() * 1 + 1;
                    baseOpacity = 0.3 + Math.random() * 0.3;
                    pulseSpeed = 0.1 + Math.random() * 0.2;
                    glowSize = size * 2;
                    hue = 220 + Math.random() * 40;
                } else {
                    // 75% 小星星：无光晕
                    size = Math.random() * 1.2 + 0.3;
                    baseOpacity = 0.15 + Math.random() * 0.35;
                    pulseSpeed = 0.05 + Math.random() * 0.15;
                    glowSize = 0;
                    hue = 0;
                }

                const brightnessFactor = Math.max(0.15, 1 - (y / (H * 0.75)) * 0.7);

                starsData.push({
                    x, y, size,
                    baseOpacity: baseOpacity * brightnessFactor,
                    pulseSpeed,
                    pulsePhase: Math.random() * Math.PI * 2,
                    hue,
                    glowSize,
                    brightnessFactor
                });
            }
        }

        function animateStars() {
            const time = Date.now() * 0.001;
            const W = starsCanvas.width;
            const H = starsCanvas.height;

            starsCtx.clearRect(0, 0, W, H);

            // --- 绘制星云 ---
            nebulaData.forEach(n => {
                const breathe = Math.sin(time * 0.15 + n.phase) * 0.3 + 0.7;
                const cx = n.x + Math.sin(time * 0.1 + n.phase) * 20;
                const cy = n.y + Math.cos(time * 0.08 + n.phase) * 15;

                const grad = starsCtx.createRadialGradient(cx, cy, 0, cx, cy, n.radius);
                grad.addColorStop(0, `hsla(${n.hue}, 60%, 50%, ${n.opacity * breathe})`);
                grad.addColorStop(0.4, `hsla(${n.hue}, 50%, 40%, ${n.opacity * breathe * 0.5})`);
                grad.addColorStop(1, `hsla(${n.hue}, 40%, 30%, 0)`);
                starsCtx.fillStyle = grad;
                starsCtx.fillRect(cx - n.radius, cy - n.radius, n.radius * 2, n.radius * 2);
            });

            // --- 绘制星星 ---
            starsData.forEach(star => {
                const pulse = Math.sin(time * star.pulseSpeed * 2 + star.pulsePhase);
                const opacity = star.baseOpacity * (0.6 + pulse * 0.4);

                // 光晕层（由外到内多层渐变）
                if (star.glowSize > 0) {
                    const breathe = Math.sin(time * star.pulseSpeed + star.pulsePhase) * 0.3 + 0.7;
                    const grad = starsCtx.createRadialGradient(
                        star.x, star.y, 0,
                        star.x, star.y, star.glowSize * breathe
                    );
                    const h = star.hue;
                    const s = 60 + star.brightnessFactor * 20;
                    const l = 60 + star.brightnessFactor * 20;
                    grad.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, ${opacity * 0.6})`);
                    grad.addColorStop(0.2, `hsla(${h}, ${s - 10}%, ${l - 10}%, ${opacity * 0.3})`);
                    grad.addColorStop(0.5, `hsla(${h}, ${s - 20}%, ${l - 20}%, ${opacity * 0.1})`);
                    grad.addColorStop(1, `hsla(${h}, ${s - 30}%, ${l - 30}%, 0)`);
                    starsCtx.fillStyle = grad;
                    starsCtx.fillRect(
                        star.x - star.glowSize, star.y - star.glowSize,
                        star.glowSize * 2, star.glowSize * 2
                    );
                }

                // 星星核心
                starsCtx.beginPath();
                starsCtx.arc(star.x, star.y, star.size / 2, 0, Math.PI * 2);
                starsCtx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                starsCtx.fill();
            });

            // --- 随机流星 ---
            if (Math.random() < 0.002 && shootingStars.length < 2) {
                shootingStars.push({
                    x: Math.random() * W * 0.8,
                    y: Math.random() * H * 0.3,
                    vx: 3 + Math.random() * 4,
                    vy: 1.5 + Math.random() * 2,
                    life: 1,
                    decay: 0.008 + Math.random() * 0.008,
                    length: 60 + Math.random() * 80,
                    hue: [260, 220, 280, 200][Math.floor(Math.random() * 4)]
                });
            }

            // 绘制流星
            for (let i = shootingStars.length - 1; i >= 0; i--) {
                const s = shootingStars[i];
                s.x += s.vx;
                s.y += s.vy;
                s.life -= s.decay;

                if (s.life <= 0) {
                    shootingStars.splice(i, 1);
                    continue;
                }

                const grad = starsCtx.createLinearGradient(
                    s.x, s.y,
                    s.x - s.vx * s.length / 5, s.y - s.vy * s.length / 5
                );
                grad.addColorStop(0, `hsla(${s.hue}, 70%, 80%, ${s.life * 0.9})`);
                grad.addColorStop(0.3, `hsla(${s.hue}, 60%, 70%, ${s.life * 0.5})`);
                grad.addColorStop(1, `hsla(${s.hue}, 50%, 60%, 0)`);

                starsCtx.beginPath();
                starsCtx.moveTo(s.x, s.y);
                starsCtx.lineTo(s.x - s.vx * s.length / 5, s.y - s.vy * s.length / 5);
                starsCtx.strokeStyle = grad;
                starsCtx.lineWidth = 1.5;
                starsCtx.stroke();

                // 流星头部光晕
                const headGrad = starsCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 6);
                headGrad.addColorStop(0, `hsla(${s.hue}, 80%, 90%, ${s.life * 0.8})`);
                headGrad.addColorStop(1, `hsla(${s.hue}, 70%, 70%, 0)`);
                starsCtx.fillStyle = headGrad;
                starsCtx.fillRect(s.x - 6, s.y - 6, 12, 12);
            }

            starAnimFrame = requestAnimationFrame(animateStars);
        }

        function setupEventListeners() {
            // Volume sliders
            const tracks = ['vocals', 'drums', 'bass', 'other'];
            tracks.forEach(track => {
                const slider = document.getElementById('volume' + track.charAt(0).toUpperCase() + track.slice(1));
                if (slider) {
                    slider.addEventListener('input', function() {
                        updateVolume(track, this.value);
                    });
                }
            });

            // Upload area
            const uploadArea = document.getElementById('uploadArea');
            const fileInput = document.getElementById('fileInput');

            if (uploadArea) {
                uploadArea.addEventListener('click', function() {
                    fileInput.click();
                });

                uploadArea.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    this.classList.add('dragover');
                });

                uploadArea.addEventListener('dragleave', function() {
                    this.classList.remove('dragover');
                });

                uploadArea.addEventListener('drop', function(e) {
                    e.preventDefault();
                    this.classList.remove('dragover');
                    if (e.dataTransfer.files.length > 0) {
                        handleFile(e.dataTransfer.files[0]);
                    }
                });
            }

            if (fileInput) {
                fileInput.addEventListener('change', function(e) {
                    if (e.target.files.length > 0) {
                        handleFile(e.target.files[0]);
                    }
                });
            }

            // Process mode change
            const processMode = document.getElementById('processMode');
            if (processMode) {
                processMode.addEventListener('change', function() {
                    updateButtonVisibility();
                });
            }

            // Timeline
            setupTimeline();
        }

        function setupTimeline() {
            const timeline = document.getElementById('timeline');
            const handle = document.getElementById('timelineHandle');

            if (timeline && handle) {
                timeline.addEventListener('mousedown', startDrag);
                timeline.addEventListener('touchstart', startDrag, { passive: false });
                
                document.addEventListener('mousemove', drag);
                document.addEventListener('touchmove', drag, { passive: false });
                document.addEventListener('mouseup', endDrag);
                document.addEventListener('touchend', endDrag);
            }
        }

        function startDrag(e) {
            isDragging = true;
            
            // 记录是否在播放，拖动时暂停
            if (audioElements.vocals && !audioElements.vocals.paused) {
                wasPlayingBeforeDrag = true;
                pauseAllAudio();
            } else {
                wasPlayingBeforeDrag = false;
            }
            
            handleDrag(e);
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                handleDrag(e);
            }
        }

        function endDrag() {
            isDragging = false;
            
            // 拖动结束后如果之前在播放则继续播放
            if (wasPlayingBeforeDrag && audioElements.vocals) {
                playAllAudio();
            }
        }

        function handleDrag(e) {
            const timeline = document.getElementById('timeline');
            if (!timeline || !audioElements.vocals) return;

            const rect = timeline.getBoundingClientRect();
            const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            let x = clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            
            const progress = x / rect.width;
            seekTo(progress);
        }

        function seekTo(progress) {
            const elems = getActiveAudioElements();
            if (elems.length === 0) return;

            const duration = elems[0].duration || 0;
            const time = progress * duration;

            elems.forEach(a => { a.currentTime = time; });

            if (customTracks) {
                updateCustomPlayheadUI(progress, Object.keys(audioElements)[0]);
            } else {
                updatePlayheadUI(progress);
            }
        }

        function seekWaveform(track, e) {
            const primary = getPrimaryAudio();
            if (!primary) return;

            const wasPlaying = !primary.paused;
            if (wasPlaying) pauseAllAudio();

            // 支持自定义轨道ID（如 'custom_A'）和原始轨道名
            let containerId;
            if (track.startsWith('custom_')) {
                containerId = 'waveform_' + track;
            } else {
                containerId = 'waveform' + track.charAt(0).toUpperCase() + track.slice(1);
            }
            const container = document.getElementById(containerId);
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const progress = x / rect.width;

            seekTo(progress);

            if (wasPlaying) playAllAudio();
        }

        function handleFile(file) {
            selectedFile = file;
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileSize').textContent = '(' + formatFileSize(file.size) + ')';
            document.getElementById('fileInfo').classList.remove('hidden');
            document.getElementById('separateBtn').classList.add('active');
            document.getElementById('convertBtn').classList.add('active');
            document.getElementById('enhanceBtn').classList.add('active');
            
            document.getElementById('progressFill').style.width = '25%';
            document.getElementById('progressText').textContent = '25%';
            
            // 根据处理模式显示/隐藏按钮
            updateButtonVisibility();
        }

        function clearFile() {
            selectedFile = null;
            fileInput.value = '';
            document.getElementById('fileInfo').classList.add('hidden');
            document.getElementById('separateBtn').classList.remove('active');
            document.getElementById('convertBtn').classList.remove('active');
            document.getElementById('enhanceBtn').classList.remove('active');
            
            document.getElementById('progressFill').style.width = '0%';
            document.getElementById('progressText').textContent = '0%';
        }

        function updateButtonVisibility() {
            const processMode = document.getElementById('processMode').value;
            const separateBtn = document.getElementById('separateBtn');
            const convertBtn = document.getElementById('convertBtn');
            const enhanceBtn = document.getElementById('enhanceBtn');
            
            if (processMode === 'separate') {
                separateBtn.style.display = 'block';
                convertBtn.style.display = 'none';
                enhanceBtn.style.display = 'none';
                separateBtn.textContent = '分离音频';
            } else if (processMode === 'convert') {
                separateBtn.style.display = 'none';
                convertBtn.style.display = 'block';
                enhanceBtn.style.display = 'none';
                convertBtn.textContent = '转换格式';
            } else if (processMode === 'convert-and-separate') {
                separateBtn.style.display = 'block';
                convertBtn.style.display = 'none';
                enhanceBtn.style.display = 'none';
                separateBtn.textContent = '转换并分离';
            } else if (processMode === 'enhance') {
                separateBtn.style.display = 'none';
                convertBtn.style.display = 'none';
                enhanceBtn.style.display = 'block';
                enhanceBtn.textContent = '一键提升音质';
            }
        }

        function formatFileSize(bytes) {
            if (bytes < 1024 * 1024) {
                return (bytes / 1024).toFixed(1) + ' KB';
            }
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        async function startProcessing() {
            if (!selectedFile) {
                alert('请先选择一个音频文件！');
                return;
            }

            const processMode = document.getElementById('processMode').value;
            const outputFormat = document.getElementById('outputFormat').value;

            if (processMode === 'convert') {
                await startConversion();
                return;
            }

            // 判断是否需要自定义分轨
            const groups = getStemGroups();
            const totalStems = currentModel === '6s' ? 6 : 4;
            const isDefaultSeparate = Object.keys(groups).length === totalStems &&
                Object.values(groups).every(arr => arr.length === 1);

            switchProcessingView('processing');

            let progress = 25;
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');

            const animateProgress = setInterval(() => {
                progress += 2;
                if (progress > 90) progress = 90;
                progressFill.style.width = progress + '%';
                progressText.textContent = progress + '%';
            }, 200);

            try {
                const formData = new FormData();
                formData.append('file', selectedFile);

                let apiUrl;
                let successMessage;

                if (processMode === 'convert-and-separate') {
                    // 转换+分离模式
                    if (isDefaultSeparate) {
                        apiUrl = currentModel === '6s' ? '/api/separate-6s' : '/api/convert-and-separate';
                        if (currentModel !== '6s') formData.append('output_format', outputFormat);
                        successMessage = '转换并分离成功';
                    } else {
                        apiUrl = currentModel === '6s' ? '/api/separate-custom-6s' : '/api/separate-custom';
                        formData.append('groups', JSON.stringify(groups));
                        successMessage = '转换、分离并合并成功';
                    }
                } else {
                    // 仅分离模式
                    if (isDefaultSeparate) {
                        apiUrl = currentModel === '6s' ? '/api/separate-6s' : '/api/separate';
                        successMessage = '分离成功';
                    } else {
                        apiUrl = currentModel === '6s' ? '/api/separate-custom-6s' : '/api/separate-custom';
                        formData.append('groups', JSON.stringify(groups));
                        successMessage = '分离并合并成功';
                    }
                }

                console.log(`请求: ${apiUrl}, 模型: ${currentModel}, 分组:`, groups);
                const response = await fetch(apiUrl, { method: 'POST', body: formData });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || '处理失败');
                }

                const data = await response.json();
                console.log(successMessage, data);

                clearInterval(animateProgress);
                progressFill.style.width = '100%';
                progressText.textContent = '100%';

                currentFileName = selectedFile ? selectedFile.name : '';

                const addBtn = document.getElementById('addToLibraryBtn');
                if (addBtn) {
                    addBtn.classList.remove('added');
                    addBtn.innerHTML = '⭐ 收入素材库';
                }

                // 根据模式初始化播放器
                if (isDefaultSeparate) {
                    customTracks = null;
                    if (currentModel === '6s') {
                        // 6轨默认模式
                        await init6sAudioElements(data.sources);
                    } else {
                        // 4轨默认模式
                        currentUrls.vocals = data.vocals_url;
                        currentUrls.drums = data.drums_url;
                        currentUrls.bass = data.bass_url;
                        currentUrls.other = data.other_url;
                        await initAudioElements(data.vocals_url, data.drums_url, data.bass_url, data.other_url);
                    }
                } else {
                    // 自定义分轨模式（4轨和6轨通用）
                    customTracks = data.tracks;
                    currentUrls = {};
                    await initCustomTrackPlayer(data.tracks);
                }

                setTimeout(() => {
                    switchProcessingView('player');
                    // 播放器视图可见后绘制波形
                    if (isDefaultSeparate) {
                        if (currentModel === '6s') {
                            draw6sWaveformsAfterVisible(data.sources);
                        } else {
                            drawWaveformsAfterVisible(data.vocals_url, data.drums_url, data.bass_url, data.other_url);
                        }
                    } else {
                        setTimeout(async () => {
                            console.log('[自定义分轨波形] 直接加载真实波形...');
                            try {
                                await renderCustomWaveforms(data.tracks);
                            } catch (e) {
                                console.warn('[自定义分轨波形] 真实波形加载失败，使用备用波形:', e);
                                Object.keys(audioElements).forEach(id => drawSimpleWaveformForCustom(id));
                            }
                        }, 100);
                    }
                }, 500);

            } catch (error) {
                clearInterval(animateProgress);
                console.error('Error:', error);
                alert('处理失败: ' + error.message);
                switchProcessingView('upload');
            }
        }

        async function startConversion() {
            if (!selectedFile) {
                alert('请先选择一个音频文件！');
                return;
            }
            
            const outputFormat = document.getElementById('outputFormat').value;
            
            switchProcessingView('processing');
            
            let progress = 25;
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');
            
            const animateProgress = setInterval(() => {
                progress += 2;
                if (progress > 90) progress = 90;
                progressFill.style.width = progress + '%';
                progressText.textContent = progress + '%';
            }, 200);
            
            try {
                const formData = new FormData();
                formData.append('file', selectedFile);
                formData.append('output_format', outputFormat);
                
                console.log('开始发送请求到 /api/convert...');
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    body: formData
                });
                
                console.log('收到响应:', response.status);
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || '转换失败');
                }
                
                const data = await response.json();
                console.log('转换成功:', data);
                
                clearInterval(animateProgress);
                progressFill.style.width = '100%';
                progressText.textContent = '100%';
                
                // 创建下载链接
                const downloadLink = document.createElement('a');
                downloadLink.href = data.converted_url;
                downloadLink.download = `converted_audio.${outputFormat}`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                
                alert(`音频已成功转换为 ${outputFormat.toUpperCase()} 格式！文件已自动下载。`);
                
                switchProcessingView('upload');
                
            } catch (error) {
                clearInterval(animateProgress);
                console.error('Error:', error);
                alert('格式转换失败: ' + error.message);
                switchProcessingView('upload');
            }
        }

        async function startEnhancement() {
            if (!selectedFile) {
                alert('请先选择一个音频文件！');
                return;
            }
            
            switchProcessingView('processing');
            
            // 更新处理中文本
            const processingText = document.querySelector('.processing-text');
            const processingSubtext = document.querySelector('.processing-subtext');
            if (processingText) processingText.textContent = 'AI正在提升音质...';
            if (processingSubtext) processingSubtext.textContent = '使用 noisereduce 进行降噪和增强，请稍候...';
            
            let progress = 25;
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');
            
            const animateProgress = setInterval(() => {
                progress += 2;
                if (progress > 90) progress = 90;
                progressFill.style.width = progress + '%';
                progressText.textContent = progress + '%';
            }, 200);
            
            try {
                const formData = new FormData();
                formData.append('file', selectedFile);
                
                console.log('开始发送请求到 /api/enhance...');
                const response = await fetch('/api/enhance', {
                    method: 'POST',
                    body: formData
                });
                
                console.log('收到响应:', response.status);
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || '音质提升失败');
                }
                
                const data = await response.json();
                console.log('音质提升成功:', data);
                
                clearInterval(animateProgress);
                progressFill.style.width = '100%';
                progressText.textContent = '100%';
                
                // 保存增强结果数据
                enhancerData = {
                    originalUrl: data.original_url,
                    enhancedUrl: data.enhanced_url,
                    fileId: data.file_id,
                    originalFilename: data.original_filename || selectedFile.name
                };
                
                // 进入增强播放界面
                setTimeout(() => {
                    switchProcessingView('upload');
                    showEnhancerPlayer();
                }, 500);
                
            } catch (error) {
                clearInterval(animateProgress);
                console.error('Error:', error);
                alert('音质提升失败: ' + error.message);
                
                // 恢复处理中文本
                if (processingText) processingText.textContent = 'AI正在分离您的音频...';
                if (processingSubtext) processingSubtext.textContent = '请稍候，这可能需要几分钟';
                
                switchProcessingView('upload');
            }
        }

        async function verifyAudioUrls(urlMap) {
            const results = {};
            for (const [track, url] of Object.entries(urlMap)) {
                if (!url) { results[track] = { ok: false, reason: '无 URL' }; continue; }
                try {
                    const res = await fetch(url, { method: 'HEAD' });
                    if (res.ok) {
                        results[track] = { ok: true, status: res.status };
                    } else {
                        results[track] = { ok: false, status: res.status };
                    }
                } catch (e) {
                    results[track] = { ok: false, error: e.message };
                }
            }
            return results;
        }

        async function initAudioElements(vocalsUrl, drumsUrl, bassUrl, otherUrl) {
            console.log('[初始化] 🔊 initAudioElements 开始');
            console.log('[初始化] 人声 URL:', vocalsUrl);
            console.log('[初始化] 鼓组 URL:', drumsUrl);
            console.log('[初始化] 贝斯 URL:', bassUrl);
            console.log('[初始化] 其他 URL:', otherUrl);

            build4sPlayerHTML();
            console.log('[初始化] DOM 已构建');

            const tracks = ['vocals', 'drums', 'bass', 'other'];
            const urls = { vocals: vocalsUrl, drums: drumsUrl, bass: bassUrl, other: otherUrl };

            // 预检查 URL 是否可访问
            console.log('[初始化] 🔍 检查音频 URL 可达性...');
            const urlStatus = await verifyAudioUrls(urls);
            console.log('[初始化] URL 检查结果:', urlStatus);
            const failedTracks = Object.entries(urlStatus).filter(([_, v]) => !v.ok);
            if (failedTracks.length === tracks.length) {
                console.error('[初始化] ❌ 全部轨道音频文件不可访问，可能已被清理，请重新分离音频');
                showToast('音频文件已过期，请重新分离后再试');
                return;
            }

            audioElements = {};
            isMuted = { vocals: false, drums: false, bass: false, other: false };
            isSolo = { vocals: false, drums: false, bass: false, other: false };

            tracks.forEach(track => {
                audioElements[track] = new Audio(urls[track]);
                audioElements[track].crossOrigin = "anonymous";
                audioElements[track].preload = "auto";
            });
            console.log('[初始化] 已创建 4 个 Audio 对象');

            await Promise.all(tracks.map(track =>
                new Promise(resolve => {
                    const audio = audioElements[track];
                    const timeout = setTimeout(() => {
                        console.warn('[初始化] ⚠️', track, '加载超时 (5秒)，继续...');
                        resolve();
                    }, 5000);
                    const onLoaded = () => {
                        clearTimeout(timeout);
                        resolve();
                    };
                    const onError = () => {
                        clearTimeout(timeout);
                        console.warn('[初始化] ⚠️', track, '加载错误');
                        resolve();
                    };
                    audio.addEventListener('loadedmetadata', onLoaded, { once: true });
                    audio.addEventListener('error', onError, { once: true });
                    if (audio.readyState >= 1) {
                        clearTimeout(timeout);
                        resolve();
                    }
                })
            ));

            console.log('[初始化] 音频元数据加载完成');
            let working = 0;
            tracks.forEach(track => {
                if (audioElements[track] && audioElements[track].duration && isFinite(audioElements[track].duration)) {
                    console.log('[初始化]   -', track, '时长:', audioElements[track].duration.toFixed(2), 's, readyState:', audioElements[track].readyState);
                    working++;
                }
            });

            if (working === 0) {
                console.error('[初始化] ❌ 没有可用轨道，请重新分离音频');
                showToast('音频加载失败，请重新分离');
                return;
            }

            if (audioElements.vocals) {
                audioElements.vocals.addEventListener('timeupdate', onTimeUpdate);
                audioElements.vocals.addEventListener('ended', onAudioEnded);
            }

            audioElements.vocals && (audioElements.vocals.volume = 0.8);
            audioElements.drums && (audioElements.drums.volume = 0.7);
            audioElements.bass && (audioElements.bass.volume = 0.7);
            audioElements.other && (audioElements.other.volume = 0.7);

            setupTimelineMarkers();
            console.log('[初始化] ✅ 4轨播放器初始化完成，可用轨道数:', working);
        }

        function build4sPlayerHTML() {
            const container = document.getElementById('trackControlsContainer');
            if (!container) return;
            container.innerHTML = '';

            const tracks = [
                { id: 'vocals', icon: '🎤', name: '人声轨道', volume: 0.8 },
                { id: 'drums',  icon: '⭕', name: '鼓组轨道', volume: 0.7 },
                { id: 'bass',   icon: '🎸', name: '贝斯轨道', volume: 0.7 },
                { id: 'other',  icon: '🎵', name: '其他轨道', volume: 0.7 }
            ];

            tracks.forEach(t => {
                const card = document.createElement('div');
                card.className = 'track-bar';
                card.setAttribute('data-track', t.id);
                const key = t.id.charAt(0).toUpperCase() + t.id.slice(1);
                card.innerHTML = `
                    <div class="track-bar-left">
                        <div class="track-bar-icon">${t.icon}</div>
                        <div class="track-bar-name">${t.name}</div>
                    </div>
                    <div class="track-bar-volume">
                        <input type="range" class="track-volume-slider" orient="vertical" id="volume${key}" min="0" max="100" value="${Math.round(t.volume * 100)}" title="音量">
                    </div>
                    <div class="track-bar-waveform" id="waveform${key}" onclick="seekWaveform('${t.id}', event)">
                        <canvas class="waveform-canvas" id="canvas${key}"></canvas>
                        <div class="waveform-progress" id="progress${key}"></div>
                        <div class="waveform-playhead" id="playhead${key}"></div>
                    </div>
                    <div class="track-bar-controls">
                        <button class="track-bar-btn" onclick="downloadTrack('${t.id}')" title="下载">⬇</button>
                        <button class="track-bar-btn ms" id="mute${key}" onclick="toggleMute('${t.id}')" title="静音">M</button>
                        <button class="track-bar-btn ms" id="solo${key}" onclick="toggleSolo('${t.id}')" title="独奏">S</button>
                    </div>
                `;
                container.appendChild(card);
            });

            // 绑定音量滑片事件
            tracks.forEach(t => {
                const slider = document.getElementById('volume' + t.id.charAt(0).toUpperCase() + t.id.slice(1));
                if (slider) {
                    slider.addEventListener('input', function() {
                        updateVolume(t.id, this.value);
                    });
                }
            });
        }

        // 在播放器视图可见后绘制波形（避免 canvas 尺寸为 0）
        function drawWaveformsAfterVisible(vocalsUrl, drumsUrl, bassUrl, otherUrl) {
            const tracks = ['vocals', 'drums', 'bass', 'other'];
            setTimeout(async () => {
                console.log('[波形] 直接加载真实波形...');
                try {
                    await renderWaveforms(vocalsUrl, drumsUrl, bassUrl, otherUrl);
                } catch (e) {
                    console.warn('[波形] 部分轨道波形渲染失败，失败轨道使用备用波形:', e);
                }
            }, 100);
        }

        // ===== 6轨默认播放器初始化 =====
        async function init6sAudioElements(sources) {
            console.log('[初始化6轨] 🔊 init6sAudioElements 开始', sources);

            const trackOrder = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'];

            build6sPlayerHTML(sources, trackOrder);
            console.log('[初始化6轨] DOM 已构建');

            Object.values(audioElements).forEach(el => { if (el && el.pause) el.pause(); });
            audioElements = {};
            isMuted = {};
            isSolo = {};
            currentUrls = {};

            // 预检查 URL 可达性
            console.log('[初始化6轨] 🔍 检查音频 URL 可达性...');
            const onlyExisting = {};
            const urlStatus6s = await verifyAudioUrls(sources);
            console.log('[初始化6轨] URL 检查结果:', urlStatus6s);
            trackOrder.forEach(track => {
                if (sources[track] && urlStatus6s[track] && urlStatus6s[track].ok) {
                    onlyExisting[track] = sources[track];
                }
            });
            if (Object.keys(onlyExisting).length < Object.keys(sources).length) {
                console.warn('[初始化6轨] ⚠️ 部分轨道 URL 不可访问，只加载可用的轨道');
            }
            if (Object.keys(onlyExisting).length === 0) {
                console.error('[初始化6轨] ❌ 所有轨道音频文件都不可访问，请重新分离');
                showToast('音频文件已过期，请重新分离');
                return;
            }

            Object.keys(onlyExisting).forEach(track => {
                audioElements[track] = new Audio(onlyExisting[track]);
                audioElements[track].crossOrigin = "anonymous";
                audioElements[track].preload = "auto";
                isMuted[track] = false;
                isSolo[track] = false;
                currentUrls[track] = onlyExisting[track];
            });

            const activeTracks = Object.keys(audioElements);
            if (activeTracks.length === 0) {
                console.error('[初始化6轨] ❌ 没有可用的轨道');
                return;
            }
            console.log('[初始化6轨] 已创建', activeTracks.length, '个 Audio 对象');

            await Promise.all(activeTracks.map(track =>
                new Promise((resolve) => {
                    const audio = audioElements[track];
                    const timeout = setTimeout(() => {
                        console.warn('[初始化6轨] ⚠️', track, '加载超时 (5秒)，继续...');
                        resolve();
                    }, 5000);
                    const onLoaded = () => {
                        clearTimeout(timeout);
                        resolve();
                    };
                    const onError = () => {
                        clearTimeout(timeout);
                        console.warn('[初始化6轨] ⚠️', track, '加载错误');
                        resolve();
                    };
                    audio.addEventListener('loadedmetadata', onLoaded, { once: true });
                    audio.addEventListener('error', onError, { once: true });
                    if (audio.readyState >= 1) {
                        clearTimeout(timeout);
                        resolve();
                    }
                })
            ));

            console.log('[初始化6轨] 音频元数据加载完成');
            activeTracks.forEach(track => {
                if (audioElements[track] && audioElements[track].duration) {
                    console.log('[初始化6轨]   -', track, '时长:', audioElements[track].duration.toFixed(2), 's');
                }
            });

            const primaryTrack = activeTracks[0];
            if (audioElements[primaryTrack]) {
                audioElements[primaryTrack].addEventListener('timeupdate', onTimeUpdate);
                audioElements[primaryTrack].addEventListener('ended', onAudioEnded);
            }

            activeTracks.forEach(t => { if (audioElements[t]) audioElements[t].volume = 0.7; });

            setupTimelineMarkers();
            console.log('6轨播放器初始化完成');
        }

        function build6sPlayerHTML(sources, trackOrder) {
            const container = document.getElementById('trackControlsContainer');
            if (!container) return;
            container.innerHTML = '';

            const trackLabels = {
                vocals: '人声轨道', drums: '鼓组轨道', bass: '贝斯轨道',
                other: '其他轨道', guitar: '吉他轨道', piano: '钢琴轨道'
            };

            trackOrder.forEach(track => {
                if (!sources[track]) return;
                const meta = STEM_META[track] || { icon: '🎵', name: track };
                const card = document.createElement('div');
                card.className = 'track-bar';
                card.setAttribute('data-track', track);
                const key = track.charAt(0).toUpperCase() + track.slice(1);
                card.innerHTML = `
                    <div class="track-bar-left">
                        <div class="track-bar-icon">${meta.icon}</div>
                        <div class="track-bar-name">${trackLabels[track] || meta.name}</div>
                    </div>
                    <div class="track-bar-volume">
                        <input type="range" class="track-volume-slider" orient="vertical" id="volume${key}" min="0" max="100" value="70" title="音量">
                    </div>
                    <div class="track-bar-waveform" id="waveform${key}" onclick="seekWaveform('${track}', event)">
                        <canvas class="waveform-canvas" id="canvas${key}"></canvas>
                        <div class="waveform-progress" id="progress${key}"></div>
                        <div class="waveform-playhead" id="playhead${key}"></div>
                    </div>
                    <div class="track-bar-controls">
                        <button class="track-bar-btn" onclick="downloadTrack('${track}')" title="下载">⬇</button>
                        <button class="track-bar-btn ms" id="mute${key}" onclick="toggleMute('${track}')" title="静音">M</button>
                        <button class="track-bar-btn ms" id="solo${key}" onclick="toggleSolo('${track}')" title="独奏">S</button>
                    </div>
                `;
                container.appendChild(card);
            });

            // 绑定音量滑片事件（与4轨 setupEventListeners 逻辑一致）
            trackOrder.forEach(track => {
                if (!sources[track]) return;
                const slider = document.getElementById('volume' + track.charAt(0).toUpperCase() + track.slice(1));
                if (slider) {
                    slider.addEventListener('input', function() {
                        updateVolume(track, this.value);
                    });
                }
            });
        }

        // 在播放器视图可见后绘制6轨波形
        function draw6sWaveformsAfterVisible(sources) {
            const tracks = Object.keys(sources);
            setTimeout(async () => {
                console.log('[6轨波形] 直接加载真实波形...');
                for (const track of tracks) {
                    await renderSingleWaveform(track, sources[track]);
                }
            }, 100);
        }

        // 渲染单个轨道的真实波形
        async function renderSingleWaveform(trackId, audioUrl) {
            console.log('[6轨波形] 渲染', trackId, audioUrl);
            try {
                const response = await fetch(audioUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                    throw new Error('文件为空');
                }
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                drawWaveform(trackId, audioBuffer);
                console.log('[6轨波形] ✅', trackId, '波形渲染成功');
            } catch (e) {
                console.warn('[6轨波形] ⚠️', trackId, '波形渲染失败:', e.message, '→ 使用备用波形');
                drawSimpleWaveform(trackId);
            }
        }

        // ===== 自定义分轨播放器初始化 =====
        async function initCustomTrackPlayer(tracks) {
            console.log('初始化自定义分轨播放器, 共', tracks.length, '轨');

            if (!tracks || tracks.length === 0) {
                console.error('没有轨道数据，回退到默认4轨模式');
                alert('分轨组合数据为空，将使用默认4轨模式播放');
                customTracks = null;
                // 回退：使用默认4轨URL（如果有的话）
                return;
            }

            // 1. 隐藏所有原始轨道卡片
            const allTrackCards = document.querySelectorAll('.player-view .track-bar');
            allTrackCards.forEach(card => card.classList.add('hidden'));

            // 2. 清理旧的动态轨道
            const existingDynamic = document.querySelectorAll('.player-view .track-bar.dynamic-track');
            existingDynamic.forEach(el => el.remove());

            // 3. 清理旧音频元素
            const oldTracks = ['vocals', 'drums', 'bass', 'other'];
            oldTracks.forEach(t => {
                if (audioElements[t]) {
                    audioElements[t].pause();
                    audioElements[t] = null;
                }
                isMuted[t] = false;
                isSolo[t] = false;
            });

            // 4. 创建新的音频元素和轨道卡片
            const trackContainer = document.getElementById('trackControlsContainer');
            trackContainer.innerHTML = ''; // 清空容器，准备插入新的轨道卡片

            // 轨道颜色映射
            const trackColors = ['vocals', 'drums', 'bass', 'other'];

            // 重置动态轨道的状态对象
            audioElements = {};
            isMuted = {};
            isSolo = {};
            currentUrls = {};

            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                const trackId = 'custom_' + track.id;
                const stemLabel = track.stems.map(s => STEM_META[s].name).join(' + ');
                const stemIcon = track.stems.length === 1 ? STEM_META[track.stems[0]].icon : '🎶';
                const canvasId = 'canvas_' + trackId;

                // 初始化状态
                audioElements[trackId] = null;
                isMuted[trackId] = false;
                isSolo[trackId] = false;
                currentUrls[trackId] = track.url;

                // 创建轨道卡片
                const card = document.createElement('div');
                card.className = 'track-bar dynamic-track';
                card.innerHTML = `
                    <div class="track-bar-left">
                        <div class="track-bar-icon">${stemIcon}</div>
                        <div class="track-bar-name">${track.label}: ${stemLabel}</div>
                    </div>
                    <div class="track-bar-volume">
                        <input type="range" class="track-volume-slider" orient="vertical" id="volume_${trackId}" min="0" max="100" value="80" title="音量">
                    </div>
                    <div class="track-bar-waveform" id="waveform_${trackId}" onclick="seekWaveform('${trackId}', event)">
                        <canvas class="waveform-canvas" id="${canvasId}"></canvas>
                        <div class="waveform-progress" id="progress_${trackId}"></div>
                        <div class="waveform-playhead" id="playhead_${trackId}"></div>
                    </div>
                    <div class="track-bar-controls">
                        <button class="track-bar-btn" onclick="downloadCustomTrack('${trackId}')" title="下载">⬇</button>
                        <button class="track-bar-btn ms" id="mute_${trackId}" onclick="toggleMute('${trackId}')" title="静音">M</button>
                        <button class="track-bar-btn ms" id="solo_${trackId}" onclick="toggleSolo('${trackId}')" title="独奏">S</button>
                    </div>
                `;
                trackContainer.appendChild(card);

                // 创建音频元素
                const audio = new Audio(track.url);
                audio.crossOrigin = 'anonymous';
                audio.preload = 'auto';
                audio.volume = 0.8;
                audioElements[trackId] = audio;
            }

            // 5. 等待所有音频加载
            const trackIds = tracks.map(t => 'custom_' + t.id);
            await Promise.all(trackIds.map(id =>
                new Promise(resolve => audioElements[id].addEventListener('loadedmetadata', resolve))
            ));
            console.log('所有自定义轨道加载完成');

            // 6. 绑定 timeupdate 到第一个轨道
            const primaryTrackId = trackIds[0];
            audioElements[primaryTrackId].addEventListener('timeupdate', onCustomTimeUpdate);
            audioElements[primaryTrackId].addEventListener('ended', onCustomAudioEnded);

            // 7. 设置时间线
            setupTimelineMarkersForCustom(primaryTrackId);
            // 波形绘制在 startProcessing 中播放器视图可见后调用
        }

        function onCustomTimeUpdate() {
            if (isDragging) return;
            const trackIds = Object.keys(audioElements).filter(id => audioElements[id]);
            if (trackIds.length === 0) return;

            const primary = trackIds[0];
            // 同步所有轨道
            for (let i = 1; i < trackIds.length; i++) {
                if (Math.abs(audioElements[primary].currentTime - audioElements[trackIds[i]].currentTime) > 0.1) {
                    audioElements[trackIds[i]].currentTime = audioElements[primary].currentTime;
                }
            }

            const progress = audioElements[primary].currentTime / audioElements[primary].duration;
            updateCustomPlayheadUI(progress, primary);
        }

        function onCustomAudioEnded() {
            const trackIds = Object.keys(audioElements).filter(id => audioElements[id]);
            if (isLooping) {
                trackIds.forEach(id => {
                    audioElements[id].currentTime = 0;
                    audioElements[id].play().catch(() => {});
                });
            } else {
                trackIds.forEach(id => {
                    audioElements[id].pause();
                    audioElements[id].currentTime = 0;
                });
                updatePlayPauseButton(true);
                updateCustomPlayheadUI(0, trackIds[0]);
            }
        }

        function updateCustomPlayheadUI(progress, primaryId) {
            const timelineFill = document.getElementById('timelineFill');
            const timelineHandle = document.getElementById('timelineHandle');
            const timelineTime = document.getElementById('timelineTime');
            const playerTimeCurrent = document.getElementById('playerTimeCurrent');
            const playerTimeTotal = document.getElementById('playerTimeTotal');

            if (timelineFill) timelineFill.style.width = (progress * 100) + '%';
            if (timelineHandle) timelineHandle.style.left = (progress * 100) + '%';

            if (audioElements[primaryId]) {
                const current = formatTime(audioElements[primaryId].currentTime);
                const total = formatTime(audioElements[primaryId].duration || 0);
                if (timelineTime) timelineTime.textContent = `${current} / ${total}`;
                if (playerTimeCurrent) playerTimeCurrent.textContent = current;
                if (playerTimeTotal) playerTimeTotal.textContent = total;
            }

            Object.keys(audioElements).forEach(id => {
                const progressEl = document.getElementById('progress_' + id);
                const playheadEl = document.getElementById('playhead_' + id);
                if (progressEl) progressEl.style.width = (progress * 100) + '%';
                if (playheadEl) playheadEl.style.left = (progress * 100) + '%';
            });
        }

        function setupTimelineMarkersForCustom(primaryId) {
            const markersContainer = document.getElementById('timelineMarkers');
            if (!markersContainer || !audioElements[primaryId]) return;

            markersContainer.innerHTML = '';
            const duration = audioElements[primaryId].duration;
            const interval = Math.max(5, Math.ceil(duration / 10));

            for (let t = 0; t <= duration; t += interval) {
                const marker = document.createElement('div');
                marker.className = 'timeline-marker';
                marker.style.left = (t / duration * 100) + '%';

                const label = document.createElement('div');
                label.className = 'timeline-marker-label';
                label.textContent = formatTime(t);
                marker.appendChild(label);

                markersContainer.appendChild(marker);
            }
        }

        function drawSimpleWaveformForCustom(trackId) {
            const canvas = document.getElementById('canvas_' + trackId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const container = canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;

            let cw = container.clientWidth;
            let ch = container.clientHeight;
            if (cw <= 0) cw = 600;
            if (ch <= 0) ch = 80;

            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
            canvas.style.width = cw + 'px';
            canvas.style.height = ch + 'px';

            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);

            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, 'rgba(208, 188, 255, 0.8)');
            gradient.addColorStop(0.5, 'rgba(173, 198, 255, 0.6)');
            gradient.addColorStop(1, 'rgba(208, 188, 255, 0.2)');
            ctx.fillStyle = gradient;

            const centerY = height / 2;
            const barWidth = Math.max(3, dpr * 3);
            for (let x = 0; x < width; x += barWidth + 1) {
                const t = x / width;
                const amplitude = (height / 2) * (0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI * 10)));
                const y = centerY - amplitude;
                const barHeight = Math.max(2, amplitude * 2);
                ctx.fillRect(x, y, barWidth, barHeight);
            }
        }

        // 自定义分轨：用真实音频数据绘制波形
        async function renderCustomWaveforms(tracks) {
            console.log('开始渲染自定义分轨真实波形...');
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const trackIds = tracks.map(t => 'custom_' + t.id);

                await Promise.all(trackIds.map(async (trackId) => {
                    const url = currentUrls[trackId];
                    if (!url) return;
                    try {
                        const buffer = await fetchAudioBuffer(audioContext, url);
                        drawRealWaveformForCustom(trackId, buffer);
                    } catch (e) {
                        console.error(trackId, '真实波形加载失败，保留备用波形:', e);
                    }
                }));
                console.log('自定义分轨真实波形渲染完成');
            } catch (e) {
                console.error('自定义波形渲染失败:', e);
            }
        }

        function drawRealWaveformForCustom(trackId, buffer) {
            const canvas = document.getElementById('canvas_' + trackId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const container = canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;

            let cw = container.clientWidth;
            let ch = container.clientHeight;
            if (cw <= 0) cw = 600;
            if (ch <= 0) ch = 80;

            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
            canvas.style.width = cw + 'px';
            canvas.style.height = ch + 'px';

            const width = canvas.width;
            const height = canvas.height;
            const channelData = buffer.getChannelData(0);
            const samplesPerPixel = Math.max(1, Math.floor(channelData.length / width));

            ctx.clearRect(0, 0, width, height);

            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, 'rgba(208, 188, 255, 1)');
            gradient.addColorStop(0.5, 'rgba(173, 198, 255, 0.7)');
            gradient.addColorStop(1, 'rgba(208, 188, 255, 0.3)');
            ctx.fillStyle = gradient;

            const centerY = height / 2;
            const barWidth = Math.max(2, dpr * 2);
            const maxDisplayHeight = height * 0.63;
            const numBars = Math.ceil(width / barWidth);

            const bars = [];
            let globalMaxDiff = 0;
            for (let b = 0; b < numBars; b++) {
                const xStart = b * barWidth;
                let binMin = 1.0;
                let binMax = -1.0;
                const sampleStart = Math.floor(xStart * samplesPerPixel);
                const sampleEnd = Math.min(channelData.length, sampleStart + samplesPerPixel);
                for (let i = sampleStart; i < sampleEnd; i++) {
                    const s = channelData[i];
                    if (s < binMin) binMin = s;
                    if (s > binMax) binMax = s;
                }
                const diff = binMax - binMin;
                if (diff > globalMaxDiff) globalMaxDiff = diff;
                bars.push(diff);
            }

            const scale = globalMaxDiff > 0 ? maxDisplayHeight / globalMaxDiff : 0;
            for (let b = 0; b < bars.length; b++) {
                const x = b * barWidth;
                const normalizedDiff = bars[b] * scale;
                const halfHeight = Math.max(1, normalizedDiff / 2);
                ctx.fillRect(x, centerY - halfHeight, barWidth - 0.5, halfHeight * 2);
            }
            console.log(trackId, '真实波形绘制完成 (归一化因子:', globalMaxDiff.toFixed(3), ')');
        }

        function downloadCustomTrack(trackId) {
            if (!currentUrls[trackId]) {
                alert('音频未加载');
                return;
            }
            const link = document.createElement('a');
            link.href = currentUrls[trackId];
            link.download = trackId + '.wav';
            link.click();
        }

        // 覆盖 togglePlayPause 等函数以支持动态轨道
        function getActiveAudioElements() {
            const result = [];
            for (const key in audioElements) {
                if (audioElements[key]) result.push(audioElements[key]);
            }
            return result;
        }

        function setupTimelineMarkers() {
            const markersContainer = document.getElementById('timelineMarkers');
            if (!markersContainer || !audioElements.vocals) return;
            
            markersContainer.innerHTML = '';
            const duration = audioElements.vocals.duration;
            const interval = Math.max(5, Math.ceil(duration / 10));
            
            for (let t = 0; t <= duration; t += interval) {
                const marker = document.createElement('div');
                marker.className = 'timeline-marker';
                marker.style.left = (t / duration * 100) + '%';
                
                const label = document.createElement('div');
                label.className = 'timeline-marker-label';
                label.textContent = formatTime(t);
                marker.appendChild(label);
                
                markersContainer.appendChild(marker);
            }
        }

        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        function onTimeUpdate() {
            if (isDragging) return;
            if (customTracks) return; // 自定义模式使用 onCustomTimeUpdate

            const primary = getPrimaryAudio();
            if (!primary) return;

            const allTracks = Object.keys(audioElements).filter(k => audioElements[k]);
            allTracks.forEach(track => {
                if (audioElements[track] !== primary && Math.abs(primary.currentTime - audioElements[track].currentTime) > 0.1) {
                    audioElements[track].currentTime = primary.currentTime;
                }
            });

            const progress = primary.currentTime / primary.duration;
            updatePlayheadUI(progress);
        }

        function onAudioEnded() {
            if (isLooping) {
                Object.values(audioElements).forEach(a => {
                    if (a && a.currentTime !== undefined) {
                        a.currentTime = 0;
                        a.play().catch(() => {});
                    }
                });
            } else {
                stopAllAudio();
            }
        }

        function seekTimeline(e) {
            const primary = getPrimaryAudio();
            if (!primary) return;
            const wasPlaying = !primary.paused;
            if (wasPlaying) pauseAllAudio();

            const progressOuter = e.currentTarget.querySelector('.player-progress-outer') || e.currentTarget;
            const rect = progressOuter.getBoundingClientRect();
            const clientX = e.clientX;
            let x = clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const progress = x / rect.width;
            seekTo(progress);

            if (wasPlaying) playAllAudio();
        }

        let isLooping = false;
        function toggleLoop() {
            isLooping = !isLooping;
            const btn = document.getElementById('loopBtn');
            if (btn) btn.classList.toggle('active', isLooping);
            console.log('[播放] 循环模式:', isLooping ? '开启' : '关闭');
        }

        function updatePlayheadUI(progress) {
            const timelineFill = document.getElementById('timelineFill');
            const timelineHandle = document.getElementById('timelineHandle');
            const timelineTime = document.getElementById('timelineTime');
            const playerTimeCurrent = document.getElementById('playerTimeCurrent');
            const playerTimeTotal = document.getElementById('playerTimeTotal');

            if (timelineFill) timelineFill.style.width = (progress * 100) + '%';
            if (timelineHandle) timelineHandle.style.left = (progress * 100) + '%';

            const primary = getPrimaryAudio();
            if (primary) {
                const current = formatTime(primary.currentTime);
                const total = formatTime(primary.duration || 0);
                if (timelineTime) timelineTime.textContent = `${current} / ${total}`;
                if (playerTimeCurrent) playerTimeCurrent.textContent = current;
                if (playerTimeTotal) playerTimeTotal.textContent = total;
            }

            Object.keys(audioElements).forEach(track => {
                const trackKey = track.charAt(0).toUpperCase() + track.slice(1);
                const progressEl = document.getElementById('progress' + trackKey);
                const playheadEl = document.getElementById('playhead' + trackKey);
                if (progressEl) progressEl.style.width = (progress * 100) + '%';
                if (playheadEl) playheadEl.style.left = (progress * 100) + '%';
            });
        }

        function goHome() {
            stopAllAudio();
            if (enhancerAudio) {
                enhancerAudio.pause();
                enhancerAudio = null;
            }
            cancelAnimationFrame(enhancerAnimFrame);
            switchProcessingView('upload');
            switchMainView('home');
        }

        function switchMainView(view) {
            currentMainView = view;

            document.querySelectorAll('.page-view, .batch-page, .file-manager-page, .library-page').forEach(page => page.classList.remove('active'));

            document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
            const activeLink = document.querySelector('.nav-link[data-view="' + view + '"]');
            if (activeLink) activeLink.classList.add('active');

            const pageMap = {
                'home': 'homePage',
                'features': 'featuresPage',
                'pricing': 'pricingPage',
                'about': 'aboutPage',
                'settings': 'settingsPage',
                'profile': 'profilePage',
                'batch': 'batchPage',
                'filemanager': 'fileManagerPage',
                'library': 'libraryPage'
            };

            const targetPage = document.getElementById(pageMap[view]);
            if (targetPage) targetPage.classList.add('active');

            // 切回首页时，隐藏播放/处理视图，恢复上传视图
            if (view === 'home') {
                switchProcessingView('upload');
            }

            // 切到其他主页面时，恢复 main-content 的默认 padding，
            // 并移除 homePage 的 wide-mode（避免影响后续的首页显示）
            const mainContent = document.querySelector('.main-content');
            const homePage = document.getElementById('homePage');
            if (mainContent) mainContent.classList.remove('no-padding');
            if (homePage) homePage.classList.remove('wide-mode');
        }

        function switchProcessingView(view) {
            currentProcessingView = view;
            
            if (view !== 'player') {
                stopAllAudio();
            }
            
            document.getElementById('uploadView').classList.add('hidden');
            document.getElementById('processingView').classList.remove('active');
            document.getElementById('processingView').classList.add('hidden');
            document.getElementById('playerView').classList.remove('active');
            document.getElementById('playerView').classList.add('hidden');
            
            // 播放页宽布局：homePage 默认被限制在 950px 内与首页操作界面对齐，
            // 切到播放页后移除该限制，让内容扩展到红框区域。
            // 同时给 main-content 加 no-padding，彻底消除顶部间隙，让波形顶栏紧贴导航栏下方。
            const homePage = document.getElementById('homePage');
            const mainContent = document.querySelector('.main-content');
            
            if (view === 'upload') {
                document.getElementById('uploadView').classList.remove('hidden');
                if (homePage) homePage.classList.remove('wide-mode');
                if (mainContent) mainContent.classList.remove('no-padding');
            } else if (view === 'processing') {
                document.getElementById('processingView').classList.remove('hidden');
                document.getElementById('processingView').classList.add('active');
                if (homePage) homePage.classList.remove('wide-mode');
                if (mainContent) mainContent.classList.remove('no-padding');
            } else if (view === 'player') {
                document.getElementById('playerView').classList.remove('hidden');
                document.getElementById('playerView').classList.add('active');
                if (homePage) homePage.classList.add('wide-mode');
                if (mainContent) mainContent.classList.add('no-padding');
            }
        }

        async function togglePlayPause() {
            console.log('[播放] 点击播放/暂停按钮');
            const elems = getActiveAudioElements();
            if (elems.length === 0) {
                console.warn('[播放] ⚠️ 没有可播放的音频元素');
                return;
            }
            console.log('[播放] 找到', elems.length, '个音频元素');

            const first = elems[0];
            if (!first || !('paused' in first)) {
                console.error('[播放] ❌ 音频元素无效');
                return;
            }

            if (first.paused) {
                console.log('[播放] ▶️ 尝试播放, currentTime:', first.currentTime, 'src:', first.src);
                const playPromises = elems.map(a => {
                    try {
                        const p = a.play();
                        if (p && typeof p.catch === 'function') {
                            return p.catch(err => {
                                console.error('[播放] 播放失败:', a.currentSrc || a.src, '错误:', err.message || err);
                            });
                        }
                        return Promise.resolve();
                    } catch (err) {
                        console.error('[播放] 播放异常:', err);
                        return Promise.resolve();
                    }
                });
                await Promise.all(playPromises);
                updatePlayPauseButton(false);
                console.log('[播放] ✅ 已开始播放');
            } else {
                console.log('[播放] ⏸️ 暂停');
                elems.forEach(a => a.pause());
                updatePlayPauseButton(true);
            }
        }

        function updatePlayPauseButton(isPaused) {
            const btn = document.getElementById('playPauseBtn');
            if (btn) {
                btn.innerHTML = isPaused ? '▶' : '⏸';
            }
        }

        function playAllAudio() {
            const elems = getActiveAudioElements();
            if (elems.length === 0) return;
            elems.forEach(a => a.play());
            updatePlayPauseButton(false);
        }

        function pauseAllAudio() {
            const elems = getActiveAudioElements();
            if (elems.length === 0) return;
            elems.forEach(a => a.pause());
            updatePlayPauseButton(true);
        }

        function stopAllAudio() {
            const elems = getActiveAudioElements();
            if (elems.length === 0) return;
            elems.forEach(a => { a.pause(); a.currentTime = 0; });
            updatePlayPauseButton(true);
            if (customTracks) {
                updateCustomPlayheadUI(0, Object.keys(audioElements)[0]);
            } else {
                updatePlayheadUI(0);
            }
        }

        function getPrimaryAudio() {
            if (customTracks) {
                const keys = Object.keys(audioElements).filter(k => audioElements[k]);
                return keys.length > 0 ? audioElements[keys[0]] : null;
            }
            return audioElements.vocals;
        }

        function skipForward() {
            const primary = getPrimaryAudio();
            if (!primary) return;
            const newTime = Math.min(primary.currentTime + 10, primary.duration);
            seekTo(newTime / primary.duration);
        }

        function skipBackward() {
            const primary = getPrimaryAudio();
            if (!primary) return;
            const newTime = Math.max(primary.currentTime - 10, 0);
            seekTo(newTime / primary.duration);
        }

        function toggleMute(track) {
            isMuted[track] = !isMuted[track];
            const btn = document.getElementById('mute' + track.charAt(0).toUpperCase() + track.slice(1))
                || document.getElementById('mute_' + track);

            if (audioElements[track]) {
                audioElements[track].muted = isMuted[track];
            }

            if (btn) {
                btn.classList.toggle('active', isMuted[track]);
                btn.classList.toggle('muted', isMuted[track]);
            }
        }

        function toggleSolo(track) {
            isSolo[track] = !isSolo[track];
            const allTracks = Object.keys(audioElements).filter(k => audioElements[k]);

            const btn = document.getElementById('solo' + track.charAt(0).toUpperCase() + track.slice(1))
                || document.getElementById('solo_' + track);

            if (isSolo[track]) {
                if (btn) btn.classList.add('active');
                allTracks.forEach(t => {
                    if (t !== track) {
                        isSolo[t] = false;
                        const otherBtn = document.getElementById('solo' + t.charAt(0).toUpperCase() + t.slice(1))
                            || document.getElementById('solo_' + t);
                        if (otherBtn) otherBtn.classList.remove('active');
                        if (audioElements[t]) audioElements[t].muted = true;
                    }
                });
                if (audioElements[track]) audioElements[track].muted = isMuted[track];
            } else {
                if (btn) btn.classList.remove('active');
                const hasSolo = allTracks.some(t => isSolo[t]);
                if (!hasSolo) {
                    allTracks.forEach(t => {
                        if (audioElements[t]) audioElements[t].muted = isMuted[t];
                    });
                }
            }
        }

        function updateVolume(track, value) {
            if (audioElements[track]) {
                audioElements[track].volume = value / 100;
            }
        }

        function downloadTrack(track) {
            if (!currentUrls[track]) {
                alert('请先进行音频分离！');
                return;
            }

            const link = document.createElement('a');
            link.href = currentUrls[track];
            link.download = track + '.wav';
            link.click();
        }

        function downloadAll() {
            if (customTracks) {
                customTracks.forEach((track, i) => {
                    setTimeout(() => downloadCustomTrack('custom_' + track.id), i * 500);
                });
                return;
            }
            if (!currentUrls.vocals || !currentUrls.drums || !currentUrls.bass || !currentUrls.other) {
                alert('请先进行音频分离！');
                return;
            }
            const tracks = ['vocals', 'drums', 'bass', 'other'];
            tracks.forEach((track, i) => {
                setTimeout(() => downloadTrack(track), i * 500);
            });
        }

        function resetApp() {
            stopAllAudio();

            // 停止增强播放器
            if (enhancerAudio) {
                enhancerAudio.pause();
                enhancerAudio = null;
            }
            cancelAnimationFrame(enhancerAnimFrame);
            enhancerData = null;
            enhancerCurrentVersion = 'enhanced';
            enhancerWaveformData = { original: null, enhanced: null };

            // 清理自定义分轨数据
            if (customTracks) {
                // 移除动态创建的轨道卡片
                document.querySelectorAll('.player-view .track-bar.dynamic-track').forEach(el => el.remove());
                // 恢复隐藏的原始轨道卡片
                document.querySelectorAll('.player-view .track-bar.hidden').forEach(el => el.classList.remove('hidden'));
                customTracks = null;
            }

            selectedFile = null;
            currentUrls = { vocals: null, drums: null, bass: null, other: null };
            audioElements = { vocals: null, drums: null, bass: null, other: null };
            isMuted = { vocals: false, drums: false, bass: false, other: false };
            isSolo = { vocals: false, drums: false, bass: false, other: false };

            fileInput.value = '';
            document.getElementById('fileInfo').classList.add('hidden');
            document.getElementById('separateBtn').classList.remove('active');
            document.getElementById('progressFill').style.width = '0%';
            document.getElementById('progressText').textContent = '0%';

            const tracks = ['vocals', 'drums', 'bass', 'other'];
            tracks.forEach(track => {
                const muteBtn = document.getElementById('mute' + track.charAt(0).toUpperCase() + track.slice(1));
                const soloBtn = document.getElementById('solo' + track.charAt(0).toUpperCase() + track.slice(1));
                if (muteBtn) muteBtn.classList.remove('active');
                if (soloBtn) soloBtn.classList.remove('active');
            });

            // 隐藏增强播放器
            document.getElementById('enhancerPlayerView').classList.add('hidden');
            document.getElementById('enhancerPlayerView').classList.remove('active');

            // 重置分轨面板
            applyPreset('4track');

            switchProcessingView('upload');
        }
        function toggleTheme() {
            const body = document.body;
            const btn = document.getElementById('themeToggle');
            body.classList.toggle('light-theme');
            const isLight = body.classList.contains('light-theme');
            btn.textContent = isLight ? '☀️' : '🌙';
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        }

        (function() {
            const saved = localStorage.getItem('theme');
            if (saved === 'light') {
                document.body.classList.add('light-theme');
                const btn = document.getElementById('themeToggle');
                if (btn) btn.textContent = '☀️';
            }
        })();

        async function renderWaveforms(vocalsUrl, drumsUrl, bassUrl, otherUrl) {
            console.log('[波形] 开始渲染真实波形...');
            const tracks = ['vocals', 'drums', 'bass', 'other'];
            const urls = [vocalsUrl, drumsUrl, bassUrl, otherUrl];
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();

            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                const url = urls[i];
                try {
                    const buffer = await fetchAudioBuffer(audioContext, url, track);
                    drawWaveform(track, buffer);
                    console.log('[波形] ✅', track, '真实波形渲染成功');
                } catch (e) {
                    console.warn('[波形] ⚠️', track, '真实波形渲染失败:', e.message, '→ 使用备用波形');
                    drawSimpleWaveform(track);
                }
            }
            console.log('[波形] 所有轨道渲染完成');
        }

        async function fetchAudioBuffer(audioContext, url, track) {
            console.log('[波形] 获取音频:', track, url);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText} (${url})`);
            }
            const arrayBuffer = await response.arrayBuffer();
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                throw new Error('音频文件为空 (0 bytes)');
            }
            console.log('[波形]', track, '下载成功, 大小:', arrayBuffer.byteLength, '字节, 开始解码...');
            try {
                return await audioContext.decodeAudioData(arrayBuffer);
            } catch (decodeErr) {
                throw new Error(`解码失败: ${decodeErr.message}`);
            }
        }

        function drawWaveform(track, buffer) {
            console.log('绘制', track, '波形');
            const canvasId1 = 'canvas' + track.charAt(0).toUpperCase() + track.slice(1);
            const canvasId2 = 'waveform-' + track;
            const canvas = document.getElementById(canvasId1) || document.getElementById(canvasId2);
            if (!canvas) {
                console.error('找不到 canvas:', canvasId1, canvasId2);
                return;
            }
            const ctx = canvas.getContext('2d');
            const container = canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;

            let cw = container.clientWidth;
            let ch = container.clientHeight;
            if (cw <= 0) cw = 600;
            if (ch <= 0) ch = 80;

            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
            canvas.style.width = cw + 'px';
            canvas.style.height = ch + 'px';

            const width = canvas.width;
            const height = canvas.height;
            const channelData = buffer.getChannelData(0);
            const samplesPerPixel = Math.max(1, Math.floor(channelData.length / width));

            ctx.clearRect(0, 0, width, height);

            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            if (track === 'vocals') {
                gradient.addColorStop(0, 'rgba(208, 188, 255, 1)');
                gradient.addColorStop(0.5, 'rgba(208, 188, 255, 0.7)');
                gradient.addColorStop(1, 'rgba(208, 188, 255, 0.3)');
            } else if (track === 'drums') {
                gradient.addColorStop(0, 'rgba(255, 185, 95, 1)');
                gradient.addColorStop(0.5, 'rgba(255, 185, 95, 0.7)');
                gradient.addColorStop(1, 'rgba(255, 185, 95, 0.3)');
            } else if (track === 'bass') {
                gradient.addColorStop(0, 'rgba(173, 198, 255, 1)');
                gradient.addColorStop(0.5, 'rgba(173, 198, 255, 0.7)');
                gradient.addColorStop(1, 'rgba(173, 198, 255, 0.3)');
            } else {
                gradient.addColorStop(0, 'rgba(149, 142, 160, 1)');
                gradient.addColorStop(0.5, 'rgba(149, 142, 160, 0.7)');
                gradient.addColorStop(1, 'rgba(149, 142, 160, 0.3)');
            }
            ctx.fillStyle = gradient;

            const centerY = height / 2;
            const barWidth = Math.max(2, dpr * 2);
            const maxDisplayHeight = height * 0.63;
            const numBars = Math.ceil(width / barWidth);

            const bars = [];
            let globalMaxDiff = 0;
            for (let b = 0; b < numBars; b++) {
                const xStart = b * barWidth;
                let binMin = 1.0;
                let binMax = -1.0;
                const sampleStart = Math.floor(xStart * samplesPerPixel);
                const sampleEnd = Math.min(channelData.length, sampleStart + samplesPerPixel);
                for (let i = sampleStart; i < sampleEnd; i++) {
                    const s = channelData[i];
                    if (s < binMin) binMin = s;
                    if (s > binMax) binMax = s;
                }
                const diff = binMax - binMin;
                if (diff > globalMaxDiff) globalMaxDiff = diff;
                bars.push(diff);
            }

            const scale = globalMaxDiff > 0 ? maxDisplayHeight / globalMaxDiff : 0;
            for (let b = 0; b < bars.length; b++) {
                const x = b * barWidth;
                const normalizedDiff = bars[b] * scale;
                const halfHeight = Math.max(1, normalizedDiff / 2);
                ctx.fillRect(x, centerY - halfHeight, barWidth - 0.5, halfHeight * 2);
            }
            console.log(track, '波形绘制完成 (归一化因子:', globalMaxDiff.toFixed(3), 'scale:', scale.toFixed(1), ')');
        }

        function drawSimpleWaveform(track) {
            console.log('绘制备用波形:', track);
            const canvasId1 = 'canvas' + track.charAt(0).toUpperCase() + track.slice(1);
            const canvasId2 = 'waveform-' + track;
            const canvas = document.getElementById(canvasId1) || document.getElementById(canvasId2);
            if (!canvas) {
                console.error('Canvas not found:', canvasId1, canvasId2);
                return;
            }
            const ctx = canvas.getContext('2d');
            const container = canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;

            let cw = container.clientWidth;
            let ch = container.clientHeight;
            if (cw <= 0) cw = 600;
            if (ch <= 0) ch = 80;

            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
            canvas.style.width = cw + 'px';
            canvas.style.height = ch + 'px';

            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);

            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            if (track === 'vocals') {
                gradient.addColorStop(0, 'rgba(208, 188, 255, 0.8)');
                gradient.addColorStop(0.5, 'rgba(208, 188, 255, 0.5)');
                gradient.addColorStop(1, 'rgba(208, 188, 255, 0.2)');
            } else if (track === 'drums') {
                gradient.addColorStop(0, 'rgba(255, 185, 95, 0.8)');
                gradient.addColorStop(0.5, 'rgba(255, 185, 95, 0.5)');
                gradient.addColorStop(1, 'rgba(255, 185, 95, 0.2)');
            } else if (track === 'bass') {
                gradient.addColorStop(0, 'rgba(173, 198, 255, 0.8)');
                gradient.addColorStop(0.5, 'rgba(173, 198, 255, 0.5)');
                gradient.addColorStop(1, 'rgba(173, 198, 255, 0.2)');
            } else {
                gradient.addColorStop(0, 'rgba(149, 142, 160, 0.8)');
                gradient.addColorStop(0.5, 'rgba(149, 142, 160, 0.5)');
                gradient.addColorStop(1, 'rgba(149, 142, 160, 0.2)');
            }
            ctx.fillStyle = gradient;

            const centerY = height / 2;
            const barWidth = Math.max(3, dpr * 3);
            const numBars = Math.ceil(width / barWidth);
            const maxDisplayHeight = height * 0.56;
            const seed = track.length * 1337;

            for (let b = 0; b < numBars; b++) {
                const x = b * barWidth;
                const t = b / numBars;
                const rnd1 = Math.sin(seed + b * 0.37) * 0.5 + 0.5;
                const rnd2 = Math.sin(seed * 1.7 + b * 0.11) * 0.5 + 0.5;
                const envelope = 0.4 + Math.sin(t * Math.PI) * 0.6;
                const wiggles = Math.abs(Math.sin(t * 8 + seed)) * 0.35 + Math.abs(Math.sin(t * 21 + seed * 0.3)) * 0.2;
                const noise = rnd1 * 0.3 + rnd2 * 0.2;
                const amplitude = maxDisplayHeight * (noise + wiggles) * envelope;
                const halfHeight = Math.max(1, amplitude);
                ctx.fillRect(x, centerY - halfHeight, barWidth - 1, halfHeight * 2);
            }
            console.log('备用波形绘制完成:', track, width, height);
        }

        function initBatchUpload() {
            const batchUploadArea = document.getElementById('batchUploadArea');
            const batchFileInput = document.getElementById('batchFileInput');

            if (batchUploadArea) {
                batchUploadArea.addEventListener('click', () => batchFileInput.click());

                batchUploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    batchUploadArea.classList.add('dragover');
                });

                batchUploadArea.addEventListener('dragleave', () => {
                    batchUploadArea.classList.remove('dragover');
                });

                batchUploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    batchUploadArea.classList.remove('dragover');
                    addBatchFiles(e.dataTransfer.files);
                });
            }

            if (batchFileInput) {
                batchFileInput.addEventListener('change', (e) => {
                    addBatchFiles(e.target.files);
                    batchFileInput.value = '';
                });
            }
        }

        function addBatchFiles(fileList) {
            const supported = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.wma', '.m4a', '.ape', '.alac'];
            for (const file of fileList) {
                const ext = '.' + file.name.split('.').pop().toLowerCase();
                if (supported.includes(ext)) {
                    batchFiles.push({
                        file: file,
                        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        status: 'pending',
                        vocalsUrl: null,
                        drumsUrl: null,
                        bassUrl: null,
                        otherUrl: null
                    });
                }
            }
            renderBatchQueue();
        }

        function renderBatchQueue() {
            const taskList = document.getElementById('batchTaskList');
            const batchEmpty = document.getElementById('batchEmpty');
            const batchCount = document.getElementById('batchCount');
            const batchStartBtn = document.getElementById('batchStartBtn');

            batchCount.textContent = batchFiles.length + ' 个文件';

            if (batchFiles.length === 0) {
                taskList.innerHTML = '<div class="batch-empty" id="batchEmpty"><div class="batch-empty-icon">📂</div><div class="batch-empty-text">暂无文件，请添加音频文件</div></div>';
                batchStartBtn.disabled = true;
                return;
            }

            batchStartBtn.disabled = batchProcessing;

            let html = '';
            batchFiles.forEach((item, index) => {
                const isCompleted = item.status === 'completed';
                const isProcessing = item.status === 'processing';
                const isError = item.status === 'error';

                html += '<div class="batch-task' + (isCompleted ? ' completed' : '') + '"' +
                    (isCompleted ? ' onclick="playBatchResult(\'' + item.id + '\')"' : '') + '>';

                if (isProcessing) {
                    html += '<div class="batch-task-icon"><div class="spinner-small"></div></div>';
                } else if (isCompleted) {
                    html += '<div class="batch-task-icon">✅</div>';
                } else if (isError) {
                    html += '<div class="batch-task-icon">❌</div>';
                } else {
                    html += '<div class="batch-task-icon">🎵</div>';
                }

                html += '<div class="batch-task-info">';
                html += '<div class="batch-task-name">' + escapeHtml(item.file.name) + '</div>';
                html += '<div class="batch-task-size">' + formatFileSize(item.file.size) + '</div>';
                html += '</div>';

                html += '<div class="batch-task-status ' + item.status + '">';
                if (item.status === 'pending') html += '等待中';
                else if (item.status === 'processing') html += '处理中...';
                else if (item.status === 'completed') html += '✅ 点击播放';
                else if (item.status === 'error') html += '失败';
                html += '</div>';

                html += '</div>';
            });

            taskList.innerHTML = html;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function clearBatchQueue() {
            if (batchProcessing) {
                showToast('正在处理中，无法清空');
                return;
            }
            batchFiles = [];
            renderBatchQueue();
        }

        async function startBatchProcessing() {
            if (batchFiles.length === 0) return;
            if (batchProcessing) return;

            batchProcessing = true;
            document.getElementById('batchStartBtn').disabled = true;

            for (let i = 0; i < batchFiles.length; i++) {
                if (batchFiles[i].status === 'completed') continue;

                batchFiles[i].status = 'processing';
                renderBatchQueue();

                try {
                    const formData = new FormData();
                    formData.append('file', batchFiles[i].file);

                    const response = await fetch('/api/batch-separate', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.detail || '处理失败');
                    }

                    const data = await response.json();
                    batchFiles[i].status = 'completed';
                    batchFiles[i].vocalsUrl = data.vocals_url;
                    batchFiles[i].drumsUrl = data.drums_url;
                    batchFiles[i].bassUrl = data.bass_url;
                    batchFiles[i].otherUrl = data.other_url;
                } catch (error) {
                    console.error('批量处理失败:', batchFiles[i].file.name, error);
                    batchFiles[i].status = 'error';
                }

                renderBatchQueue();
            }

            batchProcessing = false;
            document.getElementById('batchStartBtn').disabled = false;
            showToast('批量处理完成');
        }

        function playBatchResult(itemId) {
            const item = batchFiles.find(f => f.id === itemId);
            if (!item || item.status !== 'completed') return;

            switchMainView('home');

            setTimeout(async () => {
                currentUrls.vocals = item.vocalsUrl;
                currentUrls.drums = item.drumsUrl;
                currentUrls.bass = item.bassUrl;
                currentUrls.other = item.otherUrl;
                currentFileName = item.file.name;

                await initAudioElements(item.vocalsUrl, item.drumsUrl, item.bassUrl, item.otherUrl);

                switchProcessingView('player');
                drawWaveformsAfterVisible(item.vocalsUrl, item.drumsUrl, item.bassUrl, item.otherUrl);

                document.getElementById('fileName').textContent = item.file.name;
                document.getElementById('fileSize').textContent = '(' + formatFileSize(item.file.size) + ')';
                document.getElementById('fileInfo').classList.remove('hidden');
                document.getElementById('progressFill').style.width = '100%';
                document.getElementById('progressText').textContent = '100%';

                const addBtn = document.getElementById('addToLibraryBtn');
                if (addBtn) {
                    addBtn.classList.remove('added');
                    addBtn.innerHTML = '⭐ 收入素材库';
                }
            }, 100);
        }

        async function loadFileManager() {
            try {
                const response = await fetch('/api/files');
                const data = await response.json();
                renderFileList(data.files);
            } catch (error) {
                console.error('加载文件列表失败:', error);
            }
        }

        function renderFileList(files) {
            const container = document.getElementById('fileListContainer');
            const countEl = document.getElementById('fileCount');
            const emptyState = document.getElementById('fileEmptyState');

            countEl.textContent = files.length + ' 个文件';

            if (files.length === 0) {
                container.innerHTML = '';
                container.appendChild(emptyState || createEmptyState('file'));
                return;
            }

            let html = '';
            files.forEach(file => {
                const isVocals = file.name.includes('_vocals');
                const isDrums = file.name.includes('_drums');
                const isBass = file.name.includes('_bass');
                const isOther = file.name.includes('_other');
                let icon = '🎵';
                if (isVocals) icon = '🎤';
                else if (isDrums) icon = '🥁';
                else if (isBass) icon = '🎸';
                else if (isOther) icon = '🎵';
                const size = formatFileSize(file.size);
                const date = new Date(file.modified * 1000).toLocaleString('zh-CN');

                html += '<div class="file-item">';
                html += '<div class="file-item-icon">' + icon + '</div>';
                html += '<div class="file-item-info">';
                html += '<div class="file-item-name">' + escapeHtml(file.name) + '</div>';
                html += '<div class="file-item-meta">' + size + ' · ' + date + '</div>';
                html += '</div>';
                html += '<div class="file-item-actions">';
                html += '<a href="/static/' + encodeURIComponent(file.name) + '" download class="btn-icon-small" title="下载">⬇️</a>';
                html += '<button class="btn-icon-small danger" onclick="deleteFile(\'' + escapeHtml(file.name) + '\')" title="删除">🗑️</button>';
                html += '</div>';
                html += '</div>';
            });

            container.innerHTML = html;
        }

        async function deleteFile(filename) {
            if (!confirm('确定要删除文件 ' + filename + ' 吗？')) return;

            try {
                const response = await fetch('/api/files/' + encodeURIComponent(filename), { method: 'DELETE' });
                if (response.ok) {
                    showToast('文件已删除');
                    loadFileManager();
                } else {
                    showToast('删除失败');
                }
            } catch (error) {
                showToast('删除失败: ' + error.message);
            }
        }

        async function deleteAllFiles() {
            if (!confirm('确定要清空所有处理文件吗？此操作不可恢复！')) return;

            try {
                const response = await fetch('/api/files', { method: 'DELETE' });
                const data = await response.json();
                showToast('已清空 ' + data.deleted + ' 个文件');
                loadFileManager();
            } catch (error) {
                showToast('清空失败: ' + error.message);
            }
        }

        async function loadLibrary() {
            try {
                const response = await fetch('/api/library');
                const data = await response.json();
                renderLibraryList(data.items);
            } catch (error) {
                console.error('加载素材库失败:', error);
            }
        }

        function renderLibraryList(items) {
            const container = document.getElementById('libraryListContainer');
            const countEl = document.getElementById('libraryCount');
            const emptyState = document.getElementById('libraryEmptyState');

            countEl.textContent = items.length + ' 个素材';

            if (items.length === 0) {
                container.innerHTML = '';
                container.appendChild(emptyState || createEmptyState('library'));
                return;
            }

            let html = '';
            items.forEach(item => {
                const date = new Date(item.created_at * 1000).toLocaleString('zh-CN');

                html += '<div class="library-item" onclick="playLibraryItem(\'' + item.id + '\')">';
                html += '<div class="library-item-icon">🎵</div>';
                html += '<div class="library-item-info">';
                html += '<div class="library-item-name">' + escapeHtml(item.name) + '</div>';
                html += '<div class="library-item-meta">收录于 ' + date + '</div>';
                html += '</div>';
                html += '<div class="library-item-play">▶️ 播放</div>';
                html += '<button class="btn-icon-small danger" onclick="event.stopPropagation(); removeLibraryItem(\'' + item.id + '\')" title="移除">🗑️</button>';
                html += '</div>';
            });

            container.innerHTML = html;
        }

        function createEmptyState(type) {
            const div = document.createElement('div');
            div.className = 'empty-state';
            if (type === 'file') {
                div.innerHTML = '<div class="empty-state-icon">📁</div><div class="empty-state-text">暂无处理文件</div><div class="empty-state-hint">处理音频后，文件将显示在这里</div>';
            } else {
                div.innerHTML = '<div class="empty-state-icon">🎵</div><div class="empty-state-text">素材库为空</div><div class="empty-state-hint">在播放页面点击"收入素材库"添加素材</div>';
            }
            return div;
        }

        async function addToLibrary() {
            const btn = document.getElementById('addToLibraryBtn');
            if (btn.classList.contains('added')) {
                showToast('已收入素材库');
                return;
            }

            // 检查是否有可用的音频URL
            const hasAudio = Object.values(currentUrls).some(url => url) ||
                             (customTracks && customTracks.length > 0) ||
                             Object.keys(audioElements).some(k => audioElements[k]);
            if (!hasAudio) {
                showToast('请先进行音频分离！');
                return;
            }

            const name = currentFileName || '未命名音频';

            try {
                const response = await fetch('/api/library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        vocals_url: currentUrls.vocals || null,
                        drums_url: currentUrls.drums || null,
                        bass_url: currentUrls.bass || null,
                        other_url: currentUrls.other || null
                    })
                });

                if (response.ok) {
                    btn.classList.add('added');
                    btn.innerHTML = '✅ 已收入素材库';
                    showToast('已收入素材库');
                } else {
                    showToast('收入素材库失败');
                }
            } catch (error) {
                showToast('收入素材库失败: ' + error.message);
            }
        }

        async function playLibraryItem(itemId) {
            try {
                const response = await fetch('/api/library');
                const data = await response.json();
                const item = data.items.find(i => i.id === itemId);

                if (!item) {
                    showToast('素材不存在');
                    return;
                }

                switchMainView('home');

                setTimeout(async () => {
                    const hasAllTracks = item.drums_url && item.bass_url && item.other_url;

                    if (!hasAllTracks) {
                        showToast('此素材为旧格式，请重新分离以获得四轨效果');
                        return;
                    }

                    currentUrls.vocals = item.vocals_url;
                    currentUrls.drums = item.drums_url || null;
                    currentUrls.bass = item.bass_url || null;
                    currentUrls.other = item.other_url || null;
                    currentFileName = item.name;

                    // 先切换到播放界面，再加载音频
                    switchProcessingView('player');

                    try {
                        await initAudioElements(item.vocals_url, item.drums_url, item.bass_url, item.other_url);
                        drawWaveformsAfterVisible(item.vocals_url, item.drums_url, item.bass_url, item.other_url);
                    } catch (e) {
                        console.error('音频加载失败:', e);
                        showToast('音频加载失败，文件可能已过期，请重新分离');
                    }

                    document.getElementById('fileName').textContent = item.name;
                    document.getElementById('fileInfo').classList.remove('hidden');
                    document.getElementById('progressFill').style.width = '100%';
                    document.getElementById('progressText').textContent = '100%';

                    const btn = document.getElementById('addToLibraryBtn');
                    btn.classList.add('added');
                    btn.innerHTML = '✅ 已收入素材库';
                }, 100);
            } catch (error) {
                showToast('加载失败: ' + error.message);
            }
        }

        async function removeLibraryItem(itemId) {
            if (!confirm('确定要从素材库移除吗？')) return;

            try {
                const response = await fetch('/api/library/' + itemId, { method: 'DELETE' });
                if (response.ok) {
                    showToast('已从素材库移除');
                    loadLibrary();
                }
            } catch (error) {
                showToast('移除失败');
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            createStars();
            setupEventListeners();
            initBatchUpload();
        });

        function switchMainViewWithLoad(view) {
            switchMainView(view);
            if (view === 'filemanager') loadFileManager();
            if (view === 'library') loadLibrary();
        }

        // ========== Enhancer Player Functions ==========
        
        function showEnhancerPlayer() {
            if (!enhancerData) {
                showToast('没有增强数据');
                return;
            }

            // 隐藏上传视图，显示增强播放器
            document.getElementById('uploadView').classList.add('hidden');
            document.getElementById('playerView').classList.add('hidden');
            document.getElementById('playerView').classList.remove('active');
            document.getElementById('enhancerPlayerView').classList.remove('hidden');
            document.getElementById('enhancerPlayerView').classList.add('active');

            // 播放页宽布局：homePage 默认被限制在 950px 内与首页操作界面对齐，
            // 切到音质提升播放器后也移除该限制。同时给 main-content 加 no-padding 消除顶部间隙。
            const homePage = document.getElementById('homePage');
            const mainContent = document.querySelector('.main-content');
            if (homePage) homePage.classList.add('wide-mode');
            if (mainContent) mainContent.classList.add('no-padding');

            // 更新文件名
            document.getElementById('enhancerFilename').textContent = enhancerData.originalFilename;

            // 默认显示增强版
            enhancerCurrentVersion = 'enhanced';
            updateEnhancerVersionUI();

            // 初始化音频
            initEnhancerAudio(enhancerData.enhancedUrl);

            // 绘制波形
            drawEnhancerWaveform(enhancerData.enhancedUrl, 'enhanced');
            drawEnhancerWaveform(enhancerData.originalUrl, 'original');
        }

        function initEnhancerAudio(url) {
            if (enhancerAudio) {
                enhancerAudio.pause();
                enhancerAudio = null;
            }

            enhancerAudio = new Audio(url);
            enhancerAudio.volume = 0.8;

            enhancerAudio.addEventListener('loadedmetadata', () => {
                updateEnhancerTime();
            });

            enhancerAudio.addEventListener('timeupdate', () => {
                updateEnhancerProgress();
                updateEnhancerTime();
            });

            enhancerAudio.addEventListener('ended', () => {
                document.getElementById('enhancerPlayPauseBtn').textContent = '▶️ 播放';
                cancelAnimationFrame(enhancerAnimFrame);
            });
        }

        function switchEnhancerVersion(version) {
            if (version === enhancerCurrentVersion) return;

            const wasPlaying = enhancerAudio && !enhancerAudio.paused;
            const currentTime = enhancerAudio ? enhancerAudio.currentTime : 0;

            enhancerCurrentVersion = version;
            updateEnhancerVersionUI();

            // 切换音频源
            const url = version === 'enhanced' ? enhancerData.enhancedUrl : enhancerData.originalUrl;
            initEnhancerAudio(url);

            enhancerAudio.addEventListener('loadedmetadata', () => {
                enhancerAudio.currentTime = currentTime;
                if (wasPlaying) {
                    enhancerAudio.play();
                }
            }, { once: true });

            // 更新波形显示
            updateEnhancerWaveformDisplay();
        }

        function updateEnhancerVersionUI() {
            const btnEnhanced = document.getElementById('btnEnhanced');
            const btnOriginal = document.getElementById('btnOriginal');
            const status = document.getElementById('enhancerStatus');

            if (enhancerCurrentVersion === 'enhanced') {
                btnEnhanced.classList.add('active');
                btnOriginal.classList.remove('active');
                status.textContent = '当前播放：增强版';
            } else {
                btnEnhanced.classList.remove('active');
                btnOriginal.classList.add('active');
                status.textContent = '当前播放：原始版';
            }
        }

        function toggleEnhancerPlayPause() {
            if (!enhancerAudio) return;

            if (enhancerAudio.paused) {
                enhancerAudio.play();
                document.getElementById('enhancerPlayPauseBtn').textContent = '⏸️ 暂停';
                startEnhancerAnimation();
            } else {
                enhancerAudio.pause();
                document.getElementById('enhancerPlayPauseBtn').textContent = '▶️ 播放';
                cancelAnimationFrame(enhancerAnimFrame);
            }
        }

        function stopEnhancerAudio() {
            if (!enhancerAudio) return;

            enhancerAudio.pause();
            enhancerAudio.currentTime = 0;
            document.getElementById('enhancerPlayPauseBtn').textContent = '▶️ 播放';
            cancelAnimationFrame(enhancerAnimFrame);
            updateEnhancerProgress();
            updateEnhancerTime();
        }

        function skipEnhancerForward() {
            if (!enhancerAudio) return;
            enhancerAudio.currentTime = Math.min(enhancerAudio.duration, enhancerAudio.currentTime + 10);
        }

        function skipEnhancerBackward() {
            if (!enhancerAudio) return;
            enhancerAudio.currentTime = Math.max(0, enhancerAudio.currentTime - 10);
        }

        function seekEnhancerWaveform(event) {
            if (!enhancerAudio || !enhancerAudio.duration) return;

            const container = document.getElementById('waveformEnhancer');
            const rect = container.getBoundingClientRect();
            const percent = (event.clientX - rect.left) / rect.width;
            enhancerAudio.currentTime = percent * enhancerAudio.duration;
        }

        function updateEnhancerProgress() {
            if (!enhancerAudio || !enhancerAudio.duration) return;

            const progress = (enhancerAudio.currentTime / enhancerAudio.duration) * 100;
            document.getElementById('progressEnhancer').style.width = progress + '%';
            document.getElementById('playheadEnhancer').style.left = progress + '%';
        }

        function updateEnhancerTime() {
            if (!enhancerAudio) return;

            const current = formatTime(enhancerAudio.currentTime || 0);
            const duration = formatTime(enhancerAudio.duration || 0);
            document.getElementById('enhancerTime').textContent = `${current} / ${duration}`;
        }

        function startEnhancerAnimation() {
            function animate() {
                if (enhancerAudio && !enhancerAudio.paused) {
                    updateEnhancerProgress();
                    updateEnhancerTime();
                    enhancerAnimFrame = requestAnimationFrame(animate);
                }
            }
            enhancerAnimFrame = requestAnimationFrame(animate);
        }

        async function drawEnhancerWaveform(url, type) {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                enhancerWaveformData[type] = audioBuffer;
                
                if (type === enhancerCurrentVersion) {
                    updateEnhancerWaveformDisplay();
                }
            } catch (error) {
                console.error('绘制波形失败:', error);
            }
        }

        function updateEnhancerWaveformDisplay() {
            const canvas = document.getElementById('canvasEnhancer');
            const ctx = canvas.getContext('2d');
            const audioBuffer = enhancerWaveformData[enhancerCurrentVersion];

            if (!audioBuffer) return;

            canvas.width = canvas.parentElement.offsetWidth;
            canvas.height = canvas.parentElement.offsetHeight;

            const data = audioBuffer.getChannelData(0);
            const step = Math.ceil(data.length / canvas.width);
            const amp = canvas.height / 2;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = enhancerCurrentVersion === 'enhanced' ? '#4caf50' : '#2196f3';
            ctx.beginPath();

            for (let i = 0; i < canvas.width; i++) {
                let min = 1.0;
                let max = -1.0;

                for (let j = 0; j < step; j++) {
                    const datum = data[(i * step) + j];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }

                ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
            }
        }

        function downloadEnhanced() {
            if (!enhancerData) return;

            const link = document.createElement('a');
            link.href = enhancerData.enhancedUrl;
            link.download = `enhanced_${enhancerData.originalFilename}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        async function startEnhancerSeparation() {
            if (!enhancerData) return;

            // 获取增强版音频文件
            try {
                const response = await fetch(enhancerData.enhancedUrl);
                const blob = await response.blob();
                const file = new File([blob], `enhanced_${enhancerData.originalFilename}`, { type: blob.type });

                // 停止增强播放器
                stopEnhancerAudio();

                // 隐藏增强播放器，显示处理界面
                document.getElementById('enhancerPlayerView').classList.add('hidden');
                document.getElementById('enhancerPlayerView').classList.remove('active');
                document.getElementById('uploadView').classList.remove('hidden');

                // 设置文件并开始分轨
                selectedFile = file;
                document.getElementById('fileName').textContent = file.name;
                document.getElementById('fileInfo').classList.remove('hidden');

                startProcessing();
            } catch (error) {
                showToast('获取增强音频失败: ' + error.message);
            }
        }

        function formatTime(seconds) {
            if (isNaN(seconds)) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

