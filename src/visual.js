import { chromium, firefox, webkit } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

/**
 * Pads a PNG image to target dimensions.
 * Useful if layout changes cause Control and Variant to have different heights or widths.
 */
function padImage(srcPng, targetWidth, targetHeight) {
  const dstPng = new PNG({
    width: targetWidth,
    height: targetHeight,
    colorType: 6,
    inputHasAlpha: true
  });
  
  // Initialize destination with transparent pixels
  for (let i = 0; i < dstPng.data.length; i++) {
    dstPng.data[i] = 0;
  }

  // Copy original pixels
  for (let y = 0; y < srcPng.height; y++) {
    for (let x = 0; x < srcPng.width; x++) {
      const srcIdx = (srcPng.width * y + x) << 2;
      const dstIdx = (targetWidth * y + x) << 2;
      dstPng.data[dstIdx] = srcPng.data[srcIdx];
      dstPng.data[dstIdx + 1] = srcPng.data[srcIdx + 1];
      dstPng.data[dstIdx + 2] = srcPng.data[srcIdx + 2];
      dstPng.data[dstIdx + 3] = srcPng.data[srcIdx + 3];
    }
  }
  return dstPng;
}

export function compareImages(imgPath1, imgPath2, diffPath, threshold = 0.1) {
  let img1 = PNG.sync.read(fs.readFileSync(imgPath1));
  let img2 = PNG.sync.read(fs.readFileSync(imgPath2));

  const maxWidth = Math.max(img1.width, img2.width);
  const maxHeight = Math.max(img1.height, img2.height);

  if (img1.width !== maxWidth || img1.height !== maxHeight) {
    img1 = padImage(img1, maxWidth, maxHeight);
  }
  if (img2.width !== maxWidth || img2.height !== maxHeight) {
    img2 = padImage(img2, maxWidth, maxHeight);
  }

  const diff = new PNG({ width: maxWidth, height: maxHeight });

  const mismatchedPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    maxWidth,
    maxHeight,
    { threshold }
  );

  const totalPixels = maxWidth * maxHeight;
  const mismatchRatio = mismatchedPixels / totalPixels;
  const mismatchPercentage = (mismatchRatio * 100).toFixed(2);

  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  return {
    width: maxWidth,
    height: maxHeight,
    mismatchedPixels,
    mismatchPercentage: parseFloat(mismatchPercentage),
    mismatchRatio
  };
}

/**
 * Runs Playwright-style baseline variations visual regression testing.
 * Pre-captures baseline variants, captures candidate screens, and matches each candidate against all baselines.
 */
export async function runVisualRegression(config) {
  const outputDir = path.join(process.cwd(), 'reports', 'visual');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[Visual] Starting Playwright cross-browser visual regression...`);
  
  const results = [];
  const { targetUrl, visual, baselines, candidates } = config;
  
  let baselinesList = baselines;
  if (!baselinesList || !Array.isArray(baselinesList)) {
    if (config.variants && config.variants.control) {
      baselinesList = [{
        name: config.variants.control.name || 'control',
        url: config.variants.control.url || targetUrl,
        cookie: config.variants.control.cookie
      }];
    } else {
      baselinesList = [];
    }
  }

  let candidatesList = candidates;
  if (!candidatesList || !Array.isArray(candidatesList)) {
    if (config.variants && config.variants.variant) {
      candidatesList = [{
        name: config.variants.variant.name || 'variant',
        url: config.variants.variant.url || targetUrl,
        cookie: config.variants.variant.cookie
      }];
    } else {
      candidatesList = [];
    }
  }
  const viewports = visual.viewports || [{ width: 1280, height: 800, name: 'desktop' }];
  const browsers = visual.browsers || ['chromium'];
  const maxAllowed = visual.mismatchThreshold || 0.05;

  const getBrowserType = (name) => {
    if (name === 'firefox') return firefox;
    if (name === 'webkit') return webkit;
    return chromium;
  };

  const applySessionCookies = async (context, currentDomain) => {
    if (config.sessionCookies && Array.isArray(config.sessionCookies)) {
      const cookies = config.sessionCookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || currentDomain,
        path: c.path || '/'
      }));
      await context.addCookies(cookies);
    }
  };

  for (const browserName of browsers) {
    console.log(`[Visual] Launching browser engine: "${browserName}"...`);
    const browserType = getBrowserType(browserName);
    const browser = await browserType.launch({
      headless: true
    });

    try {
      // 1. Capture All Baselines
      for (const b of baselinesList) {
        console.log(`[Visual] [${browserName}] Pre-capturing Baseline variant: "${b.name}"`);
        const bUrl = b.url || targetUrl;
        const bDomain = new URL(bUrl).hostname;

        for (const viewport of viewports) {
          console.log(`  └─ Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
          
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height }
          });
          const page = await context.newPage();
          
          if (b.cookie) {
            await context.addCookies([{
              name: b.cookie.name,
              value: b.cookie.value,
              domain: bDomain,
              path: '/'
            }]);
          }
          await applySessionCookies(context, bDomain);

          await page.goto(bUrl, { waitUntil: 'networkidle' });
          // Wait for rendering stability
          await new Promise(resolve => setTimeout(resolve, 800));

          const baselinePath = path.join(outputDir, `${viewport.name}_${browserName}_baseline_${b.name}.png`);
          await page.screenshot({ path: baselinePath, fullPage: true });
          await context.close();
        }
      }

      // 2. Capture All Candidates & Run Multi-Comparison
      for (const c of candidatesList) {
        console.log(`[Visual] [${browserName}] Capturing Candidate under test: "${c.name}"`);
        const cUrl = c.url || targetUrl;
        const cDomain = new URL(cUrl).hostname;

        for (const viewport of viewports) {
          console.log(`  └─ Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
          
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height }
          });
          const page = await context.newPage();

          if (c.cookie) {
            await context.addCookies([{
              name: c.cookie.name,
              value: c.cookie.value,
              domain: cDomain,
              path: '/'
            }]);
          }
          await applySessionCookies(context, cDomain);

          await page.goto(cUrl, { waitUntil: 'networkidle' });
          await new Promise(resolve => setTimeout(resolve, 800));

          const candidatePath = path.join(outputDir, `${viewport.name}_${browserName}_candidate_${c.name}.png`);
          await page.screenshot({ path: candidatePath, fullPage: true });
          await context.close();

          // Compare candidate against all baselines
          const comparisons = {};
          let bestComp = null;
          let bestBaseline = null;

          for (const b of baselinesList) {
            const baselinePath = path.join(outputDir, `${viewport.name}_${browserName}_baseline_${b.name}.png`);
            const diffPath = path.join(outputDir, `${viewport.name}_${browserName}_candidate_${c.name}_diff_vs_${b.name}.png`);

            console.log(`  └─ Comparing candidate vs baseline "${b.name}"...`);
            const comp = compareImages(baselinePath, candidatePath, diffPath, 0.1);
            const passed = comp.mismatchRatio <= maxAllowed;

            comparisons[b.name] = {
              baselineFile: `visual/${viewport.name}_${browserName}_baseline_${b.name}.png`,
              diffFile: `visual/${viewport.name}_${browserName}_candidate_${c.name}_diff_vs_${b.name}.png`,
              mismatchPercentage: comp.mismatchPercentage,
              mismatchedPixels: comp.mismatchedPixels,
              passed
            };

            if (bestComp === null || comp.mismatchRatio < bestComp.mismatchRatio) {
              bestComp = { ...comp, passed };
              bestBaseline = b;
            }
          }

          console.log(`[Visual] [${browserName}] Candidate "${c.name}" (${viewport.name}): Matches baseline "${bestBaseline.name}" closest (Mismatch: ${bestComp.mismatchPercentage}%). Passed = ${bestComp.passed}`);

          results.push({
            candidateName: c.name,
            browser: browserName,
            viewport: viewport.name,
            width: bestComp.width,
            height: bestComp.height,
            passed: bestComp.passed,
            bestMatch: bestBaseline.name,
            bestMismatchPercentage: bestComp.mismatchPercentage,
            bestMismatchedPixels: bestComp.mismatchedPixels,
            candidateFile: `visual/${viewport.name}_${browserName}_candidate_${c.name}.png`,
            comparisons
          });
        }
      }
    } finally {
      await browser.close();
    }
  }

  return results;
}

