export class QuicklookError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class QuicklookInputError extends QuicklookError {
  constructor(message: string, options?: ErrorOptions) {
    super("INPUT_ERROR", message, options);
  }
}

export class QuicklookUnsupportedError extends QuicklookError {
  constructor(message: string, options?: ErrorOptions) {
    super("UNSUPPORTED", message, options);
  }
}

export class QuicklookDependencyError extends QuicklookError {
  constructor(message: string, options?: ErrorOptions) {
    super("MISSING_DEPENDENCY", message, options);
  }
}

export class QuicklookRenderError extends QuicklookError {
  constructor(message: string, options?: ErrorOptions) {
    super("RENDER_ERROR", message, options);
  }
}
