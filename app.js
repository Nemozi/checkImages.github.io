import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
import Panzoom from 'https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.5.1/+esm'

// --- CONFIG ---
const SUPABASE_URL = "https://ehkdthdgpqpcxllpslqe.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoa2R0aGRncHFwY3hsbHBzbHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3Mzg0MzksImV4cCI6MjA3OTMxNDQzOX0.GgaILPJ9JcGWBHBG_t9gU40YIc3EEaEpuFrvQzxKzc4"
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const BUCKET_IMAGES = "Images"
const BUCKET_MASKS = "Masks"
const MAX_IMAGE_COUNT = 10000;
const MARKER_ALPHA = 0.5;
const MARKER_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' height='24' width='24' viewBox='0 0 24 24'><path fill='%23edc531' stroke='%23000' stroke-width='1' d='M17.41 4.59c-.78-.78-2.05-.78-2.83 0L7 12.17V17h4.83l7.59-7.59c.78-.78.78-2.05 0-2.83L17.41 4.59z'/></svg>") 3 17, crosshair`;

// --- DOM ELEMENTS ---
const viewportContainer = document.getElementById("image-viewport");
const canvasWrapper = document.getElementById("canvas-wrapper");
const imageCanvas = document.getElementById("imageCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const commentField = document.getElementById("comment");
const submitBtn = document.getElementById("submitBtn");
const brushWidthInput = document.getElementById("brushWidth");
const brushValueSpan = document.getElementById("brushValue");
const brushDisplay = document.getElementById("brushValueDisplay");
const undoBtn = document.getElementById("undoBtn");
const tutorialOverlay = document.getElementById("tutorial-overlay");
const startBtn = document.getElementById("startBtn");
const backBtn = document.getElementById("backBtn");

// --- GLOBAL STATE ---
let markedImageIds = new Set();
let currentIndex = 1;
let drawingHistory = [];
let hue = 0;
let lastX = 0;
let lastY = 0;
let drawing = false;
let brushSize = 12;

// --- INFO PAGE LOGIC ---
if (backBtn) {
    backBtn.addEventListener('click', () => {
        window.location.href = 'index.html'; 
    });
}

// --- MAIN APP LOGIC ---
if (viewportContainer && drawCanvas) {
    const imgCtx = imageCanvas.getContext("2d");
    const drawCtx = drawCanvas.getContext("2d");

    // Panzoom Setup
    const panzoom = Panzoom(canvasWrapper, {
        maxScale: 5,
        minScale: 1,
        contain: 'outside',
        cursor: 'default',
        noMouse: true,
        beforeTouchStart: (e) => e.touches.length === 1,
        beforeTouchMove: (e) => e.touches.length < 2
    });

    drawCanvas.style.cursor = MARKER_CURSOR;

    // UI: Tutorial Overlay
    if (startBtn && tutorialOverlay) {
        startBtn.addEventListener('click', () => {
            tutorialOverlay.classList.add('hidden');
        });
    }

    // UI: Slider Logic
    if (brushWidthInput && brushDisplay && brushValueSpan) {
        // Init values
        brushWidthInput.value = brushSize;
        brushDisplay.textContent = brushSize;
        brushValueSpan.textContent = brushSize;

        brushWidthInput.addEventListener("input", (e) => {
            brushSize = parseInt(e.target.value);
            brushValueSpan.textContent = brushSize;
            brushDisplay.textContent = brushSize;
        });
    }

    // Drawing Logic
    function saveState() {
        drawingHistory.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    }

    function getCanvasCoordinates(clientX, clientY) {
        const rect = drawCanvas.getBoundingClientRect();
        const scaleX = drawCanvas.width / rect.width;
        const scaleY = drawCanvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function draw(e) {
        if (!drawing) return;

        const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
        const dx = x - lastX;
        const dy = y - lastY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.ceil(distance / (brushSize / 3));

        for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const ix = lastX + dx * t;
            const iy = lastY + dy * t;

            drawCtx.fillStyle = `rgba(255, 0, 0, ${MARKER_ALPHA})`;
            drawCtx.beginPath();
            drawCtx.arc(ix, iy, brushSize / 2, 0, Math.PI * 2);
            drawCtx.fill();
        }

        lastX = x;
        lastY = y;
        hue = (hue + 1) % 360;
    }

    // Event Listeners: Drawing
    drawCanvas.addEventListener("pointerdown", (e) => {
        if (!e.isPrimary && e.pointerType === 'touch') return;
        e.preventDefault();
        drawing = true;
        saveState();
        const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
        lastX = x;
        lastY = y;
        draw(e);
    });

    drawCanvas.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        e.preventDefault();
        draw(e);
    });

    drawCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) {
            drawing = false;
            drawCtx.beginPath();
        }
    });

    drawCanvas.addEventListener("pointerup", () => drawing = false);
    drawCanvas.addEventListener("pointercancel", () => drawing = false);
    drawCanvas.addEventListener("pointerout", () => drawing = false);

    // Event Listeners: Buttons
    undoBtn.addEventListener("click", () => {
        if (drawingHistory.length > 0) {
            const lastState = drawingHistory.pop();
            drawCtx.putImageData(lastState, 0, 0);
        } else {
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
    });

    submitBtn.addEventListener("click", saveAnnotation);

    // Helper Functions
    function getUserId() {
        let userId = localStorage.getItem('anon_user_id');
        if (!userId) {
            userId = crypto.randomUUID();
            localStorage.setItem('anon_user_id', userId);
        }
        return userId;
    }
    const ANONYMOUS_USER_ID = getUserId();

    function formatImageName(i) {
        return `Image_${String(i).padStart(4, "0")}.jpg`;
    }

    function exportMask(alpha = 0.4) {
        const merged = document.createElement("canvas");
        merged.width = drawCanvas.width;
        merged.height = drawCanvas.height;
        const mctx = merged.getContext("2d");
        mctx.clearRect(0, 0, merged.width, merged.height);
        mctx.globalAlpha = alpha;
        mctx.drawImage(drawCanvas, 0, 0);
        return merged.toDataURL("image/png");
    }

    function findNextUnmarkedIndex(startFrom = 1, maxLimit = MAX_IMAGE_COUNT) {
        let index = startFrom;
        const top = Math.min(maxLimit, MAX_IMAGE_COUNT);
        while (index <= top) {
            if (!markedImageIds.has(formatImageName(index))) return index;
            index++;
        }
        return top + 1;
    }

    // Async Functions
    async function getMarkedImages() {
        const { data, error } = await supabase
            .from("annotations")
            .select("image_id")
            .eq("user_id", ANONYMOUS_USER_ID);

        if (!error) markedImageIds = new Set(data.map(r => r.image_id));
    }

    async function loadImage() {
        const fileName = formatImageName(currentIndex);
        const { data } = supabase.storage.from(BUCKET_IMAGES).getPublicUrl(fileName);
        const url = data?.publicUrl;

        if (!url || currentIndex > MAX_IMAGE_COUNT) {
            viewportContainer.innerHTML = "<div style='padding:20px; text-align:center;'><h2>Danke! Du hast alle Bilder angesehen.</h2></div>";
            submitBtn.disabled = true;
            return;
        }

        const img = new Image();
        img.src = url;
        img.onload = () => {
            const maxWidth = viewportContainer.clientWidth;
            const maxHeight = viewportContainer.clientHeight;
            const scale = Math.min(maxWidth / img.width, maxHeight / img.height);

            imageCanvas.width = drawCanvas.width = img.width * scale;
            imageCanvas.height = drawCanvas.height = img.height * scale;

            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            imgCtx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
            drawingHistory = [];
            panzoom.reset();
        };
        commentField.value = "";
    }

    async function saveAnnotation() {
        submitBtn.disabled = true;
        submitBtn.textContent = "Wird gespeichert...";

        try {
            const fileName = formatImageName(currentIndex);
            const maskUrl = exportMask(0.4);
            const blob = await (await fetch(maskUrl)).blob();

            const userCode = ANONYMOUS_USER_ID.substring(0, 8);
            const maskFileName = `Mask_${String(currentIndex).padStart(4, '0')}_${userCode}_${Date.now()}.png`;

            const { error: uploadError } = await supabase.storage.from(BUCKET_MASKS).upload(maskFileName, blob);
            if (uploadError) throw uploadError;

            const checkboxes = document.querySelectorAll('input[name="issues"]:checked');
            const selectedTags = Array.from(checkboxes).map(cb => cb.value);

            const { error: dbError } = await supabase.from("annotations").insert({
                image_id: fileName,
                user_id: ANONYMOUS_USER_ID,
                mask_url: maskFileName,
                comment: commentField.value,
                tags: selectedTags,
                created_at: new Date()
            });
            if (dbError) throw dbError;

            markedImageIds.add(fileName);
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            commentField.value = "";
            document.querySelectorAll('input[name="issues"]').forEach(cb => cb.checked = false);

            currentIndex = findNextUnmarkedIndex(currentIndex + 1);
            loadImage();
        } catch (err) {
            console.error(err);
            alert("Fehler beim Speichern.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Absenden & Nächstes Bild";
        }
    }

    // Start App
    async function startApp() {
        await getMarkedImages();
        const randomStart = Math.floor(Math.random() * 100) + 1;
        currentIndex = findNextUnmarkedIndex(randomStart);
        if (currentIndex > MAX_IMAGE_COUNT) currentIndex = findNextUnmarkedIndex(1, randomStart - 1);
        loadImage();
    }
    
    startApp();
}