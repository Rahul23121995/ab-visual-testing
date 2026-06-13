/**
 * Statistical utilities for A/B testing proportion tests (Z-Test)
 */

// Cumulative Standard Normal Distribution Approximation (CDF)
// Precise mathematical approximation for standard normal curves
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.39894228 * Math.exp(-x * x / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  if (x > 0) return 1 - p;
  return p;
}

/**
 * Perform a two-sample Z-Test for proportions
 * @param {number} controlVisits
 * @param {number} controlConversions
 * @param {number} variantVisits
 * @param {number} variantConversions
 * @param {number} alpha Significance level (default: 0.05 for 95% confidence)
 */
export function calculateZTest(controlVisits, controlConversions, variantVisits, variantConversions, alpha = 0.05) {
  const controlCR = controlVisits > 0 ? controlConversions / controlVisits : 0;
  const variantCR = variantVisits > 0 ? variantConversions / variantVisits : 0;
  
  const lift = controlCR > 0 ? (variantCR - controlCR) / controlCR : 0;
  
  if (controlVisits === 0 || variantVisits === 0) {
    return {
      controlCR,
      variantCR,
      lift,
      zScore: 0,
      pValue: 1,
      confidence: 0,
      significant: false,
      ciLower: 0,
      ciUpper: 0,
      status: 'insufficient_data',
      recommendation: 'Collect more traffic data to perform analysis.'
    };
  }

  // Standard Error of the difference between the two proportions
  // SE = sqrt( p_c*(1-p_c)/n_c + p_v*(1-p_v)/n_v )
  const se = Math.sqrt(
    (controlCR * (1 - controlCR) / controlVisits) + 
    (variantCR * (1 - variantCR) / variantVisits)
  );

  // Z-Score calculation
  const zScore = se > 0 ? (variantCR - controlCR) / se : 0;
  
  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
  
  // Confidence level percentage
  const confidence = (1 - pValue) * 100;
  
  const significant = pValue < alpha;

  // Z critical value based on alpha (confidence level)
  // Default values mapping
  let zCritical = 1.96; // 95% confidence
  if (alpha === 0.01) zCritical = 2.576; // 99%
  else if (alpha === 0.1) zCritical = 1.645; // 90%

  // Confidence Interval of the absolute difference
  const marginOfError = zCritical * se;
  const diff = variantCR - controlCR;
  const ciLower = diff - marginOfError;
  const ciUpper = diff + marginOfError;

  // Decide recommendation
  let status = 'neutral';
  let recommendation = 'No statistically significant difference detected yet. Continue testing.';

  if (significant) {
    if (zScore > 0) {
      status = 'winner';
      recommendation = `Variant is a WINNER with ${(100 - pValue * 100).toFixed(2)}% confidence! Roll out to 100% traffic.`;
    } else {
      status = 'loser';
      recommendation = `Variant is a LOSER with ${(100 - pValue * 100).toFixed(2)}% confidence. Halt the experiment to protect conversion.`;
    }
  } else if (controlConversions > 100 && variantConversions > 100) {
    // If we have a reasonable sample size but no significance
    status = 'inconclusive';
    recommendation = 'Results are inconclusive. Variants perform similarly. Consider stopping or iterating.';
  }

  return {
    controlCR,
    variantCR,
    lift,
    zScore,
    pValue,
    confidence,
    significant,
    ciLower,
    ciUpper,
    marginOfError,
    status,
    recommendation
  };
}

/**
 * Simulates a run of conversion events using binomial distribution approximation
 * to generate realistic test data for A/B tests.
 */
export function simulateConversions(visits, trueRate) {
  let conversions = 0;
  for (let i = 0; i < visits; i++) {
    if (Math.random() < trueRate) {
      conversions++;
    }
  }
  return conversions;
}
