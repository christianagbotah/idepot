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
