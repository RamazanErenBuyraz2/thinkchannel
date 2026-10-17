import type { NextFunction, Request, RequestHandler, Response } from "express"

export function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next)
  }
}
