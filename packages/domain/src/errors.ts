/** Framework-free domain errors. HTTP mapping happens at the transport edge. */

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'validation_failed');
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`, 'not_found');
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'conflict');
  }
}

/** Same idempotency key (client doc id) reused for a DIFFERENT command
 *  payload. The Phase 3 contract: a retry is a replay only when the
 *  normalized request is identical — a recycled key carrying different
 *  business facts is a controlled conflict (HTTP 409), never a silent
 *  duplicate and never a replay of the ORIGINAL amount for a DIFFERENT
 *  request. */
export class IdempotencyKeyReuseError extends DomainError {
  constructor(message: string) {
    super(message, 'idempotency_key_reuse');
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'forbidden') {
    super(message, 'forbidden');
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'unauthorized') {
    super(message, 'unauthorized');
  }
}
