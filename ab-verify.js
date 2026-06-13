import fs from 'fs';
import path from 'path';
import { calculateZTest, simulateConversions } from './src/utils/stats.js';
import { runVisualRegression } from './src/visual.js';
import { traceTelemetry } from './src/tracer.js';
import { generateHTMLReport, generatePDFReport } from './src/reporter.js';

async function main() {
  console.log(`\n================================================================`);
  console.log(`🚀 STARTING A/B TESTING VERIFIER & AUTOMATION ENGINE (ab-verify)`);
  console.log(`================================================================\n`);

  // Read config file
  const configPath = path.join(process.cwd(), 'ab-config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`[Error] Configuration file 'ab-config.json' not found.`);
    process.exit(1);
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  try {
    // 1. Visual Verification (Percy-style layout diff)
    console.log(`--- [Step 1/4] Running Percy-Style Visual Comparison ---`);
    const visualResults = await runVisualRegression(config);

    // 1b. Figma-to-Code Design Specification Matcher
    if (config.figma) {
      console.log(`\n--- [Step 1b/4] Running Figma-to-Code Layout Matcher ---`);
      const { getFigmaDesignReference } = await import('./src/figma.js');
      const { compareImages } = await import('./src/visual.js');
      
      const designRef = await getFigmaDesignReference(config);
      if (designRef) {
        console.log(`[Figma] Reference design source: ${designRef.source}`);
        const figmaControlPath = path.join(process.cwd(), 'reports', 'visual', 'figma_vs_variant_control.png');
        const figmaVariantPath = path.join(process.cwd(), 'reports', 'visual', 'figma_vs_variant_variant.png');
        const figmaDiffPath = path.join(process.cwd(), 'reports', 'visual', 'figma_vs_variant_diff.png');

        // Copy downloaded design spec to control path representation
        fs.copyFileSync(designRef.path, figmaControlPath);

        // Copy desktop variant screenshot to variant path representation
        const desktopVariantPath = path.join(process.cwd(), 'reports', 'visual', 'desktop_chromium_candidate_candidate_variant_a.png');
        if (fs.existsSync(desktopVariantPath)) {
          fs.copyFileSync(desktopVariantPath, figmaVariantPath);

          console.log(`[Figma] Comparing Figma Design Spec against Coded Variant...`);
          const figmaComp = compareImages(figmaControlPath, figmaVariantPath, figmaDiffPath, 0.1);

          const maxAllowed = config.visual.mismatchThreshold || 0.05;
          const figmaPassed = figmaComp.mismatchRatio <= maxAllowed;

          console.log(`[Figma] Comparison outcomes: Mismatch = ${figmaComp.mismatchPercentage}% (Allowed = ${(maxAllowed * 100)}%). Passed = ${figmaPassed}`);

          visualResults.push({
            candidateName: 'Figma Design Spec Match',
            viewport: 'figma_vs_variant',
            width: figmaComp.width,
            height: figmaComp.height,
            passed: figmaPassed,
            bestMatch: 'figma_design_spec',
            bestMismatchPercentage: figmaComp.mismatchPercentage,
            bestMismatchedPixels: figmaComp.mismatchedPixels,
            candidateFile: `visual/figma_vs_variant_variant.png`,
            comparisons: {
              "figma_design_spec": {
                baselineFile: `visual/figma_vs_variant_control.png`,
                diffFile: `visual/figma_vs_variant_diff.png`,
                mismatchPercentage: figmaComp.mismatchPercentage,
                mismatchedPixels: figmaComp.mismatchedPixels,
                passed: figmaPassed
              }
            }
          });
        } else {
          console.warn(`[Figma Warning] Could not locate desktop_candidate_candidate_variant_a.png to compare against Figma Design.`);
        }
      }
    }

    // 2. Goal Telemetry tracing
    console.log(`\n--- [Step 2/4] Intercepting and Tracing Telemetry Goals ---`);
    const tracerResults = await traceTelemetry(config);

    // 3. Statistical Simulation Models
    console.log(`\n--- [Step 3/4] Running Statistical Cohort Simulation scenarios ---`);
    const statsScenarios = [];
    const { sampleSize, scenarios } = config.simulation;

    for (const sc of scenarios) {
      console.log(`Running Simulation: "${sc.name}"`);
      const controlVisits = sampleSize;
      const variantVisits = sampleSize;
      
      // Generate simulated user actions based on probability distributions
      const controlConversions = simulateConversions(controlVisits, sc.controlTrueRate);
      const variantConversions = simulateConversions(variantVisits, sc.variantTrueRate);

      // Perform proportion Z-Test
      const stats = calculateZTest(
        controlVisits,
        controlConversions,
        variantVisits,
        variantConversions
      );

      statsScenarios.push({
        name: sc.name,
        controlTrueRate: sc.controlTrueRate,
        variantTrueRate: sc.variantTrueRate,
        controlVisits,
        variantVisits,
        controlConversions,
        variantConversions,
        stats
      });

      console.log(`  └─ Conversion Delta: ${(stats.lift * 100).toFixed(2)}% | p-value: ${stats.pValue.toFixed(6)} | Decision: ${stats.status.toUpperCase()}`);
    }

    // 4. Render final report
    console.log(`\n--- [Step 4/4] Generating Interactive Experiment Report ---`);
    const reportPath = generateHTMLReport(config, visualResults, tracerResults, statsScenarios);
    
    // Generate PDF copy of report using print styles
    const pdfPath = await generatePDFReport(reportPath);

    // Complete terminal overview
    console.log(`\n================================================================`);
    console.log(`✅ A/B VERIFICATION AND SIMULATION CYCLE COMPLETED SUCCESSFULLY`);
    console.log(`================================================================`);
    
    const visPassed = visualResults.every(r => r.passed);
    console.log(`Visual Tests:       [${visPassed ? 'PASSED ✓' : 'FAILED ✗'}]`);
    
    const controlTelPassed = tracerResults.control.every(r => r.passed);
    const variantTelPassed = tracerResults.variant.every(r => r.passed);
    console.log(`Telemetry Tracing:  Control: [${controlTelPassed ? 'OK ✓' : 'FAILED ✗'}] | Variant: [${variantTelPassed ? 'OK ✓' : 'FAILED ✗'}]`);
    
    console.log(`HTML Audit Report:  file://${reportPath.replace(/\\\\/g, '/')}`);
    console.log(`PDF Static Report:  file://${pdfPath.replace(/\\\\/g, '/')}`);
    console.log(`================================================================\n`);

  } catch (error) {
    console.error(`\n[CRITICAL ERROR] Execution failed:`, error);
    process.exit(1);
  }
}

main();
