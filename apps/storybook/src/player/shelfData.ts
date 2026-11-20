import { type ShelfResponse, ShelfResponseSchema } from "../../worker/api/schemas";

export type ShelfBook = ShelfResponse["books"][number];

// The shelf cannot be loaded. The shelf shows its Failed state.
export class ShelfUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShelfUnavailableError";
  }
}

// One shelf request (`GET`): no query, no body, no init object (SYS-04.S4).
// Anything but a 200 with a body of the shelf schema is a failure
// (design "9"). The books keep the order of the response.
export async function fetchShelf(fetchImpl: typeof fetch = fetch): Promise<ShelfBook[]> {
  let response: Response;
  try {
    response = await fetchImpl("/api/shelf");
  } catch {
    throw new ShelfUnavailableError("the request failed");
  }
  if (response.status !== 200) throw new ShelfUnavailableError(`status ${response.status}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ShelfUnavailableError("not JSON");
  }
  const result = ShelfResponseSchema.safeParse(body);
  if (!result.success) throw new ShelfUnavailableError("schema");
  return result.data.books;
}
