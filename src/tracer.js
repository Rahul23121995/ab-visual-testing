import { chromium } from 'playwright';

/**
 * Executes a simulated browser flow, intercepts network requests,
 * and validates that expected telemetry goal-events are successfully fired.
 */
export async function traceTelemetry(config) {
  const browser = await chromium.launch({
    headless: true
  });

  const results = {
    control: [],
    variant: []
  };

  try {
    const { targetUrl, tracing, variants } = config;

    for (const variantKey of ['control', 'variant']) {
      const variantValue = variants[variantKey].cookie.value;
      console.log(`[Tracer] Initiating telemetry tracing for variant [${variantKey.toUpperCase()}] (${variantValue})`);
      
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
      });
      const page = await context.newPage();
      
      const capturedTelemetryRequests = [];
      
      // Record telemetry requests passively
      page.on('request', request => {
        const url = request.url();
        if (url.includes('/api/telemetry')) {
          capturedTelemetryRequests.push({
            url,
            method: request.method(),
            postData: request.postData()
          });
        }
      });

      // Determine active target URL and domain for this variant
      const activeUrl = variants[variantKey].url || targetUrl;
      const activeUrlObj = new URL(activeUrl);
      const activeDomain = activeUrlObj.hostname;

      // Apply A/B variant cookie
      await context.addCookies([{
        name: variants[variantKey].cookie.name,
        value: variantValue,
        domain: activeDomain,
        path: '/'
      }]);

      // Apply session cookies if configured
      if (config.sessionCookies && Array.isArray(config.sessionCookies)) {
        const cookies = config.sessionCookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain || activeDomain,
          path: c.path || '/'
        }));
        await context.addCookies(cookies);
      }

      const steps = tracing.simulationSteps || [];
      const evaluation = [];

      for (const step of steps) {
        console.log(`[Tracer] Executing step: "${step.name}" (${step.action})`);
        
        try {
          if (step.action === 'navigate') {
            await page.goto(activeUrl, { waitUntil: 'networkidle' });
          } else if (step.action === 'click') {
            await page.waitForSelector(step.selector, { timeout: 3000 });
            await page.click(step.selector);
          } else if (step.action === 'type') {
            await page.waitForSelector(step.selector, { timeout: 3000 });
            await page.fill(step.selector, step.value);
          }
          
          // Brief pause for network transmission
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (stepErr) {
          console.error(`[Tracer] Error during step "${step.name}":`, stepErr.message);
        }

        // Validate telemetry for this step
        const spec = step.expectedTelemetry;
        if (spec) {
          const matchingCalls = capturedTelemetryRequests.filter(req => {
            if (!req.url.includes(spec.urlPattern)) return false;
            if (spec.payload && req.postData) {
              try {
                const body = JSON.parse(req.postData);
                // Check that all key/values in expected payload are present in actual telemetry payload
                return Object.keys(spec.payload).every(key => body[key] === spec.payload[key]);
              } catch (e) {
                return false;
              }
            }
            return true;
          });

          const passed = matchingCalls.length > 0;
          
          evaluation.push({
            stepName: step.name,
            expectedUrl: spec.urlPattern,
            expectedPayload: spec.payload,
            foundCount: matchingCalls.length,
            foundPayloads: matchingCalls.map(m => {
              try { return JSON.parse(m.postData); } catch (e) { return m.postData; }
            }),
            passed
          });
          
          console.log(`[Tracer] Telemetry check for "${step.name}": ${passed ? 'PASSED ✓' : 'FAILED ✗'}`);
        }
      }

      results[variantKey] = evaluation;
      await context.close();
    }
  } catch (error) {
    console.error(`[Tracer] Failed telemetry tracing:`, error);
    throw error;
  } finally {
    await browser.close();
  }

  return results;
}

