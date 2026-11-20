// The paper texture of the Player. #31 sets the URL. While it is null, the
// Start gate does not wait for a texture and SceneView gets none.
export const PAPER_TEXTURE_URL: string | null = null;

// Resolves when the browser can draw the texture; a rejection is a failed
// first-page file.
export function loadTexture(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  return img.decode();
}
