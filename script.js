/**
 * IELTS Speaking Test - Telegram Web App Script (Full Optimized)
 * Features: Auto-UI update on finish, n8n Integration, Visualizer
 */

const N8N_UPLOAD_URL = "https://infotutor.app.n8n.cloud/webhook/voice-analysis";
const N8N_GET_QUESTION_URL = "https://infotutor.app.n8n.cloud/webhook/get-question";

window.onload = function () {
    const tg = window.Telegram.WebApp;
    if (tg) {
        tg.expand();
        tg.ready();
    }

    // Elements
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
    const cancelBtn = document.getElementById('cancel-btn');
    const recordingStatus = document.querySelector('.recording-status') || document.createElement('div');
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // State
    let currentPart = "1";
    let currentQuestion = "";
    let currentTimeLimit = 60;
    let isAutoFinish = false;
    let timerInterval;
    let audioContext, analyser, dataArray, animationId;
    let mediaRecorder;
    let audioChunks = [];
    let streamRef = null;

    // 1. FETCH QUESTION
    window.selectPart = async function (partNum) {
        partButtons.style.display = 'none';
        selectionTitle.style.display = 'none';
        loadingSpinner.style.display = 'flex';

        try {
            const response = await fetch(N8N_GET_QUESTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ part: partNum })
            });
            const data = await response.json();
            currentPart = data.part || partNum;
            currentQuestion = data.question || "No question provided.";
            currentTimeLimit = parseInt(data.time) || 60;

            partHeaderText.textContent = "PART " + currentPart;
            questionElement.textContent = currentQuestion;

            loadingSpinner.style.display = 'none';
            countdownDisplay.style.display = 'block';
            prepareMessage.style.display = 'block';
            startPrepCountdown();
        } catch (error) {
            tg.showAlert("Savollarni yuklab bo'lmadi.");
            loadingSpinner.style.display = 'none';
            partButtons.style.display = 'flex';
        }
    };

    // 2. COUNTDOWN
    function startPrepCountdown() {
        let count = 10;
        countdownDisplay.textContent = count;
        const countdownTimer = setInterval(() => {
            count--;
            countdownDisplay.textContent = count;
            if (count === 0) {
                clearInterval(countdownTimer);
                beginTest();
            }
        }, 1000);
    }

    function beginTest() {
        startScreen.style.display = 'none';
        appContent.style.visibility = 'visible';
        appContent.style.opacity = '1';
        initAudio();
        startMainTimer();
    }

    // 3. TIMER
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
        }, 50);
    }

    // 4. AUDIO
    async function initAudio() {
        try {
            streamRef = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(streamRef);
            analyser.fftSize = 128;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            source.connect(analyser);

            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            draw();

            mediaRecorder = new MediaRecorder(streamRef);
            audioChunks = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = async () => { if (isAutoFinish) await uploadRecording(); };
            mediaRecorder.start();
        } catch (err) {
            tg.showAlert("Mikrofonni yoqing!");
        }
    }

    function draw() {
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let x = 0;
        const barWidth = (canvas.width / dataArray.length) * 2;
        for (let i = 0; i < dataArray.length; i++) {
            let barHeight = (dataArray[i] / 255) * canvas.height;
            ctx.fillStyle = '#00d2ff';
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
            x += barWidth;
        }
    }

    // 5. AUTO FINISH & UPLOAD
    function autoFinish() {
        isAutoFinish = true;
        
        // INTERFEYSNI O'ZGARTIRISH
        if (recordingStatus) recordingStatus.textContent = "⌛ SENDING TO AI...";
        if (cancelBtn) cancelBtn.style.display = 'none'; // Foydalanuvchi adashib bosmasligi uchun yashiramiz
        
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        cleanup(false);
    }

    async function uploadRecording() {
        if (loadingSpinner) {
            loadingSpinner.style.display = 'flex';
            loadingSpinner.querySelector('p').textContent = "Analyzing your speech...";
        }

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const chatId = tg.initDataUnsafe?.user?.id || "unknown";

        const formData = new FormData();
        formData.append('audio', audioBlob, `speaking_${currentPart}_${chatId}.webm`);
        formData.append('chat_id', chatId);
        formData.append('part', currentPart);
        formData.append('question', currentQuestion);

        try {
            const response = await fetch(N8N_UPLOAD_URL, { method: 'POST', body: formData });
            if (response.ok) {
                tg.showAlert("✅ Tahlil yakunlandi! Natijani Telegram botingizga yubordik.", () => {
                    tg.close();
                });
            } else {
                throw new Error();
            }
        } catch (e) {
            tg.showAlert("❌ Xatolik: Ovoz yuborilmadi.");
            if (cancelBtn) cancelBtn.style.display = 'block';
        } finally {
            if (loadingSpinner) loadingSpinner.style.display = 'none';
        }
    }

    function cancelTest() {
        isAutoFinish = false;
        cleanup(true);
        if (tg) tg.close();
    }

    function cleanup(stopMic) {
        clearInterval(timerInterval);
        if (animationId) cancelAnimationFrame(animationId);
        if (audioContext) audioContext.close();
        if (stopMic && streamRef) {
            streamRef.getTracks().forEach(track => track.stop());
        }
    }

    if (cancelBtn) cancelBtn.addEventListener('click', cancelTest);
};
