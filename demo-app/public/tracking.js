// Client side telemetry tracer
(function () {
  // Read cookie helper
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return 'unknown';
  }

  const variant = getCookie('ab_variant') || 'control';

  // Send event helper
  function sendEvent(type, goal = null) {
    const payload = {
      type: type,
      variant: variant,
      timestamp: new Date().toISOString()
    };
    if (goal) {
      payload.goal = goal;
    }

    console.log(`[Telemetry Sent] type=${type}, goal=${goal}, variant=${variant}`);

    // Call express backend
    fetch('/api/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).catch(err => console.error('Error sending telemetry:', err));
  }

  // Auto fire page view on script load
  window.addEventListener('DOMContentLoaded', () => {
    sendEvent('pageview');

    // Attach click listener to button
    const ctaButton = document.querySelector('.cta-button');
    if (ctaButton) {
      ctaButton.addEventListener('click', (e) => {
        sendEvent('conversion', 'cta_click');
        
        // Show success animation/alert
        const originalText = ctaButton.textContent;
        ctaButton.textContent = 'Purchased Successfully!';
        ctaButton.style.opacity = '0.8';
        ctaButton.disabled = true;
        
        setTimeout(() => {
          ctaButton.textContent = originalText;
          ctaButton.style.opacity = '1';
          ctaButton.disabled = false;
        }, 3000);
      });
    }
  });
})();
