import { test, expect, Page } from "@playwright/test";
import { login } from "../src/loginSwitchFunctions";
import {
  initializePerformanceResults,
  testNavigation,
  calculatePerformanceMetrics,
  generatePerformanceSummary,
  displayResults,
  exportResults,
  exportToCSV,
  assertPerformanceThresholds,
  ALL_ROUTES,
  PerformanceMetrics,
} from "../src/webApp/performanceFunctions";

test.describe("Web App Navigation Performance Tests", () => {
  let performanceResults: PerformanceMetrics;

  test.beforeAll(async () => {
    // Ensure test-results directory exists
    try {
      const { mkdirSync } = await import("fs");
      mkdirSync("test-results", { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  });

  test("Navigation Performance Test", async ({ page }) => {
    test.setTimeout(300_000); // 5 minutes timeout

    // Initialize performance results
    performanceResults = initializePerformanceResults();

    // Login to the application
    console.log("Logging in to application...");
    await login(page, "admin");

    // Measure initial page load time
    console.log("Measuring initial page load time...");
    const initialLoadStart = performance.now();

    // Wait for the main dashboard to load
    await page.waitForSelector('h2:has-text("Devices")', { timeout: 30000 });

    const initialLoadTime = performance.now() - initialLoadStart;
    console.log(`Initial page load time: ${initialLoadTime.toFixed(2)}ms`);

    // Get initial page metrics with detailed breakdown
    const initialMetrics = await page.evaluate(() => {
      const navigationEntries = performance.getEntriesByType("navigation");
      const latestNavigation =
        navigationEntries.length > 0
          ? (navigationEntries[
              navigationEntries.length - 1
            ] as PerformanceNavigationTiming)
          : null;

      // Get resources with breakdown
      const resources = performance.getEntriesByType("resource");
      const totalWeight = resources.reduce((sum, resource) => {
        return sum + ((resource as any).encodedBodySize || 0);
      }, 0);

      const freshWeight = resources.reduce((sum, resource) => {
        return sum + ((resource as any).transferSize || 0);
      }, 0);

      // Get resource breakdown by type
      const resourceBreakdown = resources.reduce(
        (acc, resource) => {
          const url = (resource as any).name || "";
          const size = (resource as any).encodedBodySize || 0;

          if (url.includes(".js") || url.includes("script"))
            acc.scripts += size;
          else if (url.includes(".css") || url.includes("style"))
            acc.styles += size;
          else if (
            url.includes(".png") ||
            url.includes(".jpg") ||
            url.includes(".svg") ||
            url.includes(".gif")
          )
            acc.images += size;
          else if (
            url.includes(".woff") ||
            url.includes(".ttf") ||
            url.includes(".otf")
          )
            acc.fonts += size;
          else acc.other += size;

          return acc;
        },
        { scripts: 0, styles: 0, images: 0, fonts: 0, other: 0 }
      );

      // Get memory usage
      const memory = (performance as any).memory;

      return {
        totalPageWeightKb: `${Math.round(totalWeight / 1024)}KB`,
        freshWeightKb: `${Math.round(freshWeight / 1024)}KB`,
        resourceCount: resources.length,
        navigationType: latestNavigation?.type || "Unknown",
        resourceBreakdown: {
          scripts: `${Math.round(resourceBreakdown.scripts / 1024)}KB`,
          styles: `${Math.round(resourceBreakdown.styles / 1024)}KB`,
          images: `${Math.round(resourceBreakdown.images / 1024)}KB`,
          fonts: `${Math.round(resourceBreakdown.fonts / 1024)}KB`,
          other: `${Math.round(resourceBreakdown.other / 1024)}KB`,
        },
        memoryUsage: memory
          ? {
              used: `${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB`,
              total: `${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB`,
              limit: `${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB`,
            }
          : null,
      };
    });

    console.log(
      `Initial page metrics: ${initialMetrics.totalPageWeightKb} total/${initialMetrics.freshWeightKb} fresh [${initialMetrics.resourceCount} resources]`
    );
    console.log(
      `Resource breakdown: Scripts: ${initialMetrics.resourceBreakdown.scripts}, Styles: ${initialMetrics.resourceBreakdown.styles}, Images: ${initialMetrics.resourceBreakdown.images}, Fonts: ${initialMetrics.resourceBreakdown.fonts}, Other: ${initialMetrics.resourceBreakdown.other}`
    );
    if (initialMetrics.memoryUsage) {
      console.log(
        `Memory usage: Used: ${initialMetrics.memoryUsage.used}, Total: ${initialMetrics.memoryUsage.total}, Limit: ${initialMetrics.memoryUsage.limit}`
      );
    }
    console.log("Successfully logged in and dashboard loaded");

    // Add initial load as first result
    const initialLoadResult = {
      route: "Initial Load",
      durationMs: Math.round(initialLoadTime),
      timestamp: new Date().toISOString(),
      success: true,
      navigationType: initialMetrics.navigationType,
      totalPageWeightKb: initialMetrics.totalPageWeightKb,
      freshWeightKb: initialMetrics.freshWeightKb,
      resourceCount: initialMetrics.resourceCount,
      resourceBreakdown: initialMetrics.resourceBreakdown,
      memoryUsage: initialMetrics.memoryUsage,
      flowName: "Legacy Kai Navigation",
    };

    performanceResults.results.push(initialLoadResult);
    performanceResults.totalTests++;
    performanceResults.successfulTests++;

    // Create route sequence: all routes + circle back to Devices (exclude first Devices since it's preloaded)
    const routeSequence = [
      ...ALL_ROUTES.filter((route) => route.label !== "Devices").map(
        (route) => route.label
      ),
      "Devices",
    ];
    console.log(
      `Testing navigation through all routes and circling back to Devices: ${routeSequence.join(
        " → "
      )}`
    );

    // Test each route in sequence
    for (const routeName of routeSequence) {
      const result = await testNavigation(page, routeName);
      performanceResults.results.push(result);
      performanceResults.totalTests++;

      if (result.success) {
        performanceResults.successfulTests++;
      } else {
        performanceResults.failedTests++;
      }
    }

    // Calculate and display results
    calculatePerformanceMetrics(performanceResults);
    generatePerformanceSummary(performanceResults);
    displayResults(
      performanceResults,
      "Legacy Kai Navigation Performance Test"
    );
    exportResults(performanceResults, "legacy-kai-navigation");
    exportToCSV(performanceResults, "Legacy Kai Navigation");
    assertPerformanceThresholds(performanceResults);
  });
});
