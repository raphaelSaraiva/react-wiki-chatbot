import metricsIndexPt from "./metricas_index_pt.json";
import metricsIndexEn from "./metricas_index_en.json";

const metricFilesPt = require.context("./metricas_pt", false, /\.json$/);
const metricFilesEn = require.context("./metricas_en", false, /\.json$/);

export function getMetricsIndex(language) {
  return language === "en" ? metricsIndexEn : metricsIndexPt;
}

export function getMetricFile(language, fileNameOnly) {
  const files = language === "en" ? metricFilesEn : metricFilesPt;
  return files(`./${fileNameOnly}`);
}
