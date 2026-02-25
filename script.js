/**
 * IELTS Speaking Test - Telegram Web App Script
 * Features: Dynamic Part Selection, n8n Question Fetch, Audio Recording, Webhook Integration
 */

// --- CONFIGURATION ---
// "webhook-test" so'zini "webhook" ga almashtiring
const N8N_UPLOAD_URL = "https://infotutor.app.n8n.cloud/webhook/voice-analysis";
const N8N_GET_QUESTION_URL = "https://infotutor.app.n8n.cloud/webhook/get-question";

window.onload = function () {
    const tg = window.Telegram.WebApp;
    if (tg) {
        tg.expand();
        tg.ready();
    }

    // Elements Mapping
    const startScreen = document.getElementById('start-screen');
    const appContent = document.getElementById('app-content');
    const partButtons = document.getElementById('part-buttons');
    const selectionTitle = document.getElementById('selection-title');
    const loadingSpinner = document.getElementById('loading-spinner');
    const countdownDisplay = document.getElementById('countdown-display');
    const prepareMessage = document.getElementById('prepare-message');

    const partHeaderText = document.querySelector('.part-header');
    const questionElement = document.querySelector('.question-text');
    const progressBar = document.getElementById('progress-bar');
    const imageSlot = document.getElementById('image-slot');
    const questionImage = document.getElementById('question-image');
    const cancelBtn = document.getElementById('cancel-btn');
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // State Variables
    let currentPart = "1";
    let currentQuestion = "";
    let currentTimeLimit = 60;
    let currentImageUrl = null;

    let timerInterval;
    let audioContext, analyser, dataArray, animationId;
    let mediaRecorder;
    let audioChunks = [];

    // 1. SELECT PART & FETCH QUESTION
    window.selectPart = async function (partNum) {
        // Show Loading UI
        partButtons.style.display = 'none';
        selectionTitle.style.display = 'none';
        loadingSpinner.style.display = 'flex';
        loadingSpinner.classList.remove('hidden');
        loadingSpinner.classList.add('visible');

        try {
            const response = await fetch(N8N_GET_QUESTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ part: partNum })
            });

            if (!response.ok) throw new Error("Savolni yuklab bo'lmadi");

            const data = await response.json();

            // Priority to n8n data, fallback to defaults/params
            currentPart = data.part || partNum;
            currentQuestion = data.question || "No question provided.";
            currentTimeLimit = parseInt(data.time) || 60;
            currentImageUrl = data.image || null;

            // Setup UI for Main Test
            if (partHeaderText) partHeaderText.textContent = "PART " + currentPart;
            if (questionElement) questionElement.textContent = currentQuestion;
            if (currentImageUrl) {
                questionImage.src = currentImageUrl;
                imageSlot.classList.remove('hidden');
            } else {
                imageSlot.classList.add('hidden');
            }

            // Hide Loading, Start Countdown
            loadingSpinner.style.display = 'none';
            countdownDisplay.style.display = 'block';
            prepareMessage.style.display = 'block';
            startPrepCountdown();

        } catch (error) {
            console.error("Fetch Error:", error);
            tg.showAlert("Xatolik: Savolni yuklashda muammo yuz berdi. Iltimos, qayta urinib ko'ring.");
            // Reset UI
            partButtons.style.display = 'flex';
            selectionTitle.style.display = 'block';
            loadingSpinner.style.display = 'none';
        }
    };

    // 2. PREP COUNTDOWN
    function startPrepCountdown() {
        let count = 10;
        countdownDisplay.textContent = count;

        const countdownTimer = setInterval(() => {
            count--;
            countdownDisplay.textContent = count;

            countdownDisplay.style.animation = 'none';
            void countdownDisplay.offsetWidth;
            countdownDisplay.style.animation = 'scaleIn 0.5s ease';

            if (count === 0) {
                clearInterval(countdownTimer);
                beginTest();
            }
        }, 1000);
    }

    function beginTest() {
        startScreen.style.opacity = '0';
        startScreen.style.visibility = 'hidden';
        setTimeout(() => startScreen.style.display = 'none', 500);

        appContent.style.visibility = 'visible';
        appContent.style.opacity = '1';

        initAudio();
        startMainTimer();
    }

    // 3. MAIN TEST TIMER
    function startMainTimer() {
        const startTime = Date.now();
        const endTime = startTime + currentTimeLimit * 1000;

        timerInterval = setInterval(() => {
            const now = Date.now();
            const diff = endTime - now;

            if (diff <= 0) {
                clearInterval(timerInterval);
                autoFinish();
                return;
            }

            const percentage = (diff / (currentTimeLimit * 1000)) * 100;
            progressBar.style.width = `${percentage}%`;

            if (percentage < 25) {
                progressBar.style.background = '#ff4141';
            } else if (percentage < 50) {
                progressBar.style.background = '#ffcc00';
            }
        }, 50);
    }

    // 4. AUDIO & VISUALIZER
    async function initAudio() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            source.connect(analyser);

            canvas.width = canvas.offsetWidth * window.devicePixelRatio;
            canvas.height = canvas.offsetHeight * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            draw();

            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                if (window.isAutoFinish) await uploadRecording();
            };

            mediaRecorder.start();
        } catch (err) {
            console.error("Mic Access Error:", err);
            drawFallback();
        }
    }

    function draw() {
        const displayWidth = canvas.offsetWidth;
        const displayHeight = canvas.offsetHeight;
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, displayWidth, displayHeight);

        const barWidth = (displayWidth / dataArray.length) * 2.5;
        let x = 0;
        for (let i = 0; i < dataArray.length; i++) {
            let barHeight = (dataArray[i] / 255) * displayHeight;
            const gradient = ctx.createLinearGradient(0, displayHeight, 0, displayHeight - barHeight);
            gradient.addColorStop(0, 'rgba(0, 210, 255, 0.1)');
            gradient.addColorStop(1, '#00d2ff');
            ctx.fillStyle = gradient;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#00d2ff';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, displayHeight - barHeight, barWidth - 2, barHeight, 4);
            else ctx.rect(x, displayHeight - barHeight, barWidth - 2, barHeight);
            ctx.fill();
            x += barWidth;
        }
    }

    let fallbackOffset = 0;
    function drawFallback() {
        const displayWidth = canvas.offsetWidth;
        const displayHeight = canvas.offsetHeight;
        animationId = requestAnimationFrame(drawFallback);
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ff4141';
        ctx.lineCap = 'round';
        for (let x = 0; x < displayWidth; x++) {
            const y = displayHeight / 2 + Math.sin(x * 0.05 + fallbackOffset) * 12;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        fallbackOffset += 0.1;
    }

    // 5. UPLOAD TO n8n
    async function uploadRecording() {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const chatId = tg.initDataUnsafe?.user?.id || "unknown";

        const formData = new FormData();
        formData.append('audio', audioBlob, `speaking_${currentPart}_${chatId}.webm`);
        formData.append('part', currentPart);
        formData.append('question', currentQuestion);
        formData.append('chat_id', chatId);

        try {
            const response = await fetch(N8N_UPLOAD_URL, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                tg.showAlert("Imtihon yakunlandi. Ovoz muvaffaqiyatli yuborildi!", () => {
                    tg.close();
                });
            } else {
                throw new Error("Upload fail");
            }
        } catch (e) {
            console.error(e);
            tg.showAlert("Xatolik: Ovozni yuborishda muammo yuz berdi.");
        }
    }

    function autoFinish() {
        window.isAutoFinish = true;
        cleanup();
    }

    function cancelTest() {
        window.isAutoFinish = false;
        cleanup();
        if (tg) tg.close();
    }

    function cleanup() {
        clearInterval(timerInterval);
        if (animationId) cancelAnimationFrame(animationId);
        if (audioContext) audioContext.close();
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
    }

    if (cancelBtn) cancelBtn.addEventListener('click', cancelTest);
};




