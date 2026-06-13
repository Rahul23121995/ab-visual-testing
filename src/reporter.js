import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

/**
 * Generates a high-fidelity interactive HTML report summarizing
 * visual regression, telemetry validation, and automated A/B statistical testing outcomes.
 */
export function generateHTMLReport(config, visualResults, tracerResults, statsScenarios) {
  const outputDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const reportPath = path.join(outputDir, 'ab-experiment-report.html');

  // Format visual result rows with interactive Percy-style review toolbars
  const visualCards = visualResults.map((res, idx) => {
    const browserName = res.browser || 'chromium';
    const cardIdStr = `${res.viewport}_${browserName}_${res.candidateName.replace(/\s+/g, '_')}`;
    const cardId = `card-${cardIdStr}`;
    const bestComp = res.comparisons[res.bestMatch];
    
    const statusClass = res.passed ? 'badge-success' : 'badge-danger';
    const statusText = res.passed ? 'Auto-Approved' : 'Requires Review';
    const browserBadge = `<span class="badge badge-neutral" style="background-color:rgba(99, 102, 241, 0.15); color:#a5b4fc; border:1px solid rgba(99, 102, 241, 0.3); font-weight:bold; text-transform:uppercase; margin-left:8px; vertical-align:middle;">${browserName}</span>`;
    
    // Generate baseline buttons
    const baselineButtons = Object.keys(res.comparisons).map((bName) => {
      const comp = res.comparisons[bName];
      const isBest = bName === res.bestMatch;
      const btnClass = isBest ? 'active' : '';
      const matchBadge = comp.passed ? '✓' : '✗';
      const badgeStyle = comp.passed ? 'color: var(--color-emerald)' : 'color: var(--color-crimson)';
      return `
        <button class="baseline-tab-btn ${btnClass}" 
                onclick="setBaselineTarget('${cardIdStr}', '${bName}', this)"
                data-baseline="${comp.baselineFile}" 
                data-diff="${comp.diffFile}"
                data-candidate="${res.candidateFile}"
                data-mismatch="${comp.mismatchPercentage}"
                data-pixels="${comp.mismatchedPixels}"
                data-status="${comp.passed ? 'PASSED' : 'FAILED'}">
          ${bName.toUpperCase()} <span style="${badgeStyle}; font-weight:bold; margin-left:4px;">(${matchBadge} ${comp.mismatchPercentage}%)</span>
        </button>
      `;
    }).join('');

    return `
      <div class="card visual-card" id="${cardId}">
        <div class="card-header">
          <div>
            <h3>Candidate Run: <span class="highlight-text-blue">${res.candidateName}</span> ${browserBadge}</h3>
            <p style="font-size:0.875rem; color:var(--text-secondary); margin-top:0.25rem;">Viewport: ${res.viewport.toUpperCase()} (${res.width}x${res.height}px)</p>
          </div>
          <span class="badge ${statusClass} status-badge">${statusText}</span>
        </div>
        
        <div class="stats-mini">
          <span>Closest Baseline Match: <strong class="display-match-name" style="color:var(--accent-indigo);">${res.bestMatch}</strong></span>
          <span>Mismatch Ratio: <strong class="display-mismatch ${res.passed ? 'text-success' : 'highlight-text'}">${res.bestMismatchPercentage}%</strong></span>
          <span>Mismatch Threshold: <strong>${(config.visual.mismatchThreshold * 100).toFixed(1)}%</strong></span>
          <span>Mismatched Pixels: <strong class="display-pixels ${res.passed ? '' : 'text-danger'}">${res.bestMismatchedPixels} px</strong></span>
        </div>

        <!-- Baseline variations review panel -->
        <div class="baseline-selector-container">
          <span class="tab-label">Compare with Baseline Variant:</span>
          <div class="baseline-tabs">
            ${baselineButtons}
          </div>
        </div>

        <!-- Percy-style inspector workspace tabs -->
        <div class="workspace-tabs-container" style="margin-top: 1rem;">
          <span class="tab-label">Visual Review Mode:</span>
          <div class="workspace-tabs">
            <button class="workspace-tab-btn active" onclick="switchVisualMode('${cardIdStr}', 'slider', this)">
              🎚️ Swipe Slider
            </button>
            <button class="workspace-tab-btn" onclick="switchVisualMode('${cardIdStr}', 'toggle', this)">
              🔄 Flash Toggle
            </button>
            <button class="workspace-tab-btn" onclick="switchVisualMode('${cardIdStr}', 'grid', this)">
              📊 Side-by-Side Grid
            </button>
          </div>
        </div>

        <!-- 1. SPLIT SCREEN SWIPE SLIDER PANEL -->
        <div class="percy-view-panel active" id="panel-slider-${cardIdStr}">
          <div class="swipe-container" id="swipe-container-${cardIdStr}">
            <!-- Selected Baseline Image (Before) -->
            <img src="${bestComp.baselineFile}" class="swipe-base" alt="Baseline Base" />
            
            <!-- Candidate Overlay Clip Container (After) -->
            <div class="swipe-overlay">
              <img src="${res.candidateFile}" alt="Candidate Overlay" />
            </div>
            
            <!-- Real Drag Handler -->
            <input type="range" class="swipe-slider" min="0" max="100" value="50" oninput="updateSwipeSlider(this)" />
            
            <!-- Visible vertical line handle -->
            <div class="swipe-handle">
              <div class="swipe-handle-circle">↔</div>
            </div>
          </div>
          <p class="panel-desc">Drag the slider horizontally to swipe and compare <strong>Baseline</strong> on the left and <strong>Candidate Build</strong> on the right.</p>
        </div>

        <!-- 2. INSTANT A/B TOGGLE PANEL -->
        <div class="percy-view-panel" id="panel-toggle-${cardIdStr}">
          <div class="toggle-viewer" id="toggle-viewer-${cardIdStr}">
            <div class="toggle-controls">
              <span class="toggle-filename-info">Select frame to inspect (or press <kbd>Space</kbd> / <kbd>Tab</kbd> to flash):</span>
              <div class="toggle-btn-group">
                <button class="toggle-btn active" onclick="setToggleImage('${cardIdStr}', 'control', this)" 
                        data-type="baseline"
                        data-control="${bestComp.baselineFile}" data-variant="${res.candidateFile}" data-diff="${bestComp.diffFile}">
                  Before (Baseline)
                </button>
                <button class="toggle-btn" onclick="setToggleImage('${cardIdStr}', 'variant', this)"
                        data-type="candidate"
                        data-control="${bestComp.baselineFile}" data-variant="${res.candidateFile}" data-diff="${bestComp.diffFile}">
                  After (Candidate)
                </button>
                <button class="toggle-btn highlight-btn" onclick="setToggleImage('${cardIdStr}', 'diff', this)"
                        data-type="diff"
                        data-control="${bestComp.baselineFile}" data-variant="${res.candidateFile}" data-diff="${bestComp.diffFile}">
                  Diff (Red Highlights)
                </button>
              </div>
            </div>
            <div class="toggle-image-container">
              <img src="${bestComp.baselineFile}" class="toggle-display-img" alt="Active View" />
            </div>
          </div>
          <p class="panel-desc">Click between buttons to toggle the screenshot in-place. Useful to spot micro layout jumps and element shifts.</p>
        </div>

        <!-- 3. TRADITIONAL SIDE BY SIDE GRID PANEL -->
        <div class="percy-view-panel" id="panel-grid-${cardIdStr}">
          <div class="image-grid">
            <div class="image-wrapper">
              <div class="img-label">BASELINE (BEFORE)</div>
              <a href="${bestComp.baselineFile}" target="_blank" class="grid-baseline-link">
                <img src="${bestComp.baselineFile}" class="grid-baseline" alt="Baseline view" />
              </a>
            </div>
            <div class="image-wrapper">
              <div class="img-label">CANDIDATE (AFTER)</div>
              <a href="${res.candidateFile}" target="_blank">
                <img src="${res.candidateFile}" alt="Candidate view" />
              </a>
            </div>
            <div class="image-wrapper highlight-wrapper">
              <div class="img-label">PIXEL DIFF (RED SPOTS)</div>
              <a href="${bestComp.diffFile}" target="_blank" class="grid-diff-link">
                <img src="${bestComp.diffFile}" class="grid-diff" alt="Diff view" />
              </a>
            </div>
          </div>
          <p class="panel-desc">Comparative side-by-side view displaying Baseline, Candidate, and Layout anomalies (highlighted in red) side by side.</p>
        </div>
      </div>
    `;
  }).join('');

  // Format telemetry tracer rows
  const generateTelemetryRows = (variantKey) => {
    return tracerResults[variantKey].map(step => {
      const statusClass = step.passed ? 'badge-success' : 'badge-danger';
      const statusIcon = step.passed ? '✓' : '✗';
      const expectedPayloadStr = JSON.stringify(step.expectedPayload, null, 2);
      const actualPayloadStr = step.foundPayloads.length > 0 
        ? JSON.stringify(step.foundPayloads[0], null, 2)
        : 'No event intercepted';
        
      return `
        <tr class="${step.passed ? 'row-passed' : 'row-failed'}">
          <td>
            <div class="step-name-cell">
              <span class="status-marker ${statusClass}">${statusIcon}</span>
              <strong>${step.stepName}</strong>
            </div>
          </td>
          <td><code>POST ${step.expectedUrl}</code></td>
          <td><pre class="code-payload">${expectedPayloadStr}</pre></td>
          <td><pre class="code-payload">${actualPayloadStr}</pre></td>
          <td><span class="badge ${statusClass}">${step.passed ? 'VERIFIED' : 'FAILED'}</span></td>
        </tr>
      `;
    }).join('');
  };

  // Build simulation scenarios HTML
  const scenarioSections = statsScenarios.map((sc, index) => {
    const isWinner = sc.stats.status === 'winner';
    const isLoser = sc.stats.status === 'loser';
    
    let decisionBadge = 'badge-neutral';
    let decisionText = 'CONTINUE TESTING';
    let cardAccent = 'accent-neutral';
    
    if (isWinner) {
      decisionBadge = 'badge-success';
      decisionText = 'AUTO-PROMOTE & ROLL OUT (100% Traffic)';
      cardAccent = 'accent-success';
    } else if (isLoser) {
      decisionBadge = 'badge-danger';
      decisionText = 'AUTO-HALT & SHIELD USER TRAFFIC';
      cardAccent = 'accent-danger';
    }

    // Mapping lift parameters to SVG coordinates
    const mapPercentageToX = (p) => {
      const minP = -0.15;
      const maxP = 0.35;
      const range = maxP - minP;
      const x = 40 + ((p - minP) / range) * 320;
      return Math.min(Math.max(x, 40), 360);
    };

    const cX = mapPercentageToX(sc.stats.lift);
    const cLowerX = mapPercentageToX(sc.stats.ciLower);
    const cUpperX = mapPercentageToX(sc.stats.ciUpper);
    const zeroX = mapPercentageToX(0);

    return `
      <div class="scenario-content ${index === 0 ? 'active' : ''}" id="scenario-${index}">
        <div class="scenario-summary-grid">
          <div class="summary-metric">
            <span class="metric-label">Control Conversions</span>
            <span class="metric-val">${sc.controlConversions} / ${sc.controlVisits}</span>
            <span class="metric-sub">CR: <strong> ${(sc.stats.controlCR * 100).toFixed(2)}%</strong></span>
          </div>
          
          <div class="summary-metric">
            <span class="metric-label">Variant Conversions</span>
            <span class="metric-val">${sc.variantConversions} / ${sc.variantVisits}</span>
            <span class="metric-sub">CR: <strong> ${(sc.stats.variantCR * 100).toFixed(2)}%</strong></span>
          </div>

          <div class="summary-metric">
            <span class="metric-label">Relative Improvement</span>
            <span class="metric-val ${sc.stats.lift >= 0 ? 'text-success' : 'text-danger'}">
              ${sc.stats.lift >= 0 ? '+' : ''}${(sc.stats.lift * 100).toFixed(2)}%
            </span>
            <span class="metric-sub">Z-Score: <strong>${sc.stats.zScore.toFixed(3)}</strong></span>
          </div>

          <div class="summary-metric">
            <span class="metric-label">Confidence & P-Value</span>
            <span class="metric-val">${sc.stats.confidence.toFixed(2)}%</span>
            <span class="metric-sub">p-value: <strong>${sc.stats.pValue.toFixed(5)}</strong></span>
          </div>
        </div>

        <div class="decision-alert ${cardAccent}">
          <div class="alert-icon">⚡</div>
          <div class="alert-body">
            <h4>Automated Decision: <span class="badge ${decisionBadge}">${decisionText}</span></h4>
            <p>${sc.stats.recommendation}</p>
          </div>
        </div>

        <div class="chart-container">
          <h4>Interval Chart: Relative Lift Estimate (Confidence Interval)</h4>
          <div class="chart-wrapper">
            <svg width="100%" height="90" viewBox="0 0 400 90">
              <!-- Grid background -->
              <rect x="10" y="5" width="380" height="80" rx="6" fill="#1e293b" stroke="#334155" stroke-dasharray="2 2" />
              
              <!-- Zero line (baseline) -->
              <line x1="${zeroX}" y1="10" x2="${zeroX}" y2="60" stroke="#f43f5e" stroke-width="2" stroke-dasharray="3 3" />
              <text x="${zeroX + 5}" y="20" fill="#f43f5e" font-size="10" font-weight="bold">Baseline (0% Lift)</text>

              <!-- CI line -->
              <line x1="${cLowerX}" y1="40" x2="${cUpperX}" y2="40" stroke="#6366f1" stroke-width="3" />
              <!-- CI End Caps -->
              <line x1="${cLowerX}" y1="30" x2="${cLowerX}" y2="50" stroke="#6366f1" stroke-width="3" />
              <line x1="${cUpperX}" y1="30" x2="${cUpperX}" y2="50" stroke="#6366f1" stroke-width="3" />
              
              <!-- Point estimate -->
              <circle cx="${cX}" cy="40" r="7" fill="#10b981" stroke="#f8fafc" stroke-width="1.5" />
              <text x="${cX - 15}" y="65" fill="#f8fafc" font-size="10" font-weight="bold">${(sc.stats.lift * 100).toFixed(1)}% Lift</text>

              <!-- Axis scales -->
              <text x="40" y="80" fill="#94a3b8" font-size="9">-15%</text>
              <text x="${zeroX - 10}" y="80" fill="#94a3b8" font-size="9">0%</text>
              <text x="260" y="80" fill="#94a3b8" font-size="9">+15%</text>
              <text x="360" y="80" fill="#94a3b8" font-size="9">+35%</text>
            </svg>
            <div class="chart-legend">
              <span class="legend-item"><span class="dot baseline"></span>Baseline</span>
              <span class="legend-item"><span class="dot range"></span>95% Confidence Interval [${(sc.stats.ciLower * 100).toFixed(1)}%, ${(sc.stats.ciUpper * 100).toFixed(1)}%]</span>
              <span class="legend-item"><span class="dot estimate"></span>Mean Lift</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A/B Test Verification & Automation Audit</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg-dark: #0f172a;
      --bg-card: #1e293b;
      --border-color: #334155;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      
      --accent-indigo: #6366f1;
      --accent-violet: #8b5cf6;
      
      --color-emerald: #10b981;
      --color-crimson: #ef4444;
      --color-amber: #f59e0b;
      
      --glass-bg: rgba(30, 41, 59, 0.7);
      --glass-border: rgba(51, 65, 85, 0.8);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-primary);
      font-family: 'Outfit', sans-serif;
      line-height: 1.6;
      padding: 2rem 0;
    }

    .container {
      max-width: 1100px;
      width: 95%;
      margin: 0 auto;
    }

    header {
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 2rem;
      margin-bottom: 2.5rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    header h1 {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 50%, var(--accent-indigo) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    header p {
      color: var(--text-secondary);
      font-size: 1.1rem;
      margin-top: 0.25rem;
    }

    .meta-box {
      background-color: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 0.75rem;
      padding: 0.75rem 1.25rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
      text-align: right;
    }

    .meta-box strong {
      color: var(--text-primary);
    }

    /* Tabs Layout */
    .tabs-header {
      display: flex;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 1.5rem;
      gap: 0.5rem;
    }

    .tab-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 1rem;
      font-weight: 600;
      padding: 0.75rem 1.5rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s ease;
    }

    .tab-btn:hover {
      color: var(--text-primary);
    }

    .tab-btn.active {
      color: var(--accent-indigo);
      border-bottom-color: var(--accent-indigo);
    }

    /* Cards */
    .card {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 1rem;
    }

    .card-header h2 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.015em;
    }

    .card-header h3 {
      font-size: 1.25rem;
      font-weight: 700;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .badge-success {
      background-color: rgba(16, 185, 129, 0.15);
      color: var(--color-emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .badge-danger {
      background-color: rgba(239, 68, 68, 0.15);
      color: var(--color-crimson);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .badge-neutral {
      background-color: rgba(148, 163, 184, 0.15);
      color: var(--text-secondary);
      border: 1px solid rgba(148, 163, 184, 0.3);
    }

    /* Image Grid for Visual Regression */
    .visual-card {
      margin-bottom: 1.5rem;
    }

    .stats-mini {
      display: flex;
      gap: 2rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin-top: -0.75rem;
      margin-bottom: 1.5rem;
      background-color: rgba(0, 0, 0, 0.2);
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border-color);
    }

    .stats-mini strong {
      color: var(--text-primary);
    }
    
    .highlight-text {
      color: var(--color-crimson);
    }
    
    .highlight-text-blue {
      color: #38bdf8;
    }
    
    .baseline-selector-container {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      border-bottom: 1px dashed var(--border-color);
      padding-bottom: 1rem;
      flex-wrap: wrap;
    }

    .baseline-tabs {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .baseline-tab-btn {
      background-color: rgba(15, 23, 42, 0.4);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 0.825rem;
      font-weight: 600;
      padding: 0.5rem 0.875rem;
      cursor: pointer;
      border-radius: 0.5rem;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
    }

    .baseline-tab-btn:hover {
      background-color: rgba(15, 23, 42, 0.8);
      color: var(--text-primary);
    }

    .baseline-tab-btn.active {
      background-color: var(--accent-indigo);
      color: var(--text-primary);
      border-color: var(--accent-indigo);
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
    }

    /* Percy Workspace Controls */
    .workspace-tabs-container {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    
    .tab-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-secondary);
    }
    
    .workspace-tabs {
      display: flex;
      background-color: #0f172a;
      padding: 0.25rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border-color);
    }
    
    .workspace-tab-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      padding: 0.375rem 1rem;
      cursor: pointer;
      border-radius: 0.375rem;
      transition: all 0.2s;
    }
    
    .workspace-tab-btn.active {
      background-color: var(--accent-indigo);
      color: var(--text-primary);
    }
    
    .percy-view-panel {
      display: none;
    }
    
    .percy-view-panel.active {
      display: block;
    }
    
    .panel-desc {
      color: var(--text-secondary);
      font-size: 0.825rem;
      margin-top: 0.75rem;
      text-align: center;
    }

    /* Mode 1: Swipe Slider CSS */
    .swipe-container {
      position: relative;
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      background-color: #0c111d;
    }

    .swipe-base {
      width: 100%;
      height: auto;
      display: block;
    }

    .swipe-overlay {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 50%;
      overflow: hidden;
      border-right: 3px solid var(--accent-indigo);
    }

    .swipe-overlay img {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      object-fit: cover;
      object-position: left top;
    }

    .swipe-slider {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: ew-resize;
      z-index: 10;
      margin: 0;
    }

    .swipe-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      width: 3px;
      background-color: var(--accent-indigo);
      pointer-events: none;
      z-index: 5;
    }

    .swipe-handle-circle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background-color: var(--accent-indigo);
      border: 2px solid var(--text-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-primary);
      font-weight: bold;
      font-size: 14px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    }

    /* Mode 2: Flash Toggle CSS */
    .toggle-viewer {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      background-color: #0c111d;
    }

    .toggle-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1.25rem;
      background-color: #1e293b;
      border-bottom: 1px solid var(--border-color);
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .toggle-filename-info {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .toggle-btn-group {
      display: flex;
      gap: 0.5rem;
    }

    .toggle-btn {
      background-color: #0f172a;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      font-family: inherit;
      font-weight: 600;
      padding: 0.375rem 0.875rem;
      font-size: 0.8rem;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .toggle-btn:hover {
      color: var(--text-primary);
    }

    .toggle-btn.active {
      background-color: var(--accent-indigo);
      color: var(--text-primary);
      border-color: var(--accent-indigo);
    }

    .toggle-btn.highlight-btn {
      border-color: rgba(239, 68, 68, 0.4);
    }
    
    .toggle-btn.highlight-btn.active {
      background-color: var(--color-crimson);
      border-color: var(--color-crimson);
    }

    .toggle-image-container {
      position: relative;
      width: 100%;
    }

    .toggle-image-container img {
      width: 100%;
      height: auto;
      display: block;
      background: repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 20px 20px;
    }

    /* Mode 3: Traditional Grid CSS */
    .image-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1.5rem;
    }

    .image-wrapper {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border-color);
      border-radius: 0.5rem;
      overflow: hidden;
      background-color: #0c111d;
    }

    .highlight-wrapper {
      border-color: rgba(239, 68, 68, 0.4);
    }

    .img-label {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.5rem;
      text-align: center;
      background-color: #0c111d;
      border-bottom: 1px solid var(--border-color);
      letter-spacing: 0.05em;
    }

    .image-wrapper img {
      width: 100%;
      height: auto;
      object-fit: contain;
      display: block;
      background: repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 20px 20px;
    }

    /* Telemetry Table styling */
    .table-container {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background-color: rgba(15, 23, 42, 0.6);
      padding: 1rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-secondary);
      border-bottom: 2px solid var(--border-color);
    }

    td {
      padding: 1rem;
      border-bottom: 1px solid var(--border-color);
      vertical-align: top;
      font-size: 0.9rem;
    }

    .step-name-cell {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .status-marker {
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
      font-weight: bold;
    }

    .code-payload {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      white-space: pre-wrap;
      word-break: break-all;
      background-color: #0c111d;
      padding: 0.5rem;
      border-radius: 0.375rem;
      border: 1px solid var(--border-color);
      max-height: 120px;
      overflow-y: auto;
      color: #94a3b8;
    }

    .row-passed {
      background-color: rgba(16, 185, 129, 0.02);
    }

    .row-failed {
      background-color: rgba(239, 68, 68, 0.02);
    }

    /* Simulator scenarios CSS */
    .scenario-content {
      display: none;
    }

    .scenario-content.active {
      display: block;
    }

    .scenario-summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .summary-metric {
      background-color: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
    }

    .metric-label {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }

    .metric-val {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .metric-sub {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .text-success {
      color: var(--color-emerald);
    }

    .text-danger {
      color: var(--color-crimson);
    }

    .decision-alert {
      display: flex;
      gap: 1rem;
      padding: 1.25rem;
      border-radius: 0.75rem;
      margin-bottom: 2rem;
      align-items: flex-start;
    }

    .accent-success {
      background-color: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .accent-danger {
      background-color: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.25);
    }

    .accent-neutral {
      background-color: rgba(148, 163, 184, 0.08);
      border: 1px solid rgba(148, 163, 184, 0.25);
    }

    .alert-icon {
      font-size: 1.5rem;
    }

    .alert-body h4 {
      font-size: 1.1rem;
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .alert-body p {
      font-size: 0.95rem;
      color: var(--text-secondary);
    }

    /* Charts UI */
    .chart-container {
      margin-top: 1.5rem;
    }

    .chart-container h4 {
      font-size: 1rem;
      margin-bottom: 1rem;
      color: var(--text-secondary);
    }

    .chart-wrapper {
      background-color: rgba(15, 23, 42, 0.4);
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      padding: 1.5rem;
    }

    .chart-legend {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-top: 1rem;
      font-size: 0.8rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-secondary);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .dot.baseline {
      background-color: var(--color-crimson);
    }

    .dot.range {
      background-color: var(--accent-indigo);
      border-radius: 2px;
      width: 16px;
      height: 4px;
    }

    .dot.estimate {
      background-color: var(--color-emerald);
    }

    @media (max-width: 850px) {
      .image-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
      }
      .scenario-summary-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media print {
      body {
        padding: 0;
        background-color: #0f172a !important; /* Keep premium dark theme in PDF */
        color: #f8fafc !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .container {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .card {
        background-color: #1e293b !important;
        border: 1px solid #334155 !important;
        box-shadow: none !important;
        page-break-inside: avoid;
        margin-bottom: 20px !important;
        padding: 1.5rem !important;
      }
      .card-header {
        border-bottom: 1px solid #334155 !important;
      }
      /* Hide interactive controls in print */
      .baseline-selector-container,
      .workspace-tabs-container,
      .workspace-tabs,
      .swipe-container,
      .toggle-viewer,
      .panel-desc,
      .tabs-header,
      button {
        display: none !important;
      }
      /* Force display side-by-side grid of visual comparisons */
      .percy-view-panel {
        display: none !important;
      }
      .percy-view-panel[id^="panel-grid-"] {
        display: block !important;
      }
      .image-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr 1fr !important;
        gap: 1rem !important;
      }
      .image-wrapper {
        border: 1px solid #334155 !important;
      }
      .img-label {
        background-color: #0c111d !important;
        border-bottom: 1px solid #334155 !important;
      }
      /* Stats tables */
      table, th, td {
        border-color: #334155 !important;
      }
      th {
        background-color: rgba(15, 23, 42, 0.6) !important;
      }
      .row-passed {
        background-color: rgba(16, 185, 129, 0.05) !important;
      }
      .row-failed {
        background-color: rgba(239, 68, 68, 0.05) !important;
      }
      .code-payload {
        background-color: #0c111d !important;
        border: 1px solid #334155 !important;
        color: #94a3b8 !important;
      }
      /* Make all telemetry views visible */
      .telemetry-tab-content {
        display: block !important;
        margin-bottom: 2rem;
      }
      /* Make all statistical scenario summaries visible */
      .scenario-content {
        display: block !important;
        page-break-inside: avoid;
        margin-bottom: 2rem;
      }
      .chart-wrapper {
        background-color: rgba(15, 23, 42, 0.4) !important;
        border: 1px solid #334155 !important;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>A/B Verification & Automation Audit</h1>
        <p>Percy-Style Visual Comparison, Goal Interception & Statistical Modeling Report</p>
      </div>
      <div class="meta-box">
        Target URL: <strong>${config.targetUrl}</strong><br />
        Generated: <strong>${new Date().toLocaleString()}</strong>
      </div>
    </header>

    <!-- SECTION 1: VISUAL VERIFICATION -->
    <section class="card">
      <div class="card-header">
        <h2>1. Percy-Style Visual Comparison</h2>
        <span class="badge badge-neutral">Layout Tests</span>
      </div>
      ${visualCards}
    </section>

    <!-- SECTION 2: TELEMETRY VERIFICATION -->
    <section class="card">
      <div class="card-header">
        <h2>2. Goal & Telemetry Request Interception</h2>
        <span class="badge badge-neutral">Analytics Audit</span>
      </div>
      
      <div class="tabs-header" style="margin-bottom: 1.5rem;">
        <button class="tab-btn active" onclick="switchTelemetryTab('control-tel', this)">CONTROL Telemetry</button>
        <button class="tab-btn" onclick="switchTelemetryTab('variant-tel', this)">VARIANT Telemetry</button>
      </div>

      <div class="table-container telemetry-tab-content" id="control-tel">
        <table>
          <thead>
            <tr>
              <th>User Simulation Goal / Step</th>
              <th>Network Endpoint Pattern</th>
              <th>Expected Payload Schema</th>
              <th>Actual Intercepted Payload</th>
              <th>Verification</th>
            </tr>
          </thead>
          <tbody>
            ${generateTelemetryRows('control')}
          </tbody>
        </table>
      </div>

      <div class="table-container telemetry-tab-content" id="variant-tel" style="display: none;">
        <table>
          <thead>
            <tr>
              <th>User Simulation Goal / Step</th>
              <th>Network Endpoint Pattern</th>
              <th>Expected Payload Schema</th>
              <th>Actual Intercepted Payload</th>
              <th>Verification</th>
            </tr>
          </thead>
          <tbody>
            ${generateTelemetryRows('variant')}
          </tbody>
        </table>
      </div>
    </section>

    <!-- SECTION 3: AUTOMATION MODELS -->
    <section class="card">
      <div class="card-header">
        <h2>3. Automated Statistical Models & Decisions</h2>
        <span class="badge badge-neutral">Decision Engine</span>
      </div>

      <div class="tabs-header">
        ${statsScenarios.map((sc, index) => `
          <button class="tab-btn ${index === 0 ? 'active' : ''}" onclick="switchScenarioTab('scenario-${index}', this)">
            ${sc.name}
          </button>
        `).join('')}
      </div>

      <div class="scenarios-container">
        ${scenarioSections}
      </div>
    </section>
  </div>

  <script>
    // Dynamic Baseline Variations selector logic
    function setBaselineTarget(cardId, baselineName, btn) {
      // Update active baseline button classes
      btn.parentElement.querySelectorAll('.baseline-tab-btn').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      const baselineUrl = btn.getAttribute('data-baseline');
      const diffUrl = btn.getAttribute('data-diff');
      const candidateUrl = btn.getAttribute('data-candidate');
      const mismatch = btn.getAttribute('data-mismatch');
      const pixels = btn.getAttribute('data-pixels');
      const status = btn.getAttribute('data-status');

      const card = document.getElementById('card-' + cardId);

      // Update card metadata displays
      card.querySelector('.display-match-name').textContent = baselineName;
      card.querySelector('.display-mismatch').textContent = mismatch + '%';
      card.querySelector('.display-pixels').textContent = pixels + ' px';
      
      const statusBadge = card.querySelector('.status-badge');
      if (status === 'PASSED') {
        statusBadge.textContent = 'Auto-Approved';
        statusBadge.className = 'badge badge-success status-badge';
        card.querySelector('.display-pixels').className = 'display-pixels';
        card.querySelector('.display-mismatch').className = 'display-mismatch text-success';
      } else {
        statusBadge.textContent = 'Requires Review';
        statusBadge.className = 'badge badge-danger status-badge';
        card.querySelector('.display-pixels').className = 'display-pixels text-danger';
        card.querySelector('.display-mismatch').className = 'display-mismatch highlight-text';
      }

      // 1. Update Swipe Slider Panel
      const swipeBase = card.querySelector('.swipe-base');
      if (swipeBase) swipeBase.src = baselineUrl;
      
      // 2. Update Flash Toggle Panel attributes
      const toggleBtnGroup = card.querySelector('.toggle-btn-group');
      if (toggleBtnGroup) {
        const beforeBtn = toggleBtnGroup.querySelector('[data-type="baseline"]');
        const afterBtn = toggleBtnGroup.querySelector('[data-type="candidate"]');
        const diffBtn = toggleBtnGroup.querySelector('[data-type="diff"]');

        beforeBtn.setAttribute('data-control', baselineUrl);
        beforeBtn.setAttribute('data-variant', candidateUrl);
        beforeBtn.setAttribute('data-diff', diffUrl);

        afterBtn.setAttribute('data-control', baselineUrl);
        afterBtn.setAttribute('data-variant', candidateUrl);
        afterBtn.setAttribute('data-diff', diffUrl);

        diffBtn.setAttribute('data-control', baselineUrl);
        diffBtn.setAttribute('data-variant', candidateUrl);
        diffBtn.setAttribute('data-diff', diffUrl);

        // Re-trigger visual update for active tab in Flash Toggle
        const activeToggle = toggleBtnGroup.querySelector('.toggle-btn.active');
        if (activeToggle) {
          activeToggle.click();
        }
      }

      // 3. Update Grid Panel links and images
      const gridBaseline = card.querySelector('.grid-baseline');
      if (gridBaseline) gridBaseline.src = baselineUrl;
      const gridDiff = card.querySelector('.grid-diff');
      if (gridDiff) gridDiff.src = diffUrl;
      
      const gridBaselineLink = card.querySelector('.grid-baseline-link');
      if (gridBaselineLink) gridBaselineLink.href = baselineUrl;
      const gridDiffLink = card.querySelector('.grid-diff-link');
      if (gridDiffLink) gridDiffLink.href = diffUrl;

      // Force align swipe overlay sizing
      const sliderInput = card.querySelector('.swipe-slider');
      if (sliderInput) {
        updateSwipeSlider(sliderInput);
      }
    }

    // Workspace visual review panel switcher
    function switchVisualMode(cardIdStr, mode, btn) {
      const parentCard = btn.closest('.visual-card');
      
      // Remove active from buttons in this viewport group
      btn.parentNode.querySelectorAll('.workspace-tab-btn').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      
      // Hide all panels in this card
      parentCard.querySelectorAll('.percy-view-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      
      // Show target panel
      const targetPanel = parentCard.querySelector('#panel-' + mode + '-' + cardIdStr);
      if (targetPanel) {
        targetPanel.classList.add('active');
        
        // If slider was loaded, trigger update to align sizes
        if (mode === 'slider') {
          const sliderInput = targetPanel.querySelector('.swipe-slider');
          if (sliderInput) {
            updateSwipeSlider(sliderInput);
          }
        }
      }
    }

    // Horizontal Swipe drag logic
    function updateSwipeSlider(slider) {
      const container = slider.parentElement;
      const baseImg = container.querySelector('.swipe-base');
      const overlayImg = container.querySelector('.swipe-overlay img');
      const overlayDiv = container.querySelector('.swipe-overlay');
      const handle = container.querySelector('.swipe-handle');
      
      const val = slider.value;
      const containerWidth = baseImg.clientWidth || 800;
      
      // Set variant image width to align pixels perfectly
      overlayImg.style.width = containerWidth + 'px';
      overlayImg.style.height = baseImg.clientHeight + 'px';
      
      // Crop variant overlay div
      overlayDiv.style.width = val + '%';
      
      // Move slider handle line
      handle.style.left = val + '%';
    }

    // Initialize overlay images sizing
    function initSwipeSliders() {
      document.querySelectorAll('.swipe-container').forEach(container => {
        const baseImg = container.querySelector('.swipe-base');
        const overlayImg = container.querySelector('.swipe-overlay img');
        
        const alignWidth = () => {
          const w = baseImg.clientWidth;
          const h = baseImg.clientHeight;
          if (w > 0) {
            overlayImg.style.width = w + 'px';
            overlayImg.style.height = h + 'px';
            
            // Trigger layout recalculation on slider
            const slider = container.querySelector('.swipe-slider');
            updateSwipeSlider(slider);
          }
        };
        
        if (baseImg.complete) {
          alignWidth();
        } else {
          baseImg.onload = alignWidth;
        }
        
        window.addEventListener('resize', alignWidth);
      });
    }

    // Instant Toggle (Flash) controller
    function setToggleImage(cardIdStr, mode, btn) {
      const panel = document.getElementById('panel-toggle-' + cardIdStr);
      const img = panel.querySelector('.toggle-display-img');
      
      const controlUrl = btn.getAttribute('data-control');
      const variantUrl = btn.getAttribute('data-variant');
      const diffUrl = btn.getAttribute('data-diff');
      
      if (mode === 'control') {
        img.src = controlUrl;
      } else if (mode === 'variant') {
        img.src = variantUrl;
      } else if (mode === 'diff') {
        img.src = diffUrl;
      }
      
      // Update active btn classes
      btn.parentElement.querySelectorAll('.toggle-btn').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    }

    // Telemetry tab switcher
    function switchTelemetryTab(tabId, btn) {
      document.querySelectorAll('.telemetry-tab-content').forEach(el => {
        el.style.display = 'none';
      });
      document.getElementById(tabId).style.display = 'block';
      
      btn.parentNode.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    }

    // Scenario tab switcher
    function switchScenarioTab(tabId, btn) {
      document.querySelectorAll('.scenario-content').forEach(el => {
        el.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');
      
      btn.parentNode.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    }

    // Keyboard bindings for easy comparison: toggle active view on Tab or Space click
    document.addEventListener('keydown', (e) => {
      // Toggle mode quick toggling
      if (e.key === ' ' || e.key === 'Tab') {
        const activePanel = document.querySelector('.percy-view-panel.active[id^="panel-toggle-"]');
        if (activePanel) {
          e.preventDefault();
          const buttons = Array.from(activePanel.querySelectorAll('.toggle-btn'));
          const activeIndex = buttons.findIndex(b => b.classList.contains('active'));
          const nextIndex = (activeIndex + 1) % buttons.length;
          buttons[nextIndex].click();
        }
      }
    });

    window.addEventListener('load', () => {
      setTimeout(initSwipeSliders, 500);
    });
  </script>
</body>
</html>
  `;

  fs.writeFileSync(reportPath, htmlContent);
  console.log(`[Reporter] Premium interactive HTML report successfully written to:`);
  console.log(`[Reporter] file://${reportPath.replace(/\\\\/g, '/')}`);
  return reportPath;
}

export async function generatePDFReport(htmlPath) {
  const pdfPath = htmlPath.replace('.html', '.pdf');
  console.log(`[Reporter] Launching browser to compile PDF report...`);
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage();
    const fileUrl = `file://${path.resolve(htmlPath)}`;
    console.log(`[Reporter] Loading report in printer view: ${fileUrl}`);
    
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    // Allow rendering engines/Z-charts to draw
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log(`[Reporter] Generating PDF file...`);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        bottom: '20px',
        left: '20px',
        right: '20px'
      }
    });
    console.log(`[Reporter] Premium static PDF report successfully written to:`);
    console.log(`[Reporter] file://${pdfPath.replace(/\\\\/g, '/')}`);
    return pdfPath;
  } catch (error) {
    console.error(`[Reporter] Failed to generate PDF report:`, error);
    throw error;
  } finally {
    await browser.close();
  }
}
