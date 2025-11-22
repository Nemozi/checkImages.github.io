import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- Supabase Configuration ---
const SUPABASE_URL = "https://ehkdthdgpqpcxllpslqe.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoa2R0aGRncHFwY3hsbHBzbHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3Mzg0MzksImV4cCI6MjA3OTMxNDQzOX0.GgaILPJ9JcGWBHBG_t9gU40YIc3EEaEpuFrvQzxKzc4"
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const BUCKET_IMAGES = "Images"
const BUCKET_MASKS = "Masks" // Defined for clarity

let currentIndex = 1; // Start at Image_0001

// --- DOM Elements ---
const imageContainer = document.getElementById("image-container");
const imageCanvas = document.getElementById("imageCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const commentField = document.getElementById("comment");
const submitBtn = document.getElementById("submitBtn");

// --- Canvas Contexts ---
const imgCtx = imageCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");

let drawing = false;

// --- Utility Function ---
function formatImageName(index) {
  // e.g., Image_0001.jpg
  return `Image_${String(index).padStart(4,'0')}.jpg`;
}

// ---------------- DRAWING LOGIC ----------------
drawCanvas.addEventListener("mousedown", () => drawing = true);
drawCanvas.addEventListener("mouseup", () => drawing = false);
drawCanvas.addEventListener("mouseout", () => drawing = false);

drawCanvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;

  const rect = drawCanvas.getBoundingClientRect();
  const scaleX = drawCanvas.width / rect.width;
  const scaleY = drawCanvas.height / rect.height;

  // Calculate coordinates relative to the canvas
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // Draw a red, semi-transparent circle for the mask
  drawCtx.fillStyle = "rgba(255,0,0,0.5)";
  drawCtx.beginPath();
  drawCtx.arc(x, y, 6, 0, Math.PI*2);
  drawCtx.fill();
});

// ---------------- LOAD IMAGE ----------------
async function loadImage() {
  const fileName = formatImageName(currentIndex);
  
  // Get the public URL for the image from the 'Images' bucket
  const { data } = supabase.storage.from(BUCKET_IMAGES).getPublicUrl(fileName);
  const url = data?.publicUrl;

  if (!url) {
    // End of images
    imageContainer.innerHTML = "<h2>Danke! Du hast alle Bilder angesehen.</h2>";
    submitBtn.disabled = true;
    return;
  }

  const img = new Image();
  img.src = url;
  img.onload = () => {
    // Calculate scaling to fit the container
    const maxWidth = imageContainer.clientWidth;
    const maxHeight = imageContainer.clientHeight;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height);

    // Set canvas dimensions
    imageCanvas.width = img.width * scale;
    imageCanvas.height = img.height * scale;
    drawCanvas.width = imageCanvas.width;
    drawCanvas.height = imageCanvas.height;

    // Clear previous drawing and draw the new image
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    imgCtx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
  };

  commentField.value = ""; // Clear comment for the new image
}

// ---------------- NEXT IMAGE ----------------
function nextImage() {
  currentIndex++;
  loadImage();
}

// ---------------- SAVE ANNOTATION ----------------
async function saveAnnotation() {
  const fileName = formatImageName(currentIndex);

  // 1. Prepare Mask Data
  // Convert drawn canvas to blob (image data)
  const maskDataUrl = drawCanvas.toDataURL("image/png");
  const response = await fetch(maskDataUrl);
  const maskBlob = await response.blob();

  // Create the requested mask filename: Mask_0001.png
  const maskFileName = `Mask_${String(currentIndex).padStart(4,'0')}.png`; 
  
  // 2. Upload Mask to Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET_MASKS)
    .upload(maskFileName, maskBlob, { 
      cacheControl: '3600', 
      upsert: true // This will overwrite any previous mask for this image
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

  // 4. Cleanup and Next Step
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  commentField.value = "";

  nextImage();
}

submitBtn.addEventListener("click", saveAnnotation);

loadImage();