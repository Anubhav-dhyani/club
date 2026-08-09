export function notFound(req, _res, next) {
  const error = new Error(`Not found: ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

export function errorHandler(error, _req, res, _next) {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || 'Server error',
    details: process.env.NODE_ENV === 'production' ? undefined : error.stack
  });
}
