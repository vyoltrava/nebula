export default {
  ci: {
    collect: {
      url: ["http://localhost:3000/", "http://localhost:3000/login"],
      numberOfRuns: 3,
      settings: { chromeFlags: "--no-sandbox --headless" },
    },
    upload: {
      startServerCommand: null,
      target: "filesystem",
      outputDir: "./lhci_reports",
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "first-contentful-paint": ["error", { maxNumericValue: 1800 }],
        "interactive": ["warn", { maxNumericValue: 3500 }],
      },
    },
  },
};