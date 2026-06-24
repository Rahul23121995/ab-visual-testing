import fs from 'fs';
import path from 'path';

/**
 * Downloads Figma design frame PNG using the Figma REST API.
 * Falls back to local mockup spec if API variables are not configured.
 */
export async function getFigmaDesignReference(config) {
  const outputDir = path.join(process.cwd(), 'reports', 'visual');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const localSpecPath = path.join(outputDir, 'figma_design_reference.png');
  const { figma } = config;

  if (figma && figma.fileKey && figma.nodeId) {
    const token = figma.token || process.env.FIGMA_TOKEN;
    if (token) {
      console.log(`[Figma] Connecting to Figma API: FileKey=${figma.fileKey}, NodeId=${figma.nodeId}...`);
      try {
        // Fetch rendered frame PNG URL from Figma REST API
        const res = await fetch(`https://api.figma.com/v1/images/${figma.fileKey}?ids=${figma.nodeId}&format=png`, {
          headers: { 'X-Figma-Token': token }
        });
        
        if (!res.ok) {
          throw new Error(`Figma API returned status ${res.status}`);
        }
        
        const data = await res.json();
        const imageUrl = data.images[figma.nodeId];
        
        if (!imageUrl) {
          throw new Error(`Could not find render output URL for frame: ${figma.nodeId}`);
        }

        // Download PNG file
        console.log(`[Figma] Downloading rendered design asset...`);
        const imgRes = await fetch(imageUrl);
        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        fs.writeFileSync(localSpecPath, buffer);
        console.log(`[Figma] Successfully downloaded design reference: ${localSpecPath}`);
        return { source: 'Figma API Live Sync', path: localSpecPath };
      } catch (err) {
        console.warn(`[Figma Warning] Live Figma sync failed: ${err.message}. Falling back to mock copy...`);
      }
    } else {
      console.log(`[Figma] Config found but no Personal Access Token provided. Using mock reference fallback.`);
    }
  }

  // Fallback: If no figma config or no token, copy Control page screenshot or create a dummy to compare code vs spec
  const controlName = config.variants && config.variants.control ? (config.variants.control.name || 'control') : 'control';
  const defaultViewport = config.visual && config.visual.viewports && config.visual.viewports[0] ? config.visual.viewports[0].name : 'desktop';
  const defaultBrowser = config.visual && config.visual.browsers && config.visual.browsers[0] ? config.visual.browsers[0] : 'chromium';
  const controlFileName = `${defaultViewport}_${defaultBrowser}_baseline_${controlName}.png`;
  const controlPath = path.join(outputDir, controlFileName);
  if (fs.existsSync(controlPath)) {
    // We create a mock "Figma Spec" copy by just using the control screenshot. 
    // This allows the diff engine to run Figma-vs-Variant comparisons!
    fs.copyFileSync(controlPath, localSpecPath);
    return { source: 'Local Figma Design Mockup (Control page copy)', path: localSpecPath };
  }

  return null;
}
