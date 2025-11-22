import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = "https://ehkdthdgpqpcxllpslqe.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoa2R0aGRncHFwY3hsbHBzbHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3Mzg0MzksImV4cCI6MjA3OTMxNDQzOX0.GgaILPJ9JcGWBHBG_t9gU40YIc3EEaEpuFrvQzxKzc4"
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const BUCKET_IMAGES = "Images"
const BUCKET_MASKS = "Masks" 

let currentIndex = 1; 

const imageContainer = document.getElementById("image-container");
const imageCanvas = document.getElementById("imageCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const commentField = document.getElementById("comment");
const submitBtn = document.getElementById("submitBtn");

const imgCtx = imageCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");

let drawing = false;

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

  if (!url) {
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
  currentIndex++;
  loadImage();
}

async function saveAnnotation() {
  const fileName = formatImageName(currentIndex);
  const maskDataUrl = drawCanvas.toDataURL("image/png");
  const response = await fetch(maskDataUrl);
  const maskBlob = await response.blob();

  const maskFileName = `Mask_${String(currentIndex).padStart(4,'0')}.png`; 
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET_MASKS)
    .upload(maskFileName, maskBlob, { 
      cacheControl: '3600', 
      upsert: true 
    });

  if (uploadError) {
    console.error("Error uploading mask:", uploadError);
    alert("Fehler beim Speichern der Maske!");
    return;
  }

  console.log("Mask uploaded:", uploadData);

  // 3. Insert Annotation Record into Database
  const comment = commentField.value;

  const { data: dbData, error: dbError } = await supabase.from("annotations").insert({
    image_id: fileName, // The original image file name
    user_id: "anon",    // Placeholder user ID
    mask_url: maskFileName, // Link to the uploaded mask
    comment: comment,   // The user's explanatory text
    created_at: new Date()
  });

  if (dbError) {
    console.error("Error inserting annotation:", dbError);
    alert("Fehler beim Speichern der Annotation!");
    return;
  }

  console.log("Annotation saved:", dbData);

  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  commentField.value = "";

  nextImage();
}

submitBtn.addEventListener("click", saveAnnotation);

loadImage();