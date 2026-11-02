export interface SqlExecutor {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

export class VideoStudyError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
