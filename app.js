import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- Config ---
const SUPABASE_URL = "https://ehkdthdgpqpcxllpslqe.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoa2R0aGRncHFwY3hsbHBzbHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3Mzg0MzksImV4cCI6MjA3OTMxNDQzOX0.GgaILPJ9JcGWBHBG_t9gU40YIc3EEaEpuFrvQzxKzc4"
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const BUCKET_IMAGES = "Images"
const BUCKET_MASKS = "Masks"
const MAX_IMAGE_COUNT = 10000;
const MARKER_ALPHA = 0.5;
const MARKER_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' height='24' width='24' viewBox='0 0 24 24'><path fill='%23edc531' stroke='%23000' stroke-width='1' d='M17.41 4.59c-.78-.78-2.05-.78-2.83 0L7 12.17V17h4.83l7.59-7.59c.78-.78.78-2.05 0-2.83L17.41 4.59z'/></svg>") 3 17, crosshair`;

// --- DOM Elements ---
const scrollContainer = document.getElementById("scroll-container");
const canvasWrapper = document.getElementById("canvas-wrapper");
const imageCanvas = document.getElementById("imageCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const commentField = document.getElementById("comment");
const submitBtn = document.getElementById("submitBtn");

// Controls
const brushWidthInput = document.getElementById("brushWidth");
const brushValueSpan = document.getElementById("brushValue");
const brushDisplay = document.getElementById("brushValueDisplay");
const zoomInput = document.getElementById("zoomLevel");
const zoomDisplay = document.getElementById("zoomValueDisplay");
const modeBtn = document.getElementById("modeBtn"); // WICHTIG!

const undoBtn = document.getElementById("undoBtn");
const tutorialOverlay = document.getElementById("tutorial-overlay");
const startBtn = document.getElementById("startBtn");
const backBtn = document.getElementById("backBtn");
const ratingBtns = document.querySelectorAll('.rating-btn'); 

// --- State ---
let markedImageIds = new Set();
let currentIndex = 1;
let drawingHistory = [];
let lastX = 0;
let lastY = 0;
let drawing = false;
let brushSize = 12;
let currentRating = null; 
let isDrawingMode = true; // Startet im Mal-Modus

// --- Init Logic ---
if (backBtn) {
    backBtn.addEventListener('click', () => {
        window.location.href = 'index.html'; 
    });
}

if (scrollContainer && drawCanvas) {
    const imgCtx = imageCanvas.getContext("2d");
    const drawCtx = drawCanvas.getContext("2d");

    // Init Cursor
    drawCanvas.style.cursor = MARKER_CURSOR;

    // --- MODUS TOGGLE LOGIK ---
    if (modeBtn) {
        // Hilfsfunktion, um nur den Text im Button zu aktualisieren,
        // ohne die CSS-Pseudo-Elemente (Emojis) zu entfernen.
        function updateModeButtonText(text) {
            // Löscht alle Kindknoten (auch den Text), falls vorhanden
            modeBtn.innerHTML = '';
            // Fügt nur den neuen Text-Knoten hinzu
            modeBtn.appendChild(document.createTextNode(text));
        }

        modeBtn.addEventListener('click', () => {
            isDrawingMode = !isDrawingMode;

            if (isDrawingMode) {
                // -> MALEN: Setzt den reinen Text "Bild verschieben"
                updateModeButtonText("Bild zu verschieben");
                modeBtn.classList.remove("mode-moving"); // Button Style reset
                
                // Entferne Klasse vom Wrapper -> CSS pointer-events: auto greift wieder
                canvasWrapper.classList.remove("move-mode");
                
                drawCanvas.style.cursor = MARKER_CURSOR;
            } else {
                // -> BEWEGEN: Setzt den reinen Text "Weiter malen"
                updateModeButtonText("Weiter zu malen");
                modeBtn.classList.add("mode-moving"); 
                
                canvasWrapper.classList.add("move-mode");
                
                drawCanvas.style.cursor = "grab";
            }
        });
    }

    // --- ZOOM LOGIK ---
    if (zoomInput) {
        zoomInput.addEventListener('input', (e) => {
            const zoomVal = e.target.value;
            zoomDisplay.textContent = zoomVal + "%";
            canvasWrapper.style.width = zoomVal + "%";
            canvasWrapper.style.height = zoomVal + "%";
        });
    }

    // --- UI Helpers ---
    if (startBtn && tutorialOverlay) {
        startBtn.addEventListener('click', () => {
            tutorialOverlay.classList.add('hidden');
        });
    }

    if (brushWidthInput) {
        brushWidthInput.addEventListener("input", (e) => {
            brushSize = parseInt(e.target.value);
            brushValueSpan.textContent = brushSize;
            brushDisplay.textContent = brushSize;
        });
    }

    ratingBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentRating = parseInt(btn.dataset.value);
            ratingBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    // --- Drawing ---
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
    }

    // --- Events ---
    drawCanvas.addEventListener("pointerdown", (e) => {
        // WICHTIG: Wenn wir im Move-Modus sind, sollte das CSS (pointer-events: none)
        // verhindern, dass wir hier überhaupt landen. Falls doch -> Abbrechen.
        if (!isDrawingMode) return; 

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

    drawCanvas.addEventListener("pointerup", () => drawing = false);
    drawCanvas.addEventListener("pointercancel", () => drawing = false);
    drawCanvas.addEventListener("pointerout", () => drawing = false);

    undoBtn.addEventListener("click", () => {
        if (drawingHistory.length > 0) {
            const lastState = drawingHistory.pop();
            drawCtx.putImageData(lastState, 0, 0);
        } else {
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
    });

    submitBtn.addEventListener("click", saveAnnotation);

    // --- Data ---
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

    function getNextRandomIndex() {
        const poolA = [];
        for (let i = 1; i <= 100; i++) {
            if (!markedImageIds.has(formatImageName(i))) poolA.push(i);
        }
        if (poolA.length > 0) return poolA[Math.floor(Math.random() * poolA.length)];

        let j = 101;
        while (j <= MAX_IMAGE_COUNT) {
            if (!markedImageIds.has(formatImageName(j))) return j;
            j++;
        }
        return null; 
    }

    async function getMarkedImages() {
        const { data, error } = await supabase
            .from("annotations")
            .select("image_id")
            .eq("user_id", ANONYMOUS_USER_ID);

        if (!error) markedImageIds = new Set(data.map(r => r.image_id));
    }

    async function loadImage() {
        if (!currentIndex) {
            scrollContainer.innerHTML = "<div style='padding:20px; text-align:center;'><h2>Danke! Du hast alle Bilder angesehen.</h2></div>";
            submitBtn.disabled = true;
            return;
        }

        const fileName = formatImageName(currentIndex);
        const { data } = supabase.storage.from(BUCKET_IMAGES).getPublicUrl(fileName);
        const url = data?.publicUrl;

        const img = new Image();
        img.src = url;
        img.onload = () => {
            const maxWidth = scrollContainer.clientWidth;
            const maxHeight = scrollContainer.clientHeight;
            const scale = Math.min(maxWidth / img.width, maxHeight / img.height);

            imageCanvas.width = drawCanvas.width = img.width * scale;
            imageCanvas.height = drawCanvas.height = img.height * scale;

            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            imgCtx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
            drawingHistory = [];
            
            // Reset UI
            if (zoomInput) {
                zoomInput.value = 100;
                zoomDisplay.textContent = "100%";
                canvasWrapper.style.width = "100%";
                canvasWrapper.style.height = "100%";
            }
            
            // Reset Mode
            isDrawingMode = true;
            if(modeBtn) {
                // Fügt den reinen Text "Bild verschieben" hinzu
                modeBtn.innerHTML = ''; 
                modeBtn.appendChild(document.createTextNode("Bild zu verschieben"));
                
                modeBtn.classList.remove("mode-moving");
            }
            canvasWrapper.classList.remove("move-mode");
            drawCanvas.style.cursor = MARKER_CURSOR;
            
            // Reset Rating
            currentRating = null;
            ratingBtns.forEach(b => b.classList.remove('selected'));
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
                rating: currentRating, 
                created_at: new Date()
            });
            if (dbError) throw dbError;

            markedImageIds.add(fileName);
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            commentField.value = "";
            document.querySelectorAll('input[name="issues"]').forEach(cb => cb.checked = false);
            
            currentIndex = getNextRandomIndex();
            loadImage();
        } catch (err) {
            console.error(err);
            alert("Fehler beim Speichern.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Absenden & Nächstes Bild";
        }
    }

    async function startApp() {
        await getMarkedImages();
        currentIndex = getNextRandomIndex();
        loadImage();
    }
    
    startApp();
}