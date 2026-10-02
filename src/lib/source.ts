/**
 * Where the site reads its results from. `results/` normally; `make dev-sample` points RESULTS_DIR at generated
 * sample data instead, and the site then says so on every page. Build time only.
 */
export const resultsDir = process.env.RESULTS_DIR ?? './results';

export const isSample = process.env.RESULTS_DIR !== undefined && process.env.RESULTS_DIR !== './results';
