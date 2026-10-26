/** ADR-0002 benchmark contracts. Benchmarks live OUTSIDE production packages. */

export interface DimensionResult {
  id: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7';
  name: string;
  pass: boolean;
  /** wall-clock ms of the measured operation (where meaningful) */
  ms: number;
  detail: string;
}

export interface CandidateReport {
  candidate: string;
  connection: 'app-role (least privilege)';
  dimensions: DimensionResult[];
  allPass: boolean;
}

export interface BenchResults {
  generatedAt: string;
  node: string;
  postgres: string;
  bulkRows: number;
  criteria: string;
  candidates: CandidateReport[];
}

export interface BenchCandidate {
  name: string;
  /** connect + candidate-native migrations + DDL from BENCH_SCHEMA_SQL */
  setup(database: BenchDatabase): Promise<void>;
  run(database: BenchDatabase): Promise<DimensionResult[]>;
  close(): Promise<void>;
}

export interface BenchDatabase {
  name: string;
  adminUrl: string;
  appUrl: string;
}
