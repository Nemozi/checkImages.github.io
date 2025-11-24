import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = "https://ehkdthdgpqpcxllpslqe.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoa2R0aGRncHFwY3hsbHBzbHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3Mzg0MzksImV4cCI6MjA3OTMxNDQzOX0.GgaILPJ9JcGWBHBG_t9gU40YIc3EEaEpuFrvQzxKzc4"
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const BUCKET_IMAGES = "Images"
const BUCKET_MASKS = "Masks"
const MAX_IMAGE_COUNT = 10000;

let markedImageIds = new Set();
let currentIndex = 1;
let drawingHistory = [];

const imageContainer = document.getElementById("image-container");
const imageCanvas = document.getElementById("imageCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const commentField = document.getElementById("comment");
const submitBtn = document.getElementById("submitBtn");
const brushWidthInput = document.getElementById("brushWidth");
const brushValueSpan = document.getElementById("brushValue");
const undoBtn = document.getElementById("undoBtn");

const imgCtx = imageCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");

let hue = 0;
let lastX = 0;
let lastY = 0;
let drawing = false;
let brushSize = 12;

const MARKER_ALPHA = 0.5;

brushWidthInput.addEventListener("input", (e) => {
    brushSize = parseInt(e.target.value);
    brushValueSpan.textContent = brushSize;
});

function saveState() {
    drawingHistory.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
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

    hue++;
    if (hue >= 360) hue = 0;
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

drawCanvas.addEventListener("pointerdown", (e) => {
    // Verhindert Text-Auswahl oder Zoom-Gestures beim Start
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
    // WICHTIG: Verhindert, dass Android beim Malen die Seite scrollt oder refresht
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

function getUserId() {
    let userId = localStorage.getItem('anon_user_id');
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem('anon_user_id', userId);
    }
    return userId;
}
const ANONYMOUS_USER_ID = getUserId();

async function getMarkedImages() {
    const { data, error } = await supabase
        .from("annotations")
        .select("image_id")
        .eq("user_id", ANONYMOUS_USER_ID);

    if (!error) markedImageIds = new Set(data.map(r => r.image_id));
}

function findNextUnmarkedIndex(startFrom = 1, maxLimit = MAX_IMAGE_COUNT) {
    let index = startFrom;
    const top = Math.min(maxLimit, MAX_IMAGE_COUNT);
    while (index <= top) {
        if (!markedImageIds.has(formatImageName(index)))
            return index;
        index++;
    }
    return top + 1;
}

function formatImageName(i) {
    return `Image_${String(i).padStart(4, "0")}.jpg`;
}

async function loadImage() {
    const fileName = formatImageName(currentIndex);
    const { data } = supabase.storage.from(BUCKET_IMAGES).getPublicUrl(fileName);
    const url = data?.publicUrl;

    if (!url || currentIndex > MAX_IMAGE_COUNT) {
        imageContainer.innerHTML = "<h2>Danke! Du hast alle Bilder angesehen.</h2>";
        submitBtn.disabled = true;
        return;
    }

    const img = new Image();
    img.src = url;

    img.onload = () => {
        const maxWidth = imageContainer.clientWidth;
        const maxHeight = imageContainer.clientHeight;
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height);

        imageCanvas.width = drawCanvas.width = img.width * scale;
        imageCanvas.height = drawCanvas.height = img.height * scale;

        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        imgCtx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
        drawingHistory = [];
    };

    commentField.value = "";
}

function nextImage() {
    currentIndex = findNextUnmarkedIndex(currentIndex + 1);
    loadImage();
}

async function saveAnnotation() {
    submitBtn.disabled = true;
    submitBtn.textContent = "Wird gespeichert..."; // Kleines UX Feedback

    try {
        const fileName = formatImageName(currentIndex);

        const maskUrl = exportMask(0.4);
        const blob = await (await fetch(maskUrl)).blob();

        const userCode = ANONYMOUS_USER_ID.substring(0, 8);
        const timestamp = Date.now();
        const maskFileName = `Mask_${String(currentIndex).padStart(4,'0')}_${userCode}_${timestamp}.png`;

        // Upload Maske
        const { error: uploadError } = await supabase.storage
            .from(BUCKET_MASKS)
            .upload(maskFileName, blob);

        if (uploadError) {
            console.error(uploadError);
            alert("Fehler beim Upload der Maske.");
            return;
        }

        // ---------------------------------------------------------
        // NEU: Checkboxen auslesen
        // ---------------------------------------------------------
        const checkboxes = document.querySelectorAll('input[name="issues"]:checked');
        const selectedTags = Array.from(checkboxes).map(cb => cb.value);
        // ---------------------------------------------------------

        // Daten in DB schreiben
        const { error: dbError } = await supabase.from("annotations").insert({
            image_id: fileName,
            user_id: ANONYMOUS_USER_ID,
            mask_url: maskFileName,
            comment: commentField.value,
            tags: selectedTags, // Hier fügen wir das Array hinzu
            created_at: new Date()
        });

        if (dbError) {
            console.error("DB Error:", dbError);
            alert("Fehler beim Speichern der Daten.");
            return;
        }

        markedImageIds.add(fileName);
        
        // Reset Canvas und Formular
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        commentField.value = "";
        
        // Checkboxen zurücksetzen
        document.querySelectorAll('input[name="issues"]').forEach(cb => cb.checked = false);

        nextImage();
    } catch (err) {
        console.error("Unexpected error:", err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Absenden & Nächstes Bild";
    }
}

submitBtn.addEventListener("click", saveAnnotation);

async function startApp() {
    await getMarkedImages();

    const randomStart = Math.floor(Math.random() * 100) + 1;
    currentIndex = findNextUnmarkedIndex(randomStart);
    if (currentIndex > MAX_IMAGE_COUNT)
        currentIndex = findNextUnmarkedIndex(1, randomStart - 1);

    loadImage();
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
startApp();
const tutorialOverlay = document.getElementById("tutorial-overlay");
const startTutorialBtn = document.getElementById("startBtn");

if(startTutorialBtn) {
    startTutorialBtn.addEventListener("click", () => {
        tutorialOverlay.classList.add("hidden");
    });
}
document.addEventListener('DOMContentLoaded', () => {
      const overlay = document.getElementById('tutorial-overlay');
      const startBtn = document.getElementById('startBtn');
      
      if(startBtn && overlay) {
        startBtn.addEventListener('click', () => {
          overlay.classList.add('hidden');
        });
      }

      const slider = document.getElementById('brushWidth');
      const display = document.getElementById('brushValueDisplay');
      const hiddenSpan = document.getElementById('brushValue');

      if (slider && display && hiddenSpan) {
        slider.value = 12; 
        display.textContent = "12";
        hiddenSpan.textContent = "12";

        slider.addEventListener('input', (e) => {
          display.textContent = e.target.value;
          hiddenSpan.textContent = e.target.value;
        });
      }
    });
