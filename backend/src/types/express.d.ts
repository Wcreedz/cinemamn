import type { HydratedDocument } from 'mongoose';
import type { IUser } from '../models';

declare global {
  namespace Express {
    interface Request { user?: HydratedDocument<IUser>; sessionFamily?: string }
  }
}
