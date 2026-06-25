# A/B Test Verification & Visual Regression Audit Suite

An offline-first, private developer-centric verification suite for A/B testing and layout validation. This runner automates **local visual regression diffing**, **Figma design spec matching**, **telemetry analytics event tracing**, and **statistical cohort simulation** in a single unified pipeline. 

Powered locally and natively by **Playwright**, **Pixelmatch**, and **Express**. The suite is pre-configured with a premium, dynamic flight search widget demo inspired by **Norwegian.com/no/**.

---

## ⚙️ How to Customise for Any Project (`ab-config.json`)

To target your own website or any external project, you only need to update the options in `ab-config.json`. Below is the complete structure and a detailed guide on what to update.

```json
{
  "targetUrl": "http://localhost:3000",
  "figma": {
    "fileKey": "YOUR_FIGMA_FILE_KEY",
    "nodeId": "YOUR_DESIGN_FRAME_NODE_ID",
    "token": "YOUR_PERSONAL_ACCESS_TOKEN"
  },
  "sessionCookies": [
    {
      "name": "your_session_cookie_name",
      "value": "your_session_value",
      "domain": "localhost"
    }
  ],
  "variants": {
    "control": {
      "name": "control",
      "url": "http://localhost:3000",
      "cookie": {
        "name": "ab_variant",
        "value": "control"
      }
    },
    "variant": {
      "name": "variant",
      "url": "http://localhost:3000",
      "cookie": {
        "name": "ab_variant",
        "value": "variant"
      }
    }
  },
  "visual": {
    "browsers": ["chromium", "firefox", "webkit"],
    "viewports": [
      { "width": 1280, "height": 800, "name": "desktop" },
      { "width": 768, "height": 1024, "name": "tablet" },
      { "width": 375, "height": 667, "name": "mobile" }
    ],
    "selectors": ["body"],
    "mismatchThreshold": 0.01
  },
  "tracing": {
    "simulationSteps": [
      {
        "name": "Flight Search Landing Page View",
        "action": "navigate",
        "expectedTelemetry": {
          "urlPattern": "/api/telemetry",
          "payload": { "type": "pageview" }
        }
      },
      {
        "name": "Input Origin Airport",
        "action": "type",
        "selector": "#origin-input-placeholder",
        "value": "Oslo (OSL)"
      },
      {
        "name": "Input Destination Airport",
        "action": "type",
        "selector": "#destination-input-placeholder",
        "value": "London (LHR)"
      },
      {
        "name": "Click Search CTA Button",
        "action": "click",
        "selector": ".cta-button",
        "expectedTelemetry": {
          "urlPattern": "/api/telemetry",
          "payload": { "type": "conversion", "goal": "cta_click" }
        }
      }
    ]
  },
  "simulation": {
    "sampleSize": 2500,
    "scenarios": [
      {
        "name": "Variant - Successful Flight Booking Lift",
        "controlTrueRate": 0.12,
        "variantTrueRate": 0.156
      }
    ]
  }
}
```

---

### 📘 Reference Customization Guide

| Configuration Block | Parameter | What to Update / Purpose |
| :--- | :--- | :--- |
| **Global** | `targetUrl` | Set this to the main website domain under test (e.g., `https://www.yourwebsite.com`). |
| **Figma Matching** | `figma` | **To Disable**: Remove this block or set `"figma": null`. <br>**To Enable**: Provide your Figma Personal Access Token, File Key, and Frame Node ID to automatically pull design specs and compare against coded variations. See the [Figma Integration Guide](#figma-integration-guide) below for details. |
| **Session Cookies** | `sessionCookies` | If your site requires authentication, pass the session token name, value, and domain here so the automated runner bypasses login screens. |
| **Variants Definition** | `variants` | Maps the two comparison buckets. Update: <ul><li>`url`: The specific variant URL.</li><li>`cookie.name`: The cookie your site checks to bucket visitors (e.g., `experiment_bucket`).</li><li>`cookie.value`: The value assigning user to Control vs Variant (e.g., `A` vs `B`).</li></ul> |
| **Visual Regression**| `visual` | Customize the test coverage: <ul><li>`browsers`: Choose which engines to test (options: `chromium`, `firefox`, `webkit`).</li><li>`viewports`: Define testing viewport sizes.</li><li>`selectors`: Pass CSS selectors of specific widgets (e.g., `.search-card`) to snapshot them individually instead of doing a full-page check.</li><li>`mismatchThreshold`: Visual pixel divergence tolerance. `0.01` means 1% change is allowed; raise this (e.g., `0.05`) for pages with high dynamic content.</li></ul> |
| **Telemetry Tracing**| `tracing` | Automates the user flow and validates analytics: <ul><li>`action`: Actions to perform (`navigate`, `type`, `click`).</li><li>`selector`: CSS selectors of form fields and CTA buttons on the new site.</li><li>`value`: The text values to type into inputs.</li><li>`expectedTelemetry.urlPattern`: The network address/endpoint of your analytics collector (e.g., `/collect`, `/api/log`, `google-analytics.com`).</li><li>`expectedTelemetry.payload`: The exact key-value JSON parameters your page reports to the analytics collector to verify tracking works.</li></ul> |
| **Cohort Simulation**| `simulation` | Controls the mathematical Z-Test calculations for reports. Customize `scenarios` and rates (`controlTrueRate` / `variantTrueRate`) based on conversion metrics to verify when a Variant gets flagged as a Winner, Loser, or Inconclusive. |

---

### Figma Integration Guide

To automatically sync and compare your live web pages with your Figma design mocks, you will need to configure the `figma` block in `ab-config.json` with three parameters: `fileKey`, `nodeId`, and `token`.

#### 🔍 How to Extract Credentials from a Figma URL

Consider a typical Figma URL when you have a frame selected:
```
https://www.figma.com/design/XM8j1234abcd5678/My-Project-Designs?node-id=402-1249&t=ab12cd34...
```

1. **File Key (`fileKey`)**
   - **Where to find it:** It is the unique alphanumeric segment after `/design/` (or `/file/`) and before the file name.
   - **Example:** In the URL above, the `fileKey` is `XM8j1234abcd5678`.

2. **Node ID (`nodeId`)**
   - **Where to find it:** Look for the `node-id` query parameter in the URL when you select a specific frame or element.
   - **Important Formatting:** Figma URLs encode the colon (`:`) in Node IDs as a hyphen (`-`) (e.g., `node-id=402-1249`). However, the Figma API requires the original colon (`:`) format.
   - **Translation:** Replace the hyphen (`-`) with a colon (`:`).
   - **Example:** If the URL query parameter is `node-id=402-1249`, the value to use in `ab-config.json` is `402:1249`.

> [!TIP]
> Always select the parent frame of your component or page in Figma to get the exact Node ID representing the design spec you want to compare.

#### 🔑 How to Generate a Figma Personal Access Token (PAT)

1. Log in to your **Figma** account.
2. Click your profile avatar in the top-left (or top-right) corner of the Figma dashboard.
3. Select **Settings** (or **Personal Settings**).
4. Go to the **Account** tab and scroll down to the **Personal access tokens** section.
5. Enter a description for your token (e.g., `AB-Test-Verification-Suite`) and press **Enter** (or click **Generate token**).
6. Select the necessary scopes. For this verification suite:
   - **File content**: Select **Read** permission.
7. Click **Generate token**.
8. **Copy the token** immediately and save it securely. *Figma will not show this token again.*
9. Add the token to `ab-config.json` as the `token` parameter, or set it as an environment variable `FIGMA_TOKEN` to avoid storing secrets in configuration files.

---

## 🛠️ Prerequisites

- [Node.js](https://nodejs.org/) (Version 18 or higher recommended)
- Active internet connection (for initial dependencies and Playwright browser downloads)

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/Rahul23121995/ab-visual-testing.git
cd ab-visual-testing
```

### 2. Install Dependencies
Install the node packages and fetch Playwright's local browser binaries:
```bash
npm install
npx playwright install
```

### 3. Start the Target Application (Mock Demo Server)
Run the flight booking application server in the background (or target your own active application port):
```bash
npm start
```
*The mock application server will launch at `http://localhost:3000` representing the Norwegian.com inspired flight search widget.*

### 4. Run the Verification Audit Suite
In a new terminal window, execute the verifier runner:
```bash
npm run verify
```

Once the test run completes, you will find generated visual screenshots and comparative audit reports inside your project root:
* **Interactive Review Dashboard**: `reports/ab-experiment-report.html` (includes side-by-side grids, swipe sliders, and flash toggles)
* **Static Print Copy**: `reports/ab-experiment-report.pdf`
* **Visual Screenshot Captures**: `reports/visual/`

---

## 📂 Project Structure

```
├── ab-config.json          # Verifier configuration settings (customize for any website)
├── ab-verify.js            # Main execution pipeline orchestrator
├── demo-server.js          # Express app routing variant layouts & telemetry endpoints
├── demo-app/               # HTML template directories for Control & Variant variants
│   └── public/             # Coded styles and page files under test
├── src/                    # Source core verifier modules
│   ├── figma.js            # Figma API layout spec syncing module
│   ├── visual.js           # Playwright screenshot capture & pixelmatch comparison engine
│   ├── tracer.js           # User telemetry tracking event interception module
│   ├── reporter.js         # Premium HTML/PDF output generation scripts
│   └── utils/
│       └── stats.js        # A/B conversion lifts & Proportion Z-test helpers
└── reports/                # Visual diffs, screenshots, and compiled reports
```
