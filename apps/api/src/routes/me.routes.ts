import {
  changePasswordSchema,
  savedTravellerIdSchema,
  savedTravellerSchema,
  updateProfileSchema,
} from '@zproo/validation';
import { Router, type RequestHandler } from 'express';
import type { createMeController } from '../controllers/me.controller';
import { validate } from '../middleware/validate';

export function meRoutes(
  controller: ReturnType<typeof createMeController>,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', controller.get);
  router.patch('/', validate({ body: updateProfileSchema }), controller.update);
  router.post('/password', validate({ body: changePasswordSchema }), controller.changePassword);
  // Saved travellers (SOP §6.3): PUT saves or updates by name.
  router.get('/travellers', controller.travellers);
  router.put('/travellers', validate({ body: savedTravellerSchema }), controller.saveTraveller);
  router.delete(
    '/travellers/:id',
    validate({ params: savedTravellerIdSchema }),
    controller.removeTraveller,
  );
  return router;
}
