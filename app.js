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

        // Canvas-based starfield for better performance
        let starsData = [];
        let starsCanvas, starsCtx;
        
        function createStars() {
            starsCanvas = document.getElementById('starsCanvas');
            starsCtx = starsCanvas.getContext('2d');
            
            // 设置canvas尺寸
            function resizeCanvas() {
                starsCanvas.width = window.innerWidth;
                starsCanvas.height = window.innerHeight;
            }
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
            
            // 生成星星数据
            const starCount = 2000;
            starsData = [];
            
            for (let i = 0; i < starCount; i++) {
                const x = Math.random() * starsCanvas.width;
                
                // 星星分布：顶部密集，底部稀疏
                const distribution = Math.pow(Math.random(), 1.5);
                const y = distribution * starsCanvas.height * 0.7;
                
                // 不同大小的星星
                const rand = Math.random();
                let size, baseOpacity, twinkleSpeed, twinkleOffset;
                
                if (rand < 0.03) {
                    // 3% 大星星
                    size = Math.random() * 2 + 3;
                    baseOpacity = Math.random() * 0.3 + 0.7;
                    twinkleSpeed = Math.random() * 0.02 + 0.01;
                } else if (rand < 0.15) {
                    // 12% 中等星星
                    size = Math.random() * 1.5 + 2;
                    baseOpacity = Math.random() * 0.3 + 0.4;
                    twinkleSpeed = Math.random() * 0.015 + 0.008;
                } else {
                    // 85% 小星星
                    size = Math.random() * 1.5 + 0.5;
                    baseOpacity = Math.random() * 0.3 + 0.2;
                    twinkleSpeed = Math.random() * 0.01 + 0.005;
                }
                
                // 根据位置调整亮度
                const brightnessFactor = Math.max(0.1, 1 - (y / (starsCanvas.height * 0.7)) * 0.8);
                
                starsData.push({
                    x, y, size,
                    baseOpacity: baseOpacity * brightnessFactor,
                    twinkleSpeed,
                    twinkleOffset: Math.random() * Math.PI * 2,
                    isBright: rand < 0.03
                });
            }
            
            // 开始动画循环
            animateStars();
        }
        
        function animateStars() {
            const time = Date.now() * 0.001;
            
            starsCtx.clearRect(0, 0, starsCanvas.width, starsCanvas.height);
            
            starsData.forEach(star => {
                // 计算闪烁效果
                const twinkle = Math.sin(time * star.twinkleSpeed * 10 + star.twinkleOffset);
                const opacity = star.baseOpacity * (0.5 + twinkle * 0.5);
                
                // 绘制星星
                starsCtx.beginPath();
                starsCtx.arc(star.x, star.y, star.size / 2, 0, Math.PI * 2);
                starsCtx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                starsCtx.fill();
                
                // 大星星添加光晕
                if (star.isBright) {
                    starsCtx.beginPath();
                    starsCtx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2);
                    starsCtx.fillStyle = `rgba(200, 220, 255, ${opacity * 0.2})`;
                    starsCtx.fill();
                }
            });
            
            requestAnimationFrame(animateStars);
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
            if (!audioElements.vocals || !audioElements.drums || !audioElements.bass || !audioElements.other) return;

            const duration = audioElements.vocals.duration || 0;
            const time = progress * duration;

            audioElements.vocals.currentTime = time;
            audioElements.drums.currentTime = time;
            audioElements.bass.currentTime = time;
            audioElements.other.currentTime = time;

            updatePlayheadUI(progress);
        }

        function seekWaveform(track, e) {
            if (!audioElements.vocals) return;
            
            // 点击波形时也暂停
            const wasPlaying = !audioElements.vocals.paused;
            if (wasPlaying) {
                pauseAllAudio();
            }
            
            const container = document.getElementById('waveform' + track.charAt(0).toUpperCase() + track.slice(1));
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const progress = x / rect.width;
            
            seekTo(progress);
            
            // 如果之前在播放则继续播放
            if (wasPlaying) {
                playAllAudio();
            }
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
                
                let apiUrl = '/api/separate';
                let successMessage = '分离成功';
                
                if (processMode === 'convert-and-separate') {
                    apiUrl = '/api/convert-and-separate';
                    formData.append('output_format', outputFormat);
                    successMessage = '转换并分离成功';
                }
                
                console.log(`开始发送请求到 ${apiUrl}...`);
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    body: formData
                });
                
                console.log('收到响应:', response.status);
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || '处理失败');
                }
                
                const data = await response.json();
                console.log(successMessage, data);

                clearInterval(animateProgress);
                progressFill.style.width = '100%';
                progressText.textContent = '100%';

                currentUrls.vocals = data.vocals_url;
                currentUrls.drums = data.drums_url;
                currentUrls.bass = data.bass_url;
                currentUrls.other = data.other_url;
                currentFileName = selectedFile ? selectedFile.name : '';

                const addBtn = document.getElementById('addToLibraryBtn');
                if (addBtn) {
                    addBtn.classList.remove('added');
                    addBtn.innerHTML = '⭐ 收入素材库';
                }

                await initAudioElements(data.vocals_url, data.drums_url, data.bass_url, data.other_url);

                setTimeout(() => {
                    switchProcessingView('player');
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

        async function initAudioElements(vocalsUrl, drumsUrl, bassUrl, otherUrl) {
            console.log('初始化音频元素...');
            console.log('人声 URL:', vocalsUrl);
            console.log('鼓组 URL:', drumsUrl);
            console.log('贝斯 URL:', bassUrl);
            console.log('其他 URL:', otherUrl);

            audioElements.vocals = new Audio(vocalsUrl);
            audioElements.drums = new Audio(drumsUrl);
            audioElements.bass = new Audio(bassUrl);
            audioElements.other = new Audio(otherUrl);

            const tracks = ['vocals', 'drums', 'bass', 'other'];
            tracks.forEach(track => {
                audioElements[track].crossOrigin = "anonymous";
                audioElements[track].preload = "auto";
            });

            // 等待所有轨道加载完成
            await Promise.all(tracks.map(track =>
                new Promise(resolve => audioElements[track].addEventListener('loadedmetadata', resolve))
            ));

            console.log('音频元数据加载完成');
            console.log('人声时长:', audioElements.vocals.duration);

            audioElements.vocals.addEventListener('timeupdate', onTimeUpdate);
            audioElements.vocals.addEventListener('ended', onAudioEnded);

            audioElements.vocals.volume = 0.8;
            audioElements.drums.volume = 0.7;
            audioElements.bass.volume = 0.7;
            audioElements.other.volume = 0.7;

            setupTimelineMarkers();

            // 等待页面显示后再绘制波形
            setTimeout(() => {
                console.log('开始绘制备用波形...');
                tracks.forEach(track => drawSimpleWaveform(track));
            }, 300);

            // 然后尝试加载真实波形
            setTimeout(async () => {
                try {
                    console.log('开始加载真实波形...');
                    await renderWaveforms(vocalsUrl, drumsUrl, bassUrl, otherUrl);
                } catch (e) {
                    console.error('真实波形渲染失败，保留备用波形:', e);
                }
            }, 600);
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

            if (!audioElements.vocals || !audioElements.drums || !audioElements.bass || !audioElements.other) return;

            // 同步所有轨道
            const tracks = ['drums', 'bass', 'other'];
            tracks.forEach(track => {
                if (Math.abs(audioElements.vocals.currentTime - audioElements[track].currentTime) > 0.1) {
                    audioElements[track].currentTime = audioElements.vocals.currentTime;
                }
            });

            const progress = audioElements.vocals.currentTime / audioElements.vocals.duration;
            updatePlayheadUI(progress);
        }

        function onAudioEnded() {
            stopAllAudio();
        }

        function updatePlayheadUI(progress) {
            const timelineFill = document.getElementById('timelineFill');
            const timelineHandle = document.getElementById('timelineHandle');
            const timelineTime = document.getElementById('timelineTime');
            
            if (timelineFill) {
                timelineFill.style.width = (progress * 100) + '%';
            }
            if (timelineHandle) {
                timelineHandle.style.left = (progress * 100) + '%';
            }
            
            if (audioElements.vocals && timelineTime) {
                const current = formatTime(audioElements.vocals.currentTime);
                const total = formatTime(audioElements.vocals.duration || 0);
                timelineTime.textContent = `${current} / ${total}`;
            }
            
            ['Vocals', 'Drums', 'Bass', 'Other'].forEach(track => {
                const trackLower = track.toLowerCase();
                const progressEl = document.getElementById('progress' + track);
                const playheadEl = document.getElementById('playhead' + track);
                
                if (progressEl) {
                    progressEl.style.width = (progress * 100) + '%';
                }
                if (playheadEl) {
                    playheadEl.style.left = (progress * 100) + '%';
                }
            });
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
            
            if (view === 'upload') {
                document.getElementById('uploadView').classList.remove('hidden');
            } else if (view === 'processing') {
                document.getElementById('processingView').classList.remove('hidden');
                document.getElementById('processingView').classList.add('active');
            } else if (view === 'player') {
                document.getElementById('playerView').classList.remove('hidden');
                document.getElementById('playerView').classList.add('active');
            }
        }

        function togglePlayPause() {
            if (!audioElements.vocals || !audioElements.drums || !audioElements.bass || !audioElements.other) return;

            if (audioElements.vocals.paused) {
                audioElements.vocals.play();
                audioElements.drums.play();
                audioElements.bass.play();
                audioElements.other.play();
                updatePlayPauseButton(false);
            } else {
                audioElements.vocals.pause();
                audioElements.drums.pause();
                audioElements.bass.pause();
                audioElements.other.pause();
                updatePlayPauseButton(true);
            }
        }

        function updatePlayPauseButton(isPaused) {
            const btn = document.getElementById('playPauseBtn');
            if (btn) {
                if (isPaused) {
                    btn.innerHTML = '▶️ 播放';
                } else {
                    btn.innerHTML = '⏸️ 暂停';
                }
            }
        }

        function playAllAudio() {
            if (!audioElements.vocals || !audioElements.drums || !audioElements.bass || !audioElements.other) return;

            audioElements.vocals.play();
            audioElements.drums.play();
            audioElements.bass.play();
            audioElements.other.play();
            updatePlayPauseButton(false);
        }

        function pauseAllAudio() {
            if (!audioElements.vocals || !audioElements.drums || !audioElements.bass || !audioElements.other) return;

            audioElements.vocals.pause();
            audioElements.drums.pause();
            audioElements.bass.pause();
            audioElements.other.pause();
            updatePlayPauseButton(true);
        }

        function stopAllAudio() {
            if (!audioElements.vocals || !audioElements.drums || !audioElements.bass || !audioElements.other) return;

            audioElements.vocals.pause();
            audioElements.vocals.currentTime = 0;
            audioElements.drums.pause();
            audioElements.drums.currentTime = 0;
            audioElements.bass.pause();
            audioElements.bass.currentTime = 0;
            audioElements.other.pause();
            audioElements.other.currentTime = 0;
            updatePlayPauseButton(true);
            updatePlayheadUI(0);
        }

        function skipForward() {
            if (!audioElements.vocals) return;
            const newTime = Math.min(audioElements.vocals.currentTime + 10, audioElements.vocals.duration);
            seekTo(newTime / audioElements.vocals.duration);
        }

        function skipBackward() {
            if (!audioElements.vocals) return;
            const newTime = Math.max(audioElements.vocals.currentTime - 10, 0);
            seekTo(newTime / audioElements.vocals.duration);
        }

        function toggleMute(track) {
            isMuted[track] = !isMuted[track];
            const btn = document.getElementById('mute' + track.charAt(0).toUpperCase() + track.slice(1));
            
            if (audioElements[track]) {
                audioElements[track].muted = isMuted[track];
            }
            
            if (isMuted[track]) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }

        function toggleSolo(track) {
            isSolo[track] = !isSolo[track];
            const allTracks = ['vocals', 'drums', 'bass', 'other'];

            const btn = document.getElementById('solo' + track.charAt(0).toUpperCase() + track.slice(1));

            if (isSolo[track]) {
                btn.classList.add('active');
                // 取消其他轨道的 solo
                allTracks.forEach(t => {
                    if (t !== track) {
                        isSolo[t] = false;
                        const otherBtn = document.getElementById('solo' + t.charAt(0).toUpperCase() + t.slice(1));
                        if (otherBtn) otherBtn.classList.remove('active');
                        if (audioElements[t]) audioElements[t].muted = true;
                    }
                });
                if (audioElements[track]) audioElements[track].muted = isMuted[track];
            } else {
                btn.classList.remove('active');
                // 检查是否还有其他 solo 轨道
                const hasSolo = allTracks.some(t => isSolo[t]);
                if (!hasSolo) {
                    // 恢复所有轨道的静音状态
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
            console.log('开始渲染波形...');
            const tracks = ['vocals', 'drums', 'bass', 'other'];
            const urls = [vocalsUrl, drumsUrl, bassUrl, otherUrl];
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const buffers = await Promise.all(urls.map(url => fetchAudioBuffer(audioContext, url)));
                console.log('音频缓冲解码成功');
                tracks.forEach((track, i) => drawWaveform(track, buffers[i]));
            } catch (e) {
                console.error('波形渲染失败:', e);
                console.error('使用备用波形');
                tracks.forEach(track => drawSimpleWaveform(track));
            }
        }

        async function fetchAudioBuffer(audioContext, url) {
            console.log('获取音频:', url);
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            console.log('音频数据获取成功，开始解码...');
            return await audioContext.decodeAudioData(arrayBuffer);
        }

        function drawWaveform(track, buffer) {
            console.log('绘制', track, '波形');
            const canvasId = 'canvas' + track.charAt(0).toUpperCase() + track.slice(1);
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                console.error('找不到 canvas:', canvasId);
                return;
            }
            const ctx = canvas.getContext('2d');
            const container = canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;
            
            canvas.width = container.clientWidth * dpr;
            canvas.height = container.clientHeight * dpr;
            canvas.style.width = container.clientWidth + 'px';
            canvas.style.height = container.clientHeight + 'px';
            
            const width = canvas.width;
            const height = canvas.height;
            const channelData = buffer.getChannelData(0);
            const samplesPerPixel = Math.max(1, Math.floor(channelData.length / width));
            
            ctx.clearRect(0, 0, width, height);
            
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            if (track === 'vocals') {
                gradient.addColorStop(0, 'rgba(255, 152, 0, 1)');
                gradient.addColorStop(0.5, 'rgba(255, 193, 7, 0.8)');
                gradient.addColorStop(1, 'rgba(255, 152, 0, 0.4)');
            } else {
                gradient.addColorStop(0, 'rgba(33, 150, 243, 1)');
                gradient.addColorStop(0.5, 'rgba(103, 58, 183, 0.8)');
                gradient.addColorStop(1, 'rgba(33, 150, 243, 0.4)');
            }
            ctx.fillStyle = gradient;
            
            const centerY = height / 2;
            const barWidth = Math.max(2, dpr * 2);
            
            for (let x = 0; x < width; x += barWidth) {
                let min = 1;
                let max = -1;
                for (let i = 0; i < samplesPerPixel; i++) {
                    const index = x * samplesPerPixel + i;
                    if (index < channelData.length) {
                        const sample = channelData[index];
                        if (sample < min) min = sample;
                        if (sample > max) max = sample;
                    }
                }
                const amplitudeY = (max - min) * (height / 3);
                const yTop = centerY - amplitudeY;
                const barHeight = Math.max(1, amplitudeY * 2);
                ctx.fillRect(x, yTop, barWidth - 0.5, barHeight);
            }
            console.log(track, '波形绘制完成');
        }

        function drawSimpleWaveform(track) {
            console.log('绘制备用波形:', track);
            const canvasId = 'canvas' + track.charAt(0).toUpperCase() + track.slice(1);
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                console.error('Canvas not found:', canvasId);
                return;
            }
            const ctx = canvas.getContext('2d');
            const container = canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;
            
            canvas.width = container.clientWidth * dpr;
            canvas.height = container.clientHeight * dpr;
            canvas.style.width = container.clientWidth + 'px';
            canvas.style.height = container.clientHeight + 'px';
            
            const width = canvas.width;
            const height = canvas.height;
            
            ctx.clearRect(0, 0, width, height);
            
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            if (track === 'vocals') {
                gradient.addColorStop(0, 'rgba(255, 107, 107, 1)');
                gradient.addColorStop(0.5, 'rgba(255, 159, 64, 1)');
                gradient.addColorStop(1, 'rgba(255, 159, 64, 0.4)');
            } else {
                gradient.addColorStop(0, 'rgba(79, 195, 247, 1)');
                gradient.addColorStop(0.5, 'rgba(144, 164, 174, 1)');
                gradient.addColorStop(1, 'rgba(79, 195, 247, 0.4)');
            }
            ctx.fillStyle = gradient;
            
            const centerY = height / 2;
            const barWidth = Math.max(3, dpr * 3);
            for (let x = 0; x < width; x += barWidth + 1) {
                const t = x / width;
                const amplitude = (height / 3) * (0.3 + 0.7 * Math.abs(Math.sin(t * Math.PI * 10)));
                const y = centerY - amplitude;
                const barHeight = Math.max(2, amplitude * 2);
                ctx.fillRect(x, y, barWidth, barHeight);
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
            if (!currentUrls.vocals || !currentUrls.drums || !currentUrls.bass || !currentUrls.other) {
                showToast('请先进行音频分离！');
                return;
            }

            const btn = document.getElementById('addToLibraryBtn');
            if (btn.classList.contains('added')) {
                showToast('已收入素材库');
                return;
            }

            const name = currentFileName || '未命名音频';

            try {
                const response = await fetch('/api/library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        vocals_url: currentUrls.vocals,
                        drums_url: currentUrls.drums,
                        bass_url: currentUrls.bass,
                        other_url: currentUrls.other
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

                    currentUrls.vocals = item.vocals_url;
                    currentUrls.drums = item.drums_url || null;
                    currentUrls.bass = item.bass_url || null;
                    currentUrls.other = item.other_url || null;
                    currentFileName = item.name;

                    if (hasAllTracks) {
                        await initAudioElements(item.vocals_url, item.drums_url, item.bass_url, item.other_url);
                    } else {
                        showToast('此素材为旧格式，请重新分离以获得四轨效果');
                        return;
                    }

                    switchProcessingView('player');

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
            document.getElementById('enhancerPlayerView').classList.remove('hidden');
            document.getElementById('enhancerPlayerView').classList.add('active');

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

