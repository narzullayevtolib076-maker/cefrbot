/**
 * IELTS Speaking Test - Telegram Web App Script
 * Features: 10s Countdown Start Screen, Auto-finish vs Cancel distinction
 */

window.onload = function () {
    // 1. Initialize Telegram Web App
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.expand();
        window.Telegram.WebApp.ready();
    }

    // 2. Elements Mapping
    const startScreen = document.getElementById('start-screen');
    const appContent = document.getElementById('app-content');
    const startButton = document.getElementById('start-button');
    const countdownDisplay = document.getElementById('countdown-display');
    const prepareMessage = document.getElementById('prepare-message');

    const partHeader = document.querySelector('.part-header');
    const questionText = document.querySelector('.question-text');
    const progressBar = document.getElementById('progress-bar');
    const imageSlot = document.getElementById('image-slot');
    const questionImage = document.getElementById('question-image');
    const cancelBtn = document.getElementById('cancel-btn');
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // 3. URL Parameters
    const urlParams = new URLSearchParams(window.location.search);
    const p = urlParams.get('p') || "1";
    const q = urlParams.get('q') || "Please answer the question accurately.";
    const t = parseInt(urlParams.get('t')) || 60;
    const img = urlParams.get('img');

    // 4. Initial UI Setup (Still from parameters)
    if (partHeader) partHeader.textContent = "PART " + p;
    if (questionText) questionText.textContent = q;
    if (img) {
        questionImage.src = img;
        imageSlot.classList.remove('hidden');
    }

    // 5. Global State
    let timerInterval;
    let audioContext, analyser, dataArray, animationId;

    // 6. Start Button Event
    startButton.addEventListener('click', () => {
        startButton.style.display = 'none';
        countdownDisplay.style.display = 'block';
        prepareMessage.style.display = 'block';

        startPrepCountdown();
    });

    function startPrepCountdown() {
        let count = 10;
        countdownDisplay.textContent = count;

        const countdownTimer = setInterval(() => {
            count--;
            countdownDisplay.textContent = count;

            // Subtle pop animation
            countdownDisplay.style.animation = 'none';
            void countdownDisplay.offsetWidth; // trigger reflow
            countdownDisplay.style.animation = 'scaleIn 0.5s ease';

            if (count === 0) {
                clearInterval(countdownTimer);
                beginTest();
            }
        }, 1000);
    }

    function beginTest() {
        // Hide Start Screen
        startScreen.style.opacity = '0';
        startScreen.style.visibility = 'hidden';

        // Show Content
        appContent.style.visibility = 'visible';
        appContent.style.opacity = '1';

        // Initialize Audio and Main Timer
        initAudio();
        startMainTimer();
    }

    // 7. Main Timer Logic
    function startMainTimer() {
        const startTime = Date.now();
        const endTime = startTime + t * 1000;

        timerInterval = setInterval(() => {
            const now = Date.now();
            const diff = endTime - now;

            if (diff <= 0) {
                clearInterval(timerInterval);
                autoFinish();
                return;
            }

            const percentage = (diff / (t * 1000)) * 100;
            progressBar.style.width = `${percentage}%`;

            if (percentage < 25) {
                progressBar.style.background = '#ff4141';
            } else if (percentage < 50) {
                progressBar.style.background = '#ffcc00';
            }
        }, 50);
    }

    // 8. Real-time Audio Visualizer
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
        } catch (err) {
            console.error("Microphone access error:", err);
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
        ctx.strokeStyle = '#00d2ff';
        ctx.lineCap = 'round';
        for (let x = 0; x < displayWidth; x++) {
            const y = displayHeight / 2 + Math.sin(x * 0.05 + fallbackOffset) * 12;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        fallbackOffset += 0.1;
    }

    // 9. Completion Logic
    function autoFinish() {
        console.log("Timer expired. Auto-submitting data...");
        cleanup();

        const result = {
            status: "auto_finished",
            part: p,
            question: q,
            duration: t
        };

        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.sendData(JSON.stringify(result));
            window.Telegram.WebApp.close();
        }
    }

    function cancelTest() {
        console.log("Test cancelled by user.");
        cleanup();
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.close();
        }
    }

    function cleanup() {
        clearInterval(timerInterval);
        if (animationId) cancelAnimationFrame(animationId);
        if (audioContext) audioContext.close();
    }

    // Event Listeners
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelTest);
    }
};
