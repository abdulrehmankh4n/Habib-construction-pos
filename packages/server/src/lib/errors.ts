export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please sign in to continue') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (entity = 'Record') => new AppError(404, 'NOT_FOUND', `${entity} not found`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'BUSINESS_RULE', message, details);
