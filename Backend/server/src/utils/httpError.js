// Throw one of these from a route/service; the error middleware turns it into a JSON response.
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const badRequest = (msg, extra) => new HttpError(400, msg, extra);
const unauthorized = (msg = 'Login required') => new HttpError(401, msg);
const forbidden = (msg = 'You are not allowed to do this') => new HttpError(403, msg);
const notFound = (msg = 'Not found') => new HttpError(404, msg);
const conflict = (msg, extra) => new HttpError(409, msg, extra);
const unprocessable = (msg, fields) => new HttpError(422, msg, { fields });

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable };
