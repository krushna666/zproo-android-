import { Permission, ServiceType } from '@zproo/types';
import { couponCodeSchema } from '@zproo/validation';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requestContext } from '../controllers/auth.controller';
import { authorize, requireAuth } from '../middleware/auth';
import { validate, validated } from '../middleware/validate';
import type { CouponService } from '../services/coupon.service';
import type { RbacService } from '../services/rbac.service';
import { sendSuccess } from '../utils/response';
import { referenceParams } from './commerce.routes';

const bookingRef = referenceParams.shape.reference;

export function couponRoutes(
  coupons: CouponService,
  authenticate: RequestHandler,
  rbac: RbacService,
): Router {
  const router = Router();
  router.get(
    '/',
    validate({
      query: z.strictObject({
        service: z.enum([ServiceType.BUS, ServiceType.FLIGHT, ServiceType.HOTEL]).optional(),
      }),
    }),
    async (req, res) => {
      const { service } = validated<{ service?: 'BUS' | 'FLIGHT' | 'HOTEL' }>(req, 'query');
      sendSuccess(res, await coupons.listActive(service));
    },
  );

  router.use(authenticate, authorize(rbac, Permission.BOOKING_CREATE));
  router.post(
    '/apply',
    validate({ body: z.strictObject({ bookingRef, code: couponCodeSchema }) }),
    async (req, res) => {
      const { bookingRef: ref, code } = validated<{ bookingRef: string; code: string }>(
        req,
        'body',
      );
      sendSuccess(
        res,
        await coupons.apply(requireAuth(req).userId, ref, code, requestContext(req)),
        'Coupon applied',
      );
    },
  );
  router.post('/remove', validate({ body: z.strictObject({ bookingRef }) }), async (req, res) => {
    const { bookingRef: ref } = validated<{ bookingRef: string }>(req, 'body');
    sendSuccess(res, await coupons.remove(requireAuth(req).userId, ref), 'Coupon removed');
  });
  return router;
}
