import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RealIpMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const cfConnectingIp = req.headers['cf-connecting-ip'] as
      | string
      | undefined;
    const xRealIp = req.headers['x-real-ip'] as string | undefined;
    const realIp = cfConnectingIp || xRealIp || req.ip;

    if (realIp && realIp !== req.ip) {
      Object.defineProperty(req, 'ip', {
        get: () => realIp,
        configurable: true,
      });
    }

    next();
  }
}
