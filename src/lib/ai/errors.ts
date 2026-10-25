export class AiUnavailableError extends Error {
  override name = "AiUnavailableError";
}

/** The model replied, but not with what we asked for. */
export class AiResponseError extends Error {
  override name = "AiResponseError";
}

/** The provider refused or failed the request (auth, quota, outage). */
export class AiProviderError extends Error {
  override name = "AiProviderError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
