import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = "https://ehkdthdgpqpcxllpslqe.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoa2R0aGRncHFwY3hsbHBzbHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3Mzg0MzksImV4cCI6MjA3OTMxNDQzOX0.GgaILPJ9JcGWBHBG_t9gU40YIc3EEaEpuFrvQzxKzc4"
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const BUCKET_IMAGES = "Images"
const BUCKET_MASKS = "Masks" 

// Set zum Speichern der bereits vom Benutzer markierten Bild-Dateinamen (z.B. 'Image_0001.jpg')
let markedImageIds = new Set();
let currentIndex = 1; 

const imageContainer = document.getElementById("image-container");
const imageCanvas = document.getElementById("imageCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const commentField = document.getElementById("comment");
const submitBtn = document.getElementById("submitBtn");

const imgCtx = imageCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");

let drawing = false;

// ---------------- USER ID MANAGEMENT ----------------
/**
 * Ruft eine eindeutige, anonyme Benutzer-ID ab. 
 * Speichert die ID im localStorage, um sie bei späteren Besuchen beizubehalten.
 * @returns {string} Die anonyme Benutzer-ID (UUID).
 */
function getUserId() {
  let userId = localStorage.getItem('anon_user_id');
  if (!userId) {
    // Generiere eine neue UUID, wenn keine existiert
    userId = crypto.randomUUID(); 
    localStorage.setItem('anon_user_id', userId);
  }
  return userId;
}

// Global verfügbare Benutzer-ID (kann für Debugging in der Konsole geprüft werden)
const ANONYMOUS_USER_ID = getUserId();
console.log("Current User ID:", ANONYMOUS_USER_ID);

// ---------------- FUNKTIONEN ZUM SKIPGEN MARKIERTER BILDER ----------------

/**
 * Fragt die Supabase-Datenbank ab, um alle Bild-IDs zu erhalten, 
 * die dieser Benutzer bereits annotiert hat.
 */
async function getMarkedImages() {
  const { data, error } = await supabase
    .from("annotations")
    .select("image_id")
    .eq("user_id", ANONYMOUS_USER_ID);

  if (error) {
    console.error("Error fetching marked images:", error);
    // Im Fehlerfall setzen wir das Set auf leer, um den Start nicht zu blockieren
    markedImageIds = new Set();
    return;
  }

  // Befülle das Set für schnelle Lookups
  markedImageIds = new Set(data.map(row => row.image_id));
  console.log(`Found ${markedImageIds.size} images already marked by this user.`);
}

/**
 * Sucht nach dem niedrigsten Index (beginnend bei startFrom), der noch nicht markiert wurde.
 * Dies implementiert das "Springen über bereits markierte Bilder".
 * @param {number} startFrom Der Index, ab dem die Suche beginnen soll.
 * @param {number} maxLimit Der höchste Index, bis zu dem gesucht werden soll. (Standard: 10000)
 * @returns {number} Der nächste unmarkierte Index oder maxLimit + 1 falls nichts gefunden wird.
 */
function findNextUnmarkedIndex(startFrom = 1, maxLimit = 10000) {
    let index = startFrom;
    // Wir suchen bis zum festgelegten Limit (oder bis zum harten Limit 10000, je nachdem, was kleiner ist)
    const effectiveLimit = Math.min(maxLimit, 10000); 

    while (index <= effectiveLimit) { 
        const fileName = formatImageName(index);
        
        if (!markedImageIds.has(fileName)) {
            // Gefunden: Das ist das nächste unmarkierte Bild
            return index;
        }
        index++;
    }
    // Wenn das Limit erreicht ist, geben wir den Wert nach dem Limit zurück.
    return effectiveLimit + 1; 
}

// ---------------- ENDE: FUNKTIONEN ZUM SKIPGEN ----------------


function formatImageName(index) {
  return `Image_${String(index).padStart(4,'0')}.jpg`;
}

drawCanvas.addEventListener("mousedown", () => drawing = true);
drawCanvas.addEventListener("mouseup", () => drawing = false);
drawCanvas.addEventListener("mouseout", () => drawing = false);

drawCanvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;

  const rect = drawCanvas.getBoundingClientRect();
  const scaleX = drawCanvas.width / rect.width;
  const scaleY = drawCanvas.height / rect.height;

  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  drawCtx.fillStyle = "rgba(255,0,0,0.5)";
  drawCtx.beginPath();
  drawCtx.arc(x, y, 6, 0, Math.PI*2);
  drawCtx.fill();
});

async function loadImage() {
  const fileName = formatImageName(currentIndex);
  
  const { data } = supabase.storage.from(BUCKET_IMAGES).getPublicUrl(fileName);
  const url = data?.publicUrl;

  // Wenn der Index außerhalb des Bereichs liegt (z.B. > 10000), oder wenn keine URL gefunden wird
  if (!url || currentIndex > 10000) { 
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

    imageCanvas.width = img.width * scale;
    imageCanvas.height = img.height * scale;
    drawCanvas.width = imageCanvas.width;
    drawCanvas.height = imageCanvas.height;

    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    imgCtx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
  };

  commentField.value = ""; 
}

function nextImage() {
  // Suche nach dem nächsten unmarkierten Bild, beginnend direkt nach dem aktuellen Index
  currentIndex = findNextUnmarkedIndex(currentIndex + 1);
  loadImage();
}

async function saveAnnotation() {
  // Deaktiviere den Button, um doppeltes Senden zu verhindern
  submitBtn.disabled = true; 

  try {
    const fileName = formatImageName(currentIndex);
    const maskDataUrl = drawCanvas.toDataURL("image/png");
    const response = await fetch(maskDataUrl);
    const maskBlob = await response.blob();

    // NEUE NAMENSKONVENTION: Bild-ID_User-ID_Timestamp.png
    const userIdentifier = ANONYMOUS_USER_ID.substring(0, 8); // Gekürzte ID
    const timestamp = Date.now(); // Eindeutiger Zeitstempel
    const maskFileName = `Mask_${String(currentIndex).padStart(4,'0')}_${userIdentifier}_${timestamp}.png`; 
    
    // UPLOAD Maske
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_MASKS)
      .upload(maskFileName, maskBlob, { 
        cacheControl: '3600', 
      });

    if (uploadError) {
      console.error("Error uploading mask:", uploadError);
      // Statt alert() sollten wir eine benutzerdefinierte Meldung im UI anzeigen
      // alert("Fehler beim Speichern der Maske!");
      imageContainer.innerHTML = "<p class='text-red-500'>Fehler beim Speichern der Maske!</p>" + imageContainer.innerHTML;
      return;
    }

    console.log("Mask uploaded:", uploadData);

    // 2. Insert Annotation Record in die Datenbank
    const comment = commentField.value;

    const { data: dbData, error: dbError } = await supabase.from("annotations").insert({
      image_id: fileName,            // Das Originalbild (z.B. Image_0001.jpg)
      user_id: ANONYMOUS_USER_ID,    // Die vollständige UUID des Benutzers
      mask_url: maskFileName,        // Die einzigartige Maskendatei
      comment: comment,              
      created_at: new Date()
    });

    if (dbError) {
      // WICHTIG: Sollte der Datenbank-Insert fehlschlagen, fügen wir die Maske NICHT zum Set hinzu.
      console.error("Error inserting annotation:", dbError);
      // alert("Fehler beim Speichern der Annotation!");
      imageContainer.innerHTML = "<p class='text-red-500'>Fehler beim Speichern der Annotation!</p>" + imageContainer.innerHTML;
      return;
    }

    // Wenn Speichern erfolgreich: Füge die Bild-ID zum Set hinzu, um sie sofort zu überspringen.
    markedImageIds.add(fileName);
    console.log("Annotation saved:", dbData);

    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    commentField.value = "";

    nextImage();

  } finally {
    // Schalte den Button wieder ein
    submitBtn.disabled = false;
  }
}

submitBtn.addEventListener("click", saveAnnotation);


// Läd zunächst die markierten Bilder und startet dann die App
async function startApp() {
    // 1. Markierte Bilder abrufen
    await getMarkedImages();
    
    // 2. Definiere den maximalen Startbereich (z.B. 100), wie gewünscht
    const MAX_START_RANGE = 100;
    
    // 3. Wähle einen zufälligen Startpunkt (zwischen 1 und MAX_START_RANGE)
    const randomStartIndex = Math.floor(Math.random() * MAX_START_RANGE) + 1;
    
    // 4. Suche nach dem nächsten unmarkierten Bild ab dem zufälligen Punkt bis zum Ende des Katalogs
    let nextIndex = findNextUnmarkedIndex(randomStartIndex, 10000); 

    // 5. Wrap-Around-Suche: Wenn ab dem zufälligen Punkt bis 10000 nichts gefunden wurde, 
    //    suche noch einmal am Anfang des Katalogs (von 1 bis randomStartIndex - 1)
    if (nextIndex > 10000) {
        console.log("Full search failed. Attempting wrap-around search from start.");
        nextIndex = findNextUnmarkedIndex(1, randomStartIndex - 1); 
    }
    
    // 6. Setze den Index und lade das Bild
    currentIndex = nextIndex; 
    loadImage();
}

// Starte die Anwendung asynchron
startApp();