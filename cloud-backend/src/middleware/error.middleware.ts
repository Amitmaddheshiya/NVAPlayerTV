import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', error);

  res.status(500).json({
    error: error.message || 'Internal server error',
  });
};

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ error: 'Route not found' });
};
